import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canStaffEvent } from '@/lib/scanner-access'

/**
 * POST /api/cloakroom/action
 *
 * Smart scan: auto-detects whether to check-in (deposit) or check-out (return).
 *
 * Body: { qr_code?: string, user_id?: string, event_id: string, amount?: number }
 *   - Provide qr_code (from QR scan) OR user_id (from name search)
 *   - amount defaults to 1.00
 *
 * Logic:
 *   - If user has 0 stored items → check-in (new ticket_number)
 *   - If user has 1+ stored items → check-out (oldest first)
 *
 * Returns: { action: 'checkin'|'checkout', ticket_number, user_name, amount?, item_id? }
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Verify caller
  const authHeader = request.headers.get('Authorization') || ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { qr_code, user_id, event_id, amount } = await request.json()
  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  }
  if (!qr_code && !user_id) {
    return NextResponse.json({ error: 'qr_code or user_id required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Verify staff access
  const allowed = await canStaffEvent(sb, user.id, event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Sin acceso a este evento' }, { status: 403 })
  }

  // Resolve attendee user_id from QR code
  let attendeeId = user_id
  if (qr_code && !attendeeId) {
    const { data: ticket } = await sb
      .from('tickets')
      .select('user_id, event_id')
      .eq('qr_code', qr_code)
      .maybeSingle()

    if (!ticket) {
      return NextResponse.json({ error: 'QR no encontrado' }, { status: 404 })
    }
    if (ticket.event_id !== event_id) {
      return NextResponse.json({ error: 'Este QR no pertenece a este evento' }, { status: 400 })
    }
    attendeeId = ticket.user_id
  }

  // Get attendee name — verify they exist
  const { data: attendee, error: attendeeErr } = await sb
    .from('users')
    .select('full_name')
    .eq('id', attendeeId)
    .single()

  if (attendeeErr || !attendee) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const userName = attendee.full_name || 'Sin nombre'

  // Check for active (stored) items
  const { data: storedItems } = await sb
    .from('cloakroom_items')
    .select('id, ticket_number')
    .eq('event_id', event_id)
    .eq('user_id', attendeeId)
    .eq('status', 'stored')
    .order('checked_in_at', { ascending: true })

  if (storedItems && storedItems.length > 0) {
    // CHECK-OUT: return oldest stored item
    const item = storedItems[0]
    const { error: updateErr } = await sb
      .from('cloakroom_items')
      .update({
        status: 'returned',
        checked_out_at: new Date().toISOString(),
        checked_out_by: user.id,
      })
      .eq('id', item.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      action: 'checkout',
      ticket_number: item.ticket_number,
      user_name: userName,
      item_id: item.id,
      remaining: storedItems.length - 1,
    })
  }

  // CHECK-IN: create new item with next ticket_number
  // Retry loop handles race condition: if two requests get the same max,
  // the UNIQUE(event_id, ticket_number) constraint catches the duplicate
  // and we retry with the next number.
  const itemAmount = typeof amount === 'number' && amount >= 0 ? amount : 1.00
  const MAX_RETRIES = 3

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data: maxRow } = await sb
      .from('cloakroom_items')
      .select('ticket_number')
      .eq('event_id', event_id)
      .order('ticket_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextNumber = (maxRow?.ticket_number || 0) + 1

    const { data: newItem, error: insertErr } = await sb
      .from('cloakroom_items')
      .insert({
        event_id,
        user_id: attendeeId,
        ticket_number: nextNumber,
        amount: itemAmount,
        status: 'stored',
        checked_in_by: user.id,
      })
      .select('id, ticket_number')
      .single()

    if (!insertErr && newItem) {
      return NextResponse.json({
        action: 'checkin',
        ticket_number: newItem.ticket_number,
        user_name: userName,
        amount: itemAmount,
        item_id: newItem.id,
      })
    }

    // If duplicate key error, retry; otherwise fail
    if (insertErr?.code !== '23505') {
      return NextResponse.json({ error: insertErr?.message || 'Error al registrar prenda' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'No se pudo asignar numero de prenda, intenta de nuevo' }, { status: 500 })
}
