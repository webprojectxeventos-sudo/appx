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

type JoinedTicket = {
  id: string
  user_id: string
  event_id: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
  user: { full_name: string | null; email: string } | null
  event: { title: string } | null
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

  // Fetch ticket + joined user/event info in a single query. Using inner
  // joins so rows with broken FKs don't silently pass.
  const { data: ticket, error: ticketErr } = await sb
    .from('tickets')
    .select(
      `
      id, user_id, event_id, status, scanned_at,
      user:users!inner(full_name, email),
      event:events!inner(title)
      `,
    )
    .eq('qr_code', ticketQr)
    .maybeSingle<JoinedTicket>()

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

  // State checks — return the same error messages as scan_ticket RPC so
  // the client's duplicate-scan detection keeps working
  if (ticket.status === 'used') {
    const res: ScanResponse = {
      success: false,
      error: 'Ticket ya escaneado',
      user_name: ticket.user?.full_name ?? undefined,
      user_email: ticket.user?.email ?? undefined,
      event_title: ticket.event?.title ?? undefined,
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
    user_name: ticket.user?.full_name ?? undefined,
    user_email: ticket.user?.email ?? undefined,
    event_title: ticket.event?.title ?? undefined,
    ticket_id: ticket.id,
    scanned_at: scannedAt,
  }
  return NextResponse.json(res)
}
