import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canStaffEvent } from '@/lib/scanner-access'

/**
 * POST /api/cloakroom/checkin
 *
 * Force a check-in (deposit) even if the attendee already has stored items.
 * Used when someone wants to leave a second garment.
 *
 * Body: { user_id: string, event_id: string, amount?: number }
 */
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const authHeader = request.headers.get('Authorization') || ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id, event_id, amount } = await request.json()
  if (!event_id || !user_id) {
    return NextResponse.json({ error: 'event_id and user_id required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const allowed = await canStaffEvent(sb, user.id, event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Sin acceso a este evento' }, { status: 403 })
  }

  // Get attendee name
  const { data: attendee } = await sb
    .from('users')
    .select('full_name')
    .eq('id', user_id)
    .single()

  // Next ticket number — retry loop for race condition safety
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
        user_id,
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
        user_name: attendee?.full_name || 'Sin nombre',
        amount: itemAmount,
        item_id: newItem.id,
      })
    }

    if (insertErr?.code !== '23505') {
      return NextResponse.json({ error: insertErr?.message || 'Error al registrar prenda' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'No se pudo asignar numero de prenda, intenta de nuevo' }, { status: 500 })
}
