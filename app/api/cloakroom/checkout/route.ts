import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canStaffEvent } from '@/lib/scanner-access'

/**
 * POST /api/cloakroom/checkout
 *
 * Check-out (return) a specific cloakroom item by ID.
 * Used from the inventory list to return a specific garment.
 *
 * Body: { item_id: string }
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

  const { item_id } = await request.json()
  if (!item_id) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get the item to verify event access
  const { data: item } = await sb
    .from('cloakroom_items')
    .select('id, event_id, user_id, ticket_number, status')
    .eq('id', item_id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Prenda no encontrada' }, { status: 404 })
  }
  if (item.status === 'returned') {
    return NextResponse.json({ error: 'Esta prenda ya fue devuelta' }, { status: 400 })
  }

  const allowed = await canStaffEvent(sb, user.id, item.event_id)
  if (!allowed) {
    return NextResponse.json({ error: 'Sin acceso a este evento' }, { status: 403 })
  }

  const { error: updateErr } = await sb
    .from('cloakroom_items')
    .update({
      status: 'returned',
      checked_out_at: new Date().toISOString(),
      checked_out_by: user.id,
    })
    .eq('id', item_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Get attendee name
  const { data: attendee } = await sb
    .from('users')
    .select('full_name')
    .eq('id', item.user_id)
    .single()

  return NextResponse.json({
    action: 'checkout',
    ticket_number: item.ticket_number,
    user_name: attendee?.full_name || 'Sin nombre',
    item_id: item.id,
  })
}
