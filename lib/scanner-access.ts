// Server-only helpers for computing which events a caller is allowed to
// staff (scan tickets, undo scans, register door entries, etc.).
//
// Access model:
//   - `scanner` and `cloakroom` access is **venue-based**: the scanner
//     user is permanently bound to a venue via `users.venue_id`. They
//     automatically see ALL events at that venue within the operational
//     window (see STAFF_EVENT_WINDOW below), regardless of which specific
//     events exist on any given day. Legacy fallback: if `venue_id` is
//     null, venue is derived from their `user_events` rows (the old model).
//   - `group_admin` and `promoter` access is explicit per-event via
//     `user_events`.
//   - `admin` and `super_admin` access is IMPLICIT via their profile role
//     and `organization_id` — they see every event in their org inside the
//     same operational window.

import { SupabaseClient } from '@supabase/supabase-js'

// ── Operational window ────────────────────────────────────────────────────
//
// Without a window, scanners at a long-lived venue eventually carry ALL
// historical events in their bootstrap (→ O(venue-lifetime) rows of tickets
// + users streamed to every mobile scanner on page load). That's a DB-pool
// hazard on graduation nights with many scanners opening simultaneously.
//
// The window is intentionally generous: 7 days back covers yesterday's late
// cleanup + door registrations, 30 days forward covers rehearsal scans and
// soft-opens. Anything outside this range requires explicit admin action
// (not a hot path) and can be widened with an env var if ever needed.
const LOOKBACK_DAYS = 7
const LOOKAHEAD_DAYS = 30

function eventWindow(): { fromIso: string; toIso: string } {
  const now = Date.now()
  const fromIso = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString()
  const toIso = new Date(now + LOOKAHEAD_DAYS * 86_400_000).toISOString()
  return { fromIso, toIso }
}

export const STAFF_ROLES = ['scanner', 'admin', 'super_admin', 'group_admin', 'promoter', 'cloakroom'] as const

// Roles that get venue-wide access: assign to one event at a venue →
// automatically see all events at that venue.
const VENUE_WIDE_ROLES: readonly string[] = ['scanner', 'cloakroom']

export type StaffProfile = {
  role: string
  organization_id: string | null
  venue_id: string | null
}

/**
 * Resolve the caller's profile (role + org + assigned venue). Returns null
 * if the user doesn't exist in the users table or isn't a staff role.
 *
 * Tolerant of pre-migration deploys: if `venue_id` doesn't exist yet
 * (error code 42703 "undefined_column" on PostgREST), retries with the
 * legacy shape so the scanner keeps working until the admin runs
 * `supabase/migrations/20260424_users_venue_id.sql`.
 */
export async function getStaffProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<StaffProfile | null> {
  let row: { role: string; organization_id: string | null; venue_id?: string | null } | null = null

  const withVenue = await admin
    .from('users')
    .select('role, organization_id, venue_id')
    .eq('id', userId)
    .single()

  if (withVenue.error) {
    if (withVenue.error.code === '42703') {
      const legacy = await admin
        .from('users')
        .select('role, organization_id')
        .eq('id', userId)
        .single()
      if (legacy.error || !legacy.data) return null
      row = legacy.data
    } else {
      return null
    }
  } else {
    row = withVenue.data
  }

  if (!row) return null
  if (!STAFF_ROLES.includes(row.role as typeof STAFF_ROLES[number])) return null
  return {
    role: row.role,
    organization_id: row.organization_id,
    venue_id: row.venue_id ?? null,
  }
}

/**
 * Return the set of event IDs the caller can staff:
 *   - scanner / cloakroom → venue-wide. Primary source: `users.venue_id`.
 *     Legacy fallback: derive venue from `user_events` rows. Either way,
 *     returns all events at the resolved venue(s) within the operational
 *     window.
 *   - group_admin / promoter → only their explicit `user_events`.
 *   - admin / super_admin → every event in their org within the operational
 *     window.
 */
export async function getStaffEventIds(
  admin: SupabaseClient,
  userId: string,
  profile: StaffProfile,
): Promise<Set<string>> {
  const eventIds = new Set<string>()

  // user_events memberships — still honored for group_admin/promoter, and
  // as a layering mechanism for scanners (e.g. lend a scanner to a one-off
  // event at a different venue without changing their venue_id).
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

  const { fromIso, toIso } = eventWindow()

  // Venue-wide expansion for scanner / cloakroom.
  //
  // Preferred source: `users.venue_id` — set once per scanner in the admin
  // UI. The scanner is then permanently bound to that venue, so they see
  // every event at it regardless of which `user_events` rows exist. This
  // is the whole point of venue-scoped scanners: if an admin deletes an
  // event or forgets to assign a new one, the scanner at the door must
  // still work.
  //
  // Legacy fallback: if no `venue_id` on the profile, derive venue(s) from
  // the `user_events` rows we already loaded above — preserves behavior
  // for scanner accounts that haven't been migrated yet.
  if (VENUE_WIDE_ROLES.includes(profile.role)) {
    const venueIds = new Set<string>()

    if (profile.venue_id) {
      venueIds.add(profile.venue_id)
    } else if (eventIds.size > 0) {
      const { data: assignedEvents } = await admin
        .from('events')
        .select('venue_id')
        .in('id', [...eventIds])

      for (const e of (assignedEvents || [])) {
        if (e.venue_id) venueIds.add(e.venue_id)
      }
    }

    if (venueIds.size > 0) {
      const { data: venueEvents } = await admin
        .from('events')
        .select('id')
        .in('venue_id', [...venueIds])
        .gte('date', fromIso)
        .lte('date', toIso)

      if (venueEvents) {
        for (const e of venueEvents) eventIds.add(e.id)
      }
    }
  }

  // Org-wide access for admin / super_admin, same operational window.
  const isOrgStaff = profile.role === 'admin' || profile.role === 'super_admin'
  if (isOrgStaff && profile.organization_id) {
    const { data: orgEvents } = await admin
      .from('events')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .gte('date', fromIso)
      .lte('date', toIso)

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
  const ids = await getStaffEventIdsCached(admin, userId)
  return ids.has(eventId)
}

// ── Per-request / short-TTL cache for accessible event IDs ─────────────────
//
// The scan / undo / door-register endpoints are hot paths — a scanner on a
// busy door can hit them tens of times per minute. Resolving the caller's
// accessible event set on every call means 2-5 extra DB round-trips per
// scan. We cache the result in process memory for a short TTL (default 30s)
// so subsequent scans in the same session reuse it. Each Next.js instance
// has its own cache; staleness is bounded by the TTL so role revocations
// still take effect within 30s.

interface CacheEntry {
  ids: Set<string>
  expiresAt: number
}

const eventIdCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

export async function getStaffEventIdsCached(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const now = Date.now()
  const hit = eventIdCache.get(userId)
  if (hit && hit.expiresAt > now) return hit.ids

  const profile = await getStaffProfile(admin, userId)
  if (!profile) {
    eventIdCache.set(userId, {
      ids: new Set(),
      expiresAt: now + CACHE_TTL_MS,
    })
    return new Set()
  }
  const ids = await getStaffEventIds(admin, userId, profile)
  eventIdCache.set(userId, { ids, expiresAt: now + CACHE_TTL_MS })
  return ids
}

/** Invalidate the cache entry for a specific user (used after role changes). */
export function invalidateStaffEventIdsCache(userId: string) {
  eventIdCache.delete(userId)
}
