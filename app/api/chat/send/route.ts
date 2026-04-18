import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'
import { classifyContent, filterTier3, type ContentTier } from '@/lib/content-classifier'
import { autoDisableChat, recordFlaggedMessage } from '@/lib/event-moderation'

/**
 * Server-side chat send pipeline.
 *
 * This is the ONLY path allowed to insert into public.messages. The client no
 * longer writes directly — doing so would bypass every check below.
 *
 * Enforcement order (cheapest → most expensive):
 *   1. Auth present                     → 401
 *   2. Content sane (length, not empty) → 400
 *   3. Per-user rate limit (in-process) → 429
 *   4. Chat globally enabled for event  → 423
 *   5. User has a non-empty full_name   → 403
 *   6. User is not banned (chat_bans)   → 403
 *   7. User is not muted (user_events)  → 403
 *   8. Content tiered classifier:
 *        TIER_1 → permanent ban + reject
 *        TIER_2 → instant mute + reject
 *        TIER_3 → strike (3 → auto-mute for event)
 *   9. Exact-duplicate cooldown         → 429
 *  10. Event-level circuit breaker      → auto-disable chat if tripped
 *  11. Insert via service role          → 200
 *
 * The in-process rate limit is intentionally simple — a Map keyed by user_id.
 * For 40k simultaneous users this is fine at the scale of one Vercel instance
 * (each instance has its own map, so the effective limit is per-instance, but
 * the ban/mute checks plus the per-user exact-duplicate rule are enough to
 * stop the worst abuse). If we see distributed spam we can swap this for
 * Upstash Redis later.
 */

const MAX_LEN = 500
const PER_USER_MIN_INTERVAL_MS = 2_000           // 1 msg / 2s floor
const PER_USER_WINDOW_MS = 60_000                // 60s window
const PER_USER_WINDOW_LIMIT = 12                 // max msgs per window
const DUPLICATE_WINDOW_MS = 15_000               // block identical msg within 15s
const STRIKE_WINDOW_MS = 24 * 60 * 60_000        // 24h strike decay — was 5min, users learned to respace
const STRIKE_THRESHOLD = 3                       // 3 strikes → auto-mute

type RateBucket = {
  lastAt: number
  timestamps: number[]
  lastContent: string
  lastContentAt: number
}

// Module-scoped. Survives across requests within the same serverless instance.
const buckets = new Map<string, RateBucket>()

function getBucket(userId: string): RateBucket {
  let b = buckets.get(userId)
  if (!b) {
    b = { lastAt: 0, timestamps: [], lastContent: '', lastContentAt: 0 }
    buckets.set(userId, b)
  }
  return b
}

// Opportunistic pruning to keep the map bounded
function pruneBuckets() {
  if (buckets.size < 10_000) return
  const now = Date.now()
  for (const [uid, b] of buckets.entries()) {
    if (now - b.lastAt > PER_USER_WINDOW_MS * 5) buckets.delete(uid)
  }
}

/**
 * Apply TIER_1 (instant ban) for a user on the given event.
 * Uses upsert so if a prior ban exists, it gets reactivated with the AUTO tag.
 */
