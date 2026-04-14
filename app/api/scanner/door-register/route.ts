import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { canStaffEvent } from '@/lib/scanner-access'

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

  // Parse body
  const { name, event_id } = await request.json()
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

  // Get event + org info for the user profile
  const { data: eventData } = await sb
    .from('events')
    .select('id, title, organization_id')
    .eq('id', event_id)
    .single()
  if (!eventData) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  // Create an auth user for this door entry
  const randomId = crypto.randomBytes(6).toString('hex')
  const fakeEmail = `door.${randomId}@puerta.local`

  const { data: authData, error: authError } = await sb.auth.admin.createUser({
    email: fakeEmail,
    password: crypto.randomBytes(16).toString('hex'),
    email_confirm: true,
    user_metadata: { source: 'door' },
  })
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 500 })
  }

  const newUserId = authData.user.id

  // Create profile in users table
  // The auth trigger may auto-create a row, so upsert
  await sb.from('users').upsert({
    id: newUserId,
    email: fakeEmail,
    full_name: name || 'Entrada puerta',
    role: 'attendee',
    event_id,
    organization_id: eventData.organization_id,
  }, { onConflict: 'id' })

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
  })
}
