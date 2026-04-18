import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * Event-level circuit breaker.
 *
 * When ONE message trips a content rule we ban/mute that single user. But
 * the San Juan Bosco incident showed that an entire group can coordinate to
 * flood a chat faster than 3-strike-per-user rules can keep up: 11 users
 * posted 397 messages in 14 hours, and individually most of them didn't
 * trip the profanity filter enough times to get auto-muted.
 *
 * The circuit breaker watches the event as a whole. If the flag rate
 * crosses a threshold we flip the per-event kill-switch (events.chat_enabled)
 * and push-notify every admin of the organization so someone can triage.
 *
 * This is an in-memory tracker (Map per serverless instance). Events with
 * traffic on multiple instances will each run their own counter, which is
 * fine — any one instance hitting the threshold is enough to trip the
 * breaker, and the DB write is idempotent.
 */

// ── Thresholds ───────────────────────────────────────────────────────────
const FLAG_WINDOW_MS = 15 * 60_000         // sliding window for total flags
const FLAG_COUNT_THRESHOLD = 8             // 8 flagged msgs in 15 min → trip
const DISTINCT_USERS_WINDOW_MS = 10 * 60_000
const DISTINCT_USERS_THRESHOLD = 3         // 3 distinct users flagged in 10 min → trip
const MAP_PRUNE_AT = 5_000                 // keep the map bounded

type EventHealth = {
  flags: number[]                          // timestamps of flagged messages
  users: Map<string, number>               // userId → most recent flag timestamp
  disabled: boolean                        // local flag to avoid double-tripping
}

const eventHealth = new Map<string, EventHealth>()

function getHealth(eventId: string): EventHealth {
  let h = eventHealth.get(eventId)
  if (!h) {
    h = { flags: [], users: new Map(), disabled: false }
    eventHealth.set(eventId, h)
  }
  return h
}

function pruneEventHealth() {
  if (eventHealth.size < MAP_PRUNE_AT) return
  const now = Date.now()
  for (const [eid, h] of eventHealth.entries()) {
    const lastFlag = h.flags[h.flags.length - 1] ?? 0
    if (now - lastFlag > FLAG_WINDOW_MS * 4) eventHealth.delete(eid)
  }
}

/**
 * Record a flagged message against an event. Returns true if the breaker
 * was JUST tripped (caller should then auto-disable the chat).
 *
 * Returns false if the event is still healthy OR if the breaker has already
 * been tripped in this instance (so the caller doesn't flip it twice).
 */
export function recordFlaggedMessage(eventId: string, userId: string): { tripped: boolean; reason?: string } {
  const h = getHealth(eventId)
  if (h.disabled) return { tripped: false }

  const now = Date.now()
  h.flags.push(now)
  h.users.set(userId, now)

  // Sliding-window prune
  h.flags = h.flags.filter((t) => now - t < FLAG_WINDOW_MS)
  for (const [uid, t] of h.users.entries()) {
    if (now - t > DISTINCT_USERS_WINDOW_MS) h.users.delete(uid)
  }

  // Threshold checks
  if (h.flags.length >= FLAG_COUNT_THRESHOLD) {
    h.disabled = true
    pruneEventHealth()
    return {
      tripped: true,
      reason: `${h.flags.length} mensajes marcados en ${Math.round(FLAG_WINDOW_MS / 60_000)} min`,
    }
  }
  if (h.users.size >= DISTINCT_USERS_THRESHOLD) {
    h.disabled = true
    pruneEventHealth()
    return {
      tripped: true,
      reason: `${h.users.size} usuarios distintos marcados en ${Math.round(DISTINCT_USERS_WINDOW_MS / 60_000)} min`,
    }
  }

  return { tripped: false }
}

/**
 * Reset the local breaker state for an event (e.g. after an admin re-enables
 * chat manually — we want the counter to start fresh).
 */
export function resetEventHealth(eventId: string) {
  eventHealth.delete(eventId)
}

/**
 * Flip events.chat_enabled to false for an event and push-notify all admins
 * of the owning organization. Safe to call multiple times — the DB update
 * is idempotent and duplicate notifications are handled by the push stack.
 */
export async function autoDisableChat(
  supabaseAdmin: SupabaseClient,
  eventId: string,
  triggerSummary: string,
): Promise<{ ok: boolean; notified: number }> {
  // 1. Flip the kill-switch
  const { data: ev, error: updErr } = await supabaseAdmin
    .from('events')
    .update({ chat_enabled: false })
    .eq('id', eventId)
    .select('id, title, group_name, organization_id')
    .single()

  if (updErr || !ev) {
    console.error('[event-moderation] Failed to disable chat:', updErr?.message)
    return { ok: false, notified: 0 }
  }

  console.warn(
    `[event-moderation] AUTO-DISABLED chat for event ${eventId} (${ev.title || ev.group_name}): ${triggerSummary}`,
  )

  // 2. Notify admins of the org (best-effort — don't block the caller if push fails)
  const notified = await notifyOrgAdmins(supabaseAdmin, ev.organization_id, {
    title: `⚠️ Chat auto-desactivado: ${ev.title || ev.group_name || 'evento'}`,
    body: `Circuit breaker disparado: ${triggerSummary}. Revisa en /admin/comms.`,
    url: `/admin/comms?event=${eventId}`,
  })

  return { ok: true, notified }
}

// ── Admin push notification helper ────────────────────────────────────────

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@projectxeventos.es'

let vapidInitialized = false
function ensureVapid() {
  if (vapidInitialized) return
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
  vapidInitialized = true
}

async function notifyOrgAdmins(
  supabaseAdmin: SupabaseClient,
  organizationId: string | null,
  payload: { title: string; body: string; url: string },
): Promise<number> {
  if (!organizationId) return 0
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn('[event-moderation] VAPID keys missing — skipping admin push')
    return 0
  }

  ensureVapid()

  // Admins of this org
  const { data: admins } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('organization_id', organizationId)
    .in('role', ['super_admin', 'admin'])

  const adminIds = (admins || []).map((a) => a.id)
  if (!adminIds.length) return 0

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth_key')
    .in('user_id', adminIds)

  if (!subs?.length) return 0

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: `mod-alert-${Date.now()}`,
    requireInteraction: true,
  })

  let sent = 0
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          notificationPayload,
        )
        sent++
      } catch {
        // swallow — cleanup happens in the regular /api/push path
      }
    }),
  )

  return sent
}
