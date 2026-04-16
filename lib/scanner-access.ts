// Server-only helpers for computing which events a caller is allowed to
// staff (scan tickets, undo scans, register door entries, etc.).
//
// Access model:
//   - `scanner` and `cloakroom` access is **venue-based**: assign a scanner
//     to ANY event at a venue and they automatically see ALL events at that
//     venue (past, present, future). No date window.
//   - `group_admin` and `promoter` access is explicit per-event via
//     `user_events`.
//   - `admin` and `super_admin` access is IMPLICIT via their profile role
//     and `organization_id` — they see every event in their org (no date
//     window).

import { SupabaseClient } from '@supabase/supabase-js'

export const STAFF_ROLES = ['scanner', 'admin', 'super_admin', 'group_admin', 'promoter', 'cloakroom'] as const

// Roles that get venue-wide access: assign to one event at a venue →
// automatically see all events at that venue.
const VENUE_WIDE_ROLES: readonly string[] = ['scanner', 'cloakroom']

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
 *   - scanner / cloakroom → venue-wide: get their assigned events,
 *     resolve venues, return ALL events at those venues (no date filter)
 *   - group_admin / promoter → only their explicit user_events
 *   - admin / super_admin → every event in their org (no date filter)
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

  // Venue-wide expansion for scanner / cloakroom:
  // If they're assigned to any event at a venue, they see ALL events at that venue.
  if (VENUE_WIDE_ROLES.includes(profile.role) && eventIds.size > 0) {
    // Get venue_ids from assigned events
    const { data: assignedEvents } = await admin
      .from('events')
      .select('venue_id')
      .in('id', [...eventIds])

    const venueIds = [...new Set(
      (assignedEvents || [])
        .map(e => e.venue_id)
        .filter((v): v is string => !!v)
    )]

    if (venueIds.length > 0) {
      // Fetch ALL events at those venues (no date filter)
      const { data: venueEvents } = await admin
        .from('events')
        .select('id')
        .in('venue_id', venueIds)

      if (venueEvents) {
        for (const e of venueEvents) eventIds.add(e.id)
      }
    }
  }

  // Org-wide access for admin / super_admin (no date filter)
  const isOrgStaff = profile.role === 'admin' || profile.role === 'super_admin'
  if (isOrgStaff && profile.organization_id) {
    const { data: orgEvents } = await admin
      .from('events')
      .select('id')
      .eq('organization_id', profile.organization_id)

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

  // 2) Venue-wide access for scanner / cloakroom:
  //    If the scanner has ANY event at the same venue, allow access.
  if (VENUE_WIDE_ROLES.includes(profile.role)) {
    // Get the venue of the target event
    const { data: targetEvent } = await admin
      .from('events')
      .select('venue_id')
      .eq('id', eventId)
      .maybeSingle()

    if (targetEvent?.venue_id) {
      // Check if scanner has any user_events membership at this venue
      const { data: venueEvents } = await admin
        .from('events')
        .select('id')
        .eq('venue_id', targetEvent.venue_id)

      if (venueEvents) {
        const venueEventIds = venueEvents.map(e => e.id)
        const { data: venueMembership } = await admin
          .from('user_events')
          .select('role')
          .eq('user_id', userId)
          .eq('is_active', true)
          .in('event_id', venueEventIds)
          .limit(1)
          .maybeSingle()

        if (venueMembership && STAFF_ROLES.includes(venueMembership.role as typeof STAFF_ROLES[number])) {
          return true
        }
      }
    }
  }

  // 3) Role-based org access (admin / super_admin can staff any event in their org)
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
