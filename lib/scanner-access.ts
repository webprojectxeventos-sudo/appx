// Server-only helpers for computing which events a caller is allowed to
// staff (scan tickets, undo scans, register door entries, etc.).
//
// Why this exists:
//   - `scanner`, `group_admin`, `promoter` access is explicit via the
//     `user_events` table (they get assigned to specific events).
//   - `admin` and `super_admin` access is IMPLICIT via their profile role
//     and `organization_id` — they manage every event in their org and
//     rarely add themselves to `user_events`.
//
// The existing RLS helpers (`rls_is_event_staff`, `rls_is_event_admin`)
// only recognize user_events membership + super_admin org access, so a
// regular `admin` without a `user_events` row can't use the client-side
// `scan_ticket` RPC. These helpers work around that purely in app code
// without requiring a DB migration.

import { SupabaseClient } from '@supabase/supabase-js'

export const STAFF_ROLES = ['scanner', 'admin', 'super_admin', 'group_admin', 'promoter'] as const

// Window for org-wide admin access. Opening the scanner shouldn't pull
// months of history, only events around "tonight".
const ORG_WINDOW_PAST_MS = 12 * 3600 * 1000   // 12h ago
const ORG_WINDOW_FUTURE_MS = 36 * 3600 * 1000 // 36h ahead

export type StaffProfile = {
  role: string
  organization_id: string | null
}

/**
 * Resolve the caller's profile (role + org). Returns null if the user
 * doesn't exist in the users table or isn't a staff role.
 */
export async function getStaffProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<StaffProfile | null> {
  const { data, error } = await admin
    .from('users')
    .select('role, organization_id')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  if (!STAFF_ROLES.includes(data.role as typeof STAFF_ROLES[number])) return null
  return { role: data.role, organization_id: data.organization_id }
}

/**
 * Return the set of event IDs the caller can staff:
 *   - Every `user_events` membership with a staff role
 *   - For admin / super_admin: every event in their org within a
 *     rolling 48h window (-12h / +36h)
 */
export async function getStaffEventIds(
  admin: SupabaseClient,
  userId: string,
  profile: StaffProfile,
): Promise<Set<string>> {
  const eventIds = new Set<string>()

  // user_events memberships
  const { data: memberships } = await admin
    .from('user_events')
    .select('event_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (memberships) {
    for (const m of memberships) {
      if (STAFF_ROLES.includes(m.role as typeof STAFF_ROLES[number])) {
        eventIds.add(m.event_id)
      }
    }
  }

  // Org-wide access for admin / super_admin
  const isOrgStaff = profile.role === 'admin' || profile.role === 'super_admin'
  if (isOrgStaff && profile.organization_id) {
    const now = Date.now()
    const lower = new Date(now - ORG_WINDOW_PAST_MS).toISOString()
    const upper = new Date(now + ORG_WINDOW_FUTURE_MS).toISOString()
    const { data: orgEvents } = await admin
      .from('events')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .gte('date', lower)
      .lte('date', upper)

    if (orgEvents) {
      for (const e of orgEvents) eventIds.add(e.id)
    }
  }

  return eventIds
}

/**
 * Convenience check for "can this caller staff event X?" used by routes
 * that act on a single event (scan, undo, door-register).
 *
 * Admin / super_admin with matching org are granted access WITHOUT the
 * date window check, since those routes act on a specific event the
 * caller already references (not a broad list).
 */
export async function canStaffEvent(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const profile = await getStaffProfile(admin, userId)
  if (!profile) return false

  // 1) user_events membership
  const { data: membership } = await admin
    .from('user_events')
    .select('role')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('is_active', true)
    .maybeSingle()

  if (membership && STAFF_ROLES.includes(membership.role as typeof STAFF_ROLES[number])) {
    return true
  }

  // 2) Role-based org access (admin / super_admin can staff any event in their org)
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    if (!profile.organization_id) return false
    const { data: event } = await admin
      .from('events')
      .select('organization_id')
      .eq('id', eventId)
      .maybeSingle()
    return !!event && event.organization_id === profile.organization_id
  }

  return false
}