async function applyInstantBan(
  supabaseAdmin: SupabaseClient,
  userId: string,
  eventId: string,
  reason: string,
) {
  // banned_by references auth.users NOT NULL. For auto-bans we use the
  // offender's own ID — the "reason" text tags it as AUTO_BAN so humans
  // can filter for it in /admin/comms. This avoids needing a synthetic
  // system user in auth.users.
  await supabaseAdmin
    .from('chat_bans')
    .upsert(
      {
        user_id: userId,
        event_id: eventId,
        banned_by: userId,
        reason,
        expires_at: null,       // permanent
        is_active: true,
        banned_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' },
    )
}

async function applyInstantMute(
  supabaseAdmin: SupabaseClient,
  userId: string,
  eventId: string,
) {
  await supabaseAdmin
    .from('user_events')
    .update({ is_muted: true })
    .eq('user_id', userId)
    .eq('event_id', eventId)
}

export async function POST(request: NextRequest) {
  try {
    const callerId = getCallerId(request)
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
    }

    const rawContent = typeof body.content === 'string' ? body.content : ''
    const eventId = typeof body.event_id === 'string' ? body.event_id : null
    const venueId = typeof body.venue_id === 'string' ? body.venue_id : null
    const isGeneral = body.is_general === true

    const content = rawContent.trim()

    if (!content) {
      return NextResponse.json({ error: 'Mensaje vacio' }, { status: 400 })
    }
    if (content.length > MAX_LEN) {
      return NextResponse.json({ error: `Mensaje demasiado largo (max ${MAX_LEN})` }, { status: 400 })
    }
    if (isGeneral && !venueId) {
      return NextResponse.json({ error: 'venue_id requerido' }, { status: 400 })
    }
    if (!isGeneral && !eventId) {
      return NextResponse.json({ error: 'event_id requerido' }, { status: 400 })
    }

    // ── Rate limit (cheapest check after parsing) ──────────────────────────
    const now = Date.now()
    const bucket = getBucket(callerId)

    if (now - bucket.lastAt < PER_USER_MIN_INTERVAL_MS) {
      return NextResponse.json(
        { error: 'Vas muy rapido, espera un momento' },
        { status: 429 },
      )
    }

    bucket.timestamps = bucket.timestamps.filter((t) => now - t < PER_USER_WINDOW_MS)
    if (bucket.timestamps.length >= PER_USER_WINDOW_LIMIT) {
      return NextResponse.json(
        { error: 'Has enviado demasiados mensajes, espera un minuto' },
        { status: 429 },
      )
    }

    // Duplicate content in a short window → block (anti-spam)
    if (
      bucket.lastContent === content.toLowerCase() &&
      now - bucket.lastContentAt < DUPLICATE_WINDOW_MS
    ) {
      return NextResponse.json(
        { error: 'No repitas el mismo mensaje' },
        { status: 429 },
      )
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Kill-switch: is chat enabled for this event? ────────────────────────
    if (!isGeneral && eventId) {
      const { data: ev } = await supabaseAdmin
        .from('events')
        .select('id, chat_enabled')
        .eq('id', eventId)
        .maybeSingle()
      if (!ev) {
        return NextResponse.json({ error: 'Evento no existe' }, { status: 404 })
      }
      if (ev.chat_enabled === false) {
        return NextResponse.json(
          { error: 'El chat esta desactivado por un moderador' },
          { status: 423 },
        )
      }
    }

    // ── User sanity: profile exists + has full_name ────────────────────────
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, full_name, profanity_strikes, last_strike_at')
      .eq('id', callerId)
      .maybeSingle()

    if (userErr || !userRow) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const name = (userRow.full_name || '').trim()
    if (!name) {
      return NextResponse.json(
        { error: 'Debes completar tu nombre en tu perfil antes de escribir' },
        { status: 403, headers: { 'X-Reason': 'NO_NAME' } },
      )
    }

    // ── Ban check ──────────────────────────────────────────────────────────
    if (eventId) {
      const { data: ban } = await supabaseAdmin
        .from('chat_bans')
        .select('id, expires_at, is_active')
        .eq('user_id', callerId)
        .eq('event_id', eventId)
        .eq('is_active', true)
        .maybeSingle()

      if (ban) {
        const expired = ban.expires_at && new Date(ban.expires_at) <= new Date()
        if (expired) {
          // Lazily deactivate the expired ban
          await supabaseAdmin.from('chat_bans').update({ is_active: false }).eq('id', ban.id)
        } else {
          return NextResponse.json(
            { error: 'Estas bloqueado del chat de este evento' },
            { status: 403, headers: { 'X-Reason': 'BANNED' } },
          )
        }
      }
    }

    // ── Mute check (per-event) ─────────────────────────────────────────────
    if (eventId) {
      const { data: membership } = await supabaseAdmin
        .from('user_events')
        .select('is_muted')
        .eq('user_id', callerId)
        .eq('event_id', eventId)
        .maybeSingle()

      if (membership?.is_muted) {
        return NextResponse.json(
          { error: 'Estas silenciado por un moderador' },
          { status: 403, headers: { 'X-Reason': 'MUTED' } },
        )
      }
    }

    // ── Tiered content classification ──────────────────────────────────────
    const classification = classifyContent(content)

    if (classification) {
      const tier: ContentTier = classification.tier

      // Record for event-level circuit breaker stats (not general chat)
      let breakerTripped: { tripped: boolean; reason?: string } = { tripped: false }
      if (!isGeneral && eventId) {
        breakerTripped = recordFlaggedMessage(eventId, callerId)
      }

      // ── TIER 1 — INSTANT BAN ────────────────────────────────────────────
      if (tier === 1) {
        const reason =
          `AUTO_BAN tier 1 [${classification.category}] match="${classification.match}" ` +
          `fecha=${new Date(now).toISOString()}`

        if (eventId) {
          await applyInstantBan(supabaseAdmin, callerId, eventId, reason)
        } else if (venueId) {
          // General/venue chat → mute across every event in the venue.
          // We don't have a single event to ban per se, so a venue-wide mute
          // is the closest equivalent while still leaving trail.
          const { data: venueEvents } = await supabaseAdmin
            .from('events')
            .select('id')
            .eq('venue_id', venueId)
          const venueEventIds = (venueEvents || []).map((e) => e.id)
          if (venueEventIds.length) {
            await supabaseAdmin
              .from('user_events')
              .update({ is_muted: true })
              .eq('user_id', callerId)
              .in('event_id', venueEventIds)
          }
        }

        console.warn(
          `[chat/send] TIER_1 auto-ban user=${callerId} event=${eventId || 'general'} cat=${classification.category} match="${classification.match}"`,
        )

        // Trip circuit breaker regardless of threshold when tier 1 is posted —
        // one TIER_1 hit = disable the chat so admin triage.
        if (!isGeneral && eventId && !breakerTripped.tripped) {
          breakerTripped = { tripped: true, reason: `Tier 1: ${classification.category}` }
        }

        if (breakerTripped.tripped && eventId) {
          await autoDisableChat(supabaseAdmin, eventId, breakerTripped.reason || 'tier 1')
        }

        return NextResponse.json(
          {
            error:
              'Has sido bloqueado permanentemente del chat por contenido prohibido. Un moderador revisara el caso.',
          },
          { status: 403, headers: { 'X-Reason': 'AUTO_BANNED' } },
        )
      }

      // ── TIER 2 — INSTANT MUTE ───────────────────────────────────────────
      if (tier === 2) {
        if (eventId) {
          await applyInstantMute(supabaseAdmin, callerId, eventId)
        } else if (venueId) {
          const { data: venueEvents } = await supabaseAdmin
            .from('events')
            .select('id')
            .eq('venue_id', venueId)
          const venueEventIds = (venueEvents || []).map((e) => e.id)
          if (venueEventIds.length) {
            await supabaseAdmin
              .from('user_events')
              .update({ is_muted: true })
              .eq('user_id', callerId)
              .in('event_id', venueEventIds)
          }
        }

        console.warn(
          `[chat/send] TIER_2 auto-mute user=${callerId} event=${eventId || 'general'} cat=${classification.category} match="${classification.match}"`,
        )

        if (breakerTripped.tripped && eventId) {
          await autoDisableChat(supabaseAdmin, eventId, breakerTripped.reason || 'tier 2 spike')
        }

        return NextResponse.json(
          {
            error:
              'Has sido silenciado por contenido inapropiado. Un moderador revisara el caso.',
          },
          { status: 403, headers: { 'X-Reason': 'AUTO_MUTED_T2' } },
        )
      }

      // ── TIER 3 — STRIKE LEDGER ──────────────────────────────────────────
      // Strikes decay after STRIKE_WINDOW_MS (24h) of inactivity.
      const lastStrike = userRow.last_strike_at ? new Date(userRow.last_strike_at).getTime() : 0
      const windowActive = now - lastStrike < STRIKE_WINDOW_MS
      const nextStrikes = (windowActive ? (userRow.profanity_strikes || 0) : 0) + 1

      await supabaseAdmin
        .from('users')
        .update({
          profanity_strikes: nextStrikes,
          last_strike_at: new Date(now).toISOString(),
        })
        .eq('id', callerId)

      // Hit the threshold → auto-mute for this event
      if (nextStrikes >= STRIKE_THRESHOLD && eventId) {
        await supabaseAdmin
          .from('user_events')
          .update({ is_muted: true })
          .eq('user_id', callerId)
          .eq('event_id', eventId)

        // Reset the counter after muting so they don't compound forever
        await supabaseAdmin
          .from('users')
          .update({ profanity_strikes: 0 })
          .eq('id', callerId)

        if (breakerTripped.tripped && eventId) {
          await autoDisableChat(supabaseAdmin, eventId, breakerTripped.reason || 'tier 3 spike')
        }

        return NextResponse.json(
          {
            error:
              'Has sido silenciado por lenguaje inapropiado. Un moderador lo revisara.',
          },
          { status: 403, headers: { 'X-Reason': 'AUTO_MUTED' } },
        )
      }

      // Still below threshold — but if the circuit breaker tripped on this
      // flag, kill the chat anyway.
      if (breakerTripped.tripped && eventId) {
        await autoDisableChat(supabaseAdmin, eventId, breakerTripped.reason || 'tier 3 spike')
      }

      return NextResponse.json(
        {
          error: `Tu mensaje contiene lenguaje inapropiado. ${
            STRIKE_THRESHOLD - nextStrikes
          } aviso${STRIKE_THRESHOLD - nextStrikes === 1 ? '' : 's'} antes de ser silenciado.`,
        },
        { status: 422, headers: { 'X-Reason': 'PROFANITY' } },
      )
    }

    // Belt-and-braces: scrub any tier-3 words that might appear if someone
    // added to the filter but an old string slipped through (edge case).
    const finalContent = filterTier3(content)

    // ── Insert ─────────────────────────────────────────────────────────────
    const insertData = isGeneral
      ? {
          content: finalContent,
          user_id: callerId,
          venue_id: venueId,
          is_announcement: false,
          is_general: true,
        }
      : {
          content: finalContent,
          user_id: callerId,
          event_id: eventId,
          is_announcement: false,
          is_general: false,
        }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert(insertData)
      .select('id, created_at')
      .single()

    if (insertErr) {
      console.error('[chat/send] Insert error:', insertErr.message)
      return NextResponse.json({ error: 'No se pudo enviar el mensaje' }, { status: 500 })
    }

    // ── Commit rate-limit state (only after successful insert) ─────────────
    bucket.lastAt = now
    bucket.timestamps.push(now)
    bucket.lastContent = content.toLowerCase()
    bucket.lastContentAt = now
    pruneBuckets()

    return NextResponse.json({
      success: true,
      id: inserted.id,
      created_at: inserted.created_at,
    })
  } catch (err) {
    console.error('[chat/send] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
