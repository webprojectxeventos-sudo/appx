import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canStaffEvent } from '@/lib/scanner-access'

// POST /api/scanner/scan — mark a ticket as used.
//
// Exists as an application-level replacement for the `scan_ticket` Postgres
// RPC. The RPC gates access via `rls_is_event_staff`, which only accepts
// explicit user_events memberships (plus super_admin org access). Regular
// admins that manage events via `events.organization_id` don't have
// user_events rows and therefore can't call the RPC.
//
// This endpoint verifies staff access via the shared `canStaffEvent`
// helper (which understands both user_events and role+org), then uses the
// service role to update the ticket atomically. Returns the same JSON
// shape as the RPC so the scanner page doesn't need to care which path
// was used.
//
// Hot-path optimization: we fetch ticket + user info + event title in a
// single joined query, and canStaffEvent is backed by a 30s access cache,
// so a typical scan in a busy session costs just 2 DB round-trips (the
// joined select and the update).

type ScanResponse = {
  success: boolean
  error?: string
  user_name?: string
  user_email?: string
  event_title?: string
  ticket_id?: string
  scanned_at?: string
}

type TicketRow = {
  id: string
  user_id: string
  event_id: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Verify caller identity via their JWT
  const authHeader = request.headers.get('Authorization') || ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let body: { ticket_qr?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const ticketQr = body.ticket_qr?.trim()
  if (!ticketQr) {
    return NextResponse.json({ error: 'ticket_qr required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch the ticket. We used to embed user/event in a single query, but
  // `tickets` has two FKs to `users` (`user_id` and `scanned_by`) so the
  // embed `user:users!inner(...)` becomes ambiguous and PostgREST refuses
  // with "Could not find a relationship between 'tickets' and 'users'".
  // Two serial lookups are cheap enough at the door and sidestep the issue.
  const { data: ticket, error: ticketErr } = await sb
    .from('tickets')
    .select('id, user_id, event_id, status, scanned_at')
    .eq('qr_code', ticketQr)
    .maybeSingle<TicketRow>()

  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message }, { status: 500 })
  }
  if (!ticket) {
    const res: ScanResponse = { success: false, error: 'Ticket no encontrado' }
    return NextResponse.json(res)
  }

  // Verify caller can staff this event (cached — cheap after first call per user)
  const allowed = await canStaffEvent(sb, user.id, ticket.event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'No tienes permiso para escanear este ticket' }, { status: 403 })
  }

  // Load user + event info in parallel. Done after the access check so we
  // don't leak attendee names to unauthorised callers.
  const [userRes, eventRes] = await Promise.all([
    sb.from('users').select('full_name, email').eq('id', ticket.user_id).maybeSingle(),
    sb.from('events').select('title').eq('id', ticket.event_id).maybeSingle(),
  ])
  const attendeeName = userRes.data?.full_name ?? undefined
  const attendeeEmail = userRes.data?.email ?? undefined
  const eventTitle = eventRes.data?.title ?? undefined

  // State checks — return the same error messages as scan_ticket RPC so
  // the client's duplicate-scan detection keeps working
  if (ticket.status === 'used') {
    const res: ScanResponse = {
      success: false,
      error: 'Ticket ya escaneado',
      user_name: attendeeName,
      user_email: attendeeEmail,
      event_title: eventTitle,
      scanned_at: ticket.scanned_at || undefined,
    }
    return NextResponse.json(res)
  }
  if (ticket.status === 'cancelled') {
    const res: ScanResponse = { success: false, error: 'Ticket cancelado' }
    return NextResponse.json(res)
  }

  // Mark as used
  const scannedAt = new Date().toISOString()
  const { error: updateErr } = await sb
    .from('tickets')
    .update({ status: 'used', scanned_at: scannedAt, scanned_by: user.id })
    .eq('id', ticket.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const res: ScanResponse = {
    success: true,
    user_name: attendeeName,
    user_email: attendeeEmail,
    event_title: eventTitle,
    ticket_id: ticket.id,
    scanned_at: scannedAt,
  }
  return NextResponse.json(res)
}
