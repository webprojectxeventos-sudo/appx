import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canStaffEvent } from '@/lib/scanner-access'

// POST /api/scanner/undo — revert a scanned ticket back to 'valid'.
//
// Access control lives in `canStaffEvent` — accepts user_events memberships
// plus role-based org access (admin / super_admin).

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

  // Get ticket_id from body
  const { ticket_id } = await request.json()
  if (!ticket_id) {
    return NextResponse.json({ error: 'ticket_id required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify the ticket exists and get its event
  const { data: ticket } = await sb
    .from('tickets')
    .select('id, event_id, status')
    .eq('id', ticket_id)
    .single()
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Verify caller has staff access to this event (user_events OR role+org)
  const allowed = await canStaffEvent(sb, user.id, ticket.event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'No access' }, { status: 403 })
  }

  // Revert ticket to valid
  const { error } = await sb
    .from('tickets')
    .update({ status: 'valid', scanned_at: null, scanned_by: null })
    .eq('id', ticket_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
