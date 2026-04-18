import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStaffProfile, getStaffEventIds } from '@/lib/scanner-access'

// Scanner bootstrap endpoint.
//
// Returns the events a caller can scan plus the ticket rows for those
// events (with user info merged in). The scanner page uses this as a
// single source of truth for its event list and attendee stats.
//
// Access model lives in `lib/scanner-access.ts`:
//   - scanner / cloakroom → venue-wide: assigned to any event at a
//     venue → sees ALL events at that venue (no date filter)
//   - group_admin / promoter → limited to their explicit user_events
//   - admin / super_admin → all events in their org (no date filter)

export async function GET(request: NextRequest) {
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

  // Service role for bypassing RLS on ticket/user lookups
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolve caller's role + org
  const profile = await getStaffProfile(sb, user.id)
  if (!profile) {
    return NextResponse.json({ error: 'Not staff' }, { status: 403 })
  }

  // Resolve which events this caller can scan
  const eventIdSet = await getStaffEventIds(sb, user.id, profile)

  if (eventIdSet.size === 0) {
    return NextResponse.json({ events: [], attendees: [] })
  }

  // Hydrate the event rows (for UI: event pills, group names, etc.)
  const { data: events, error: eventErr } = await sb
    .from('events')
    .select('id, title, group_name, date, venue_id')
    .in('id', [...eventIdSet])
    .order('date', { ascending: true })

  if (eventErr) {
    return NextResponse.json({ error: eventErr.message }, { status: 500 })
  }

  const eventIds = (events || []).map(e => e.id)

  // Defensive cap: a scanner covering a busy venue over its operational
  // window (7d back / 30d ahead) could otherwise pull tens of thousands of
  // ticket rows per bootstrap. 5000 fits comfortably in memory, covers a
  // realistic venue's several-thousand-person night, and shields the DB
  // pool from a single mobile scanner page-load.
  const TICKET_HARD_CAP = 5000
  const { data: tickets, error } = await sb
    .from('tickets')
    .select('id, user_id, event_id, qr_code, status, scanned_at, created_at')
    .in('event_id', eventIds)
    .order('created_at', { ascending: false })
    .limit(TICKET_HARD_CAP)

  if (error || !tickets) {
    return NextResponse.json({ error: error?.message || 'Failed to load tickets' }, { status: 500 })
  }

  // Fetch user profiles in chunks
  const userIds = [...new Set(tickets.map(t => t.user_id))]
  const userMap: Record<string, { full_name: string | null; email: string }> = {}

  if (userIds.length > 0) {
    for (let i = 0; i < userIds.length; i += 100) {
      const chunk = userIds.slice(i, i + 100)
      const { data: users } = await sb
        .from('users')
        .select('id, full_name, email')
        .in('id', chunk)
      users?.forEach(u => { userMap[u.id] = { full_name: u.full_name, email: u.email } })
    }
  }

  const attendees = tickets.map(t => ({
    id: t.id,
    user_id: t.user_id,
    event_id: t.event_id,
    qr_code: t.qr_code,
    status: t.status,
    scanned_at: t.scanned_at,
    created_at: t.created_at,
    user_name: userMap[t.user_id]?.full_name ?? null,
    user_email: userMap[t.user_id]?.email ?? '',
  }))

  return NextResponse.json({ events: events || [], attendees })
}
