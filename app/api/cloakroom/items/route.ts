import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStaffProfile, getStaffEventIds } from '@/lib/scanner-access'

/**
 * GET /api/cloakroom/items?event_id=X
 *
 * List all cloakroom items for the caller's accessible events.
 * If event_id is provided, filters to that event only.
 *
 * Returns items joined with user name, sorted by ticket_number desc.
 */
export async function GET(request: NextRequest) {
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

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const profile = await getStaffProfile(sb, user.id)
  if (!profile) {
    return NextResponse.json({ error: 'No staff access' }, { status: 403 })
  }

  const eventIds = await getStaffEventIds(sb, user.id, profile)
  if (eventIds.size === 0) {
    return NextResponse.json({ items: [], events: [] })
  }

  // Filter to requested event if provided
  const requestedEventId = request.nextUrl.searchParams.get('event_id')
  const targetIds = requestedEventId && eventIds.has(requestedEventId)
    ? [requestedEventId]
    : [...eventIds]

  // Fetch events info
  const { data: events } = await sb
    .from('events')
    .select('id, title, group_name, date')
    .in('id', targetIds)
    .order('date', { ascending: false })

  // Fetch items
  const { data: items } = await sb
    .from('cloakroom_items')
    .select('*')
    .in('event_id', targetIds)
    .order('ticket_number', { ascending: false })

  if (!items || items.length === 0) {
    return NextResponse.json({ items: [], events: events || [] })
  }

  // Fetch user names in batches
  const userIds = [...new Set(items.map(i => i.user_id))]
  const userMap = new Map<string, string>()

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100)
    const { data: users } = await sb
      .from('users')
      .select('id, full_name')
      .in('id', batch)

    if (users) {
      users.forEach(u => userMap.set(u.id, u.full_name || 'Sin nombre'))
    }
  }

  const enriched = items.map(item => ({
    ...item,
    user_name: userMap.get(item.user_id) || 'Sin nombre',
  }))

  return NextResponse.json({
    items: enriched,
    events: events || [],
  })
}
