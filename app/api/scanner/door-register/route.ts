import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { canStaffEvent } from '@/lib/scanner-access'

const DOOR_LIMIT_DEFAULT = 20

// ── Abuse prevention ──────────────────────────────────────────────────────
//
// Door-register creates an auth user + profile + user_events row + ticket
// on every call. A compromised scanner tablet (or a buggy client stuck in
// a loop) can hammer auth.admin.createUser and blow the DB pool / Supabase
// rate limits. Two layers of defence:
//
//   1. Per-scanner-user rate bucket: 120/min. Real operators typically
//      register 20-40/event; 120/min is 2/second sustained — generous for
//      a busy door, tight enough that a rogue client trips fast.
//   2. Per-event no-promoter cap: DOOR_UNATTRIBUTED_MAX free-form entries
//      per event (no promoter_code). If a venue needs more, they should
//      use a promoter code (which has its own DOOR_LIMIT_DEFAULT cap).
//
// State is in-memory per Vercel instance. At 3-4 warm instances the effective
// limits are 3-4x the configured numbers, which is fine — the floor is what
// matters for crash prevention.
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT_PER_USER = 120
const DOOR_UNATTRIBUTED_MAX = 500 // per event, lifetime

const rateBuckets = new Map<string, number[]>()

function rateLimit(userId: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(userId) || []
  const fresh = bucket.filter((t) => now - t < RATE_WINDOW_MS)
  if (fresh.length >= RATE_LIMIT_PER_USER) {
    rateBuckets.set(userId, fresh)
    return false
  }
  fresh.push(now)
  rateBuckets.set(userId, fresh)

  // Prune the map occasionally so it doesn't grow unbounded across shifts
  if (rateBuckets.size > 2000) {
    for (const [uid, times] of rateBuckets.entries()) {
      if (times.length === 0 || now - times[times.length - 1] > RATE_WINDOW_MS) {
        rateBuckets.delete(uid)
      }
    }
  }
  return true
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Verify caller via JWT
  const authHeader = request.headers.get('Authorization') || ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate-limit by scanner user (cheap — before any DB work)
  if (!rateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Demasiadas entradas registradas en poco tiempo. Espera un momento.' },
      { status: 429 },
    )
  }

  // Parse body
  const { name, event_id, promoter_code } = await request.json()
  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify caller has staff access to this event (user_events OR role+org)
  const allowed = await canStaffEvent(sb, user.id, event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'No access to this event' }, { status: 403 })
  }

  // ── Promoter code validation ──────────────────────────────────────────
  let promoterId: string | null = null
  let promoterName: string | null = null

  if (promoter_code) {
    const cleanCode = String(promoter_code).replace(/-/g, '').toUpperCase()
    if (cleanCode.length !== 8) {
      return NextResponse.json({ error: 'Codigo organizador invalido (8 caracteres)' }, { status: 400 })
    }

    // Find the access code
    const { data: codeRow } = await sb
      .from('access_codes')
      .select('id, used_by, event_id')
      .eq('code', cleanCode)
      .maybeSingle()

    if (!codeRow || !codeRow.used_by) {
      return NextResponse.json({ error: 'Codigo organizador no encontrado' }, { status: 404 })
    }

    // Verify the user is a promoter
    const { data: promoterUser } = await sb
      .from('users')
      .select('id, role, full_name')
      .eq('id', codeRow.used_by)
      .single()

    if (!promoterUser || promoterUser.role !== 'promoter') {
      return NextResponse.json({ error: 'Este codigo no pertenece a un organizador' }, { status: 403 })
    }

    promoterId = promoterUser.id
    promoterName = promoterUser.full_name

    // Check door limit (20 per promoter per event)
    const { count } = await sb
      .from('user_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .eq('added_by', promoterId)

    if ((count || 0) >= DOOR_LIMIT_DEFAULT) {
      return NextResponse.json({
        error: `Limite de entradas en puerta alcanzado (${DOOR_LIMIT_DEFAULT}) para este organizador`,
      }, { status: 400 })
    }
  } else {
    // No promoter code: enforce a per-event cap on unattributed door entries
    // so a runaway client can't create thousands of fake users.
    // Attributed = has DOOR- prefix on qr_code (see ticket creation below).
    const { count: doorCount } = await sb
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event_id)
      .like('qr_code', 'DOOR-%')

    if ((doorCount || 0) >= DOOR_UNATTRIBUTED_MAX) {
      return NextResponse.json({
        error: `Limite de entradas en puerta para este evento alcanzado (${DOOR_UNATTRIBUTED_MAX}). Usa un codigo de organizador.`,
      }, { status: 400 })
    }
  }

  // ── Get event + org info ──────────────────────────────────────────────
  const { data: eventData } = await sb
    .from('events')
    .select('id, title, organization_id')
    .eq('id', event_id)
    .single()
  if (!eventData) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // ── Create auth user for this door entry ──────────────────────────────
  const randomId = crypto.randomBytes(6).toString('hex')
  const fakeEmail = `door.${randomId}@puerta.local`

  const { data: authData, error: authError } = await sb.auth.admin.createUser({
    email: fakeEmail,
    password: crypto.randomBytes(16).toString('hex'),
    email_confirm: true,
    user_metadata: { source: 'door', ...(promoterId && { promoter_id: promoterId }) },
  })
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 500 })
  }

  const newUserId = authData.user.id

  // Create profile in users table (auth trigger may auto-create, so upsert)
  await sb.from('users').upsert({
    id: newUserId,
    email: fakeEmail,
    full_name: name || 'Entrada puerta',
    role: 'attendee',
    event_id,
    organization_id: eventData.organization_id,
  }, { onConflict: 'id' })

  // Create user_events entry (for tracking added_by / promoter attribution)
  await sb.from('user_events').upsert({
    user_id: newUserId,
    event_id,
    role: 'attendee',
    added_by: promoterId || user.id,
  }, { onConflict: 'user_id,event_id' })

  // Create ticket — already marked as 'used' (they're at the door)
  const qrCode = `DOOR-${event_id.substring(0, 8)}-${crypto.randomBytes(12).toString('hex')}`

  const { data: ticket, error: ticketError } = await sb.from('tickets').insert({
    user_id: newUserId,
    event_id,
    qr_code: qrCode,
    status: 'used',
    scanned_at: new Date().toISOString(),
    scanned_by: user.id,
  }).select('id').single()

  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    ticket_id: ticket.id,
    user_name: name || 'Entrada puerta',
    event_title: eventData.title,
    promoter_name: promoterName,
  })
}
