'use client'

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

export interface EventTicket {
  eventId: string
  qrCode: string
}

interface HomeEventContextType {
  /** ID of the event currently shown on home (local, updates INSTANTLY on swipe). */
  viewedEventId: string | null
  /** Full event row for the viewed event. */
  viewedEvent: Event | null
  /** 0-based index of viewedEvent inside availableEvents. */
  viewedIndex: number
  /** All events the user belongs to, ordered by proximity (closest upcoming first). */
  availableEvents: Event[]
  /** Change which event is visible. Local change is immediate; backend sync is debounced. */
  setViewedEventId: (id: string) => void
  /** Navigate to the neighbour event (used by swipe gestures). Clamped to [0, length). */
  goToIndex: (index: number) => void
  /** Tickets keyed by event_id for O(1) QR lookup inside each HomePanel. */
  ticketsByEvent: Record<string, string>
  /** Venues keyed by event_id — preloaded so panels don't flicker on swipe. */
  venuesByEvent: Record<string, Venue | null>
  /** Whether the local view differs from the persisted auth.event (sync pending). */
  syncing: boolean
}

const HomeEventContext = createContext<HomeEventContextType | undefined>(undefined)

const SYNC_DEBOUNCE_MS = 600

/**
 * Sort events by proximity to now:
 *   - Future/today events ascending by date (closest upcoming first)
 *   - Past events descending (most recent past first) after all future events
 *
 * An event counts as "current" until end-of-local-day on its calendar date,
 * plus ~8h morning-after grace. A flat 12h grace over millis prematurely
 * buries a night-club event that started at 22:00 the night before, even
 * though attendees still think of it as "la fiesta de hoy".
 */
function sortByProximity(events: Event[]): Event[] {
  const now = Date.now()
  const isCurrent = (ts: number) => {
    if (ts >= now) return true
    const d = new Date(ts)
    const endOfLocalDay = new Date(
      d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999,
    ).getTime()
    return now <= endOfLocalDay + 8 * 60 * 60 * 1000
  }
  return [...events]
    .map((e) => {
      const ts = new Date(e.date).getTime()
      // Treat invalid dates as "very far in the past" so they sink to the
      // bottom instead of corrupting the comparator with NaN.
      return { e, ts: Number.isFinite(ts) ? ts : -Infinity }
    })
    .sort((a, b) => {
      const aFuture = isCurrent(a.ts)
      const bFuture = isCurrent(b.ts)
      if (aFuture && !bFuture) return -1
      if (!aFuture && bFuture) return 1
      if (aFuture && bFuture) return a.ts - b.ts
      return b.ts - a.ts
    })
    .map(({ e }) => e)
}

/**
 * HomeEventProvider — powers the multi-event swipeable home.
 *
 * Responsibilities:
 *   1. Exposes a local "viewed event" that updates instantly on swipe/tap.
 *   2. Debounces a backend sync (users.event_id) so that chat/polls/etc. follow
 *      the user's final choice, without a roundtrip per swipe.
 *   3. Preloads all tickets once so each HomePanel can pull its QR in O(1).
 *
 * The active event from auth-context is still the source of truth for what's
 * persisted; the viewed event is purely a UI concept that may lag or lead.
 */
export function HomeEventProvider({ children }: { children: ReactNode }) {
  const { user, event: activeEvent, events: memberships, switchEvent } = useAuth()

  // Deduplicate memberships — a user can appear in user_events twice if there
  // was ever a historical reassignment. Keep the most recent membership per
  // event and rely on sortByProximity for final order.
  const availableEvents = useMemo<Event[]>(() => {
    const byId = new Map<string, Event>()
    for (const m of memberships) {
      if (!m.event) continue
      byId.set(m.event.id, m.event)
    }
    // Always include the persisted active event in case memberships haven't
    // loaded yet on first paint — prevents a flash of empty state.
    if (activeEvent && !byId.has(activeEvent.id)) byId.set(activeEvent.id, activeEvent)
    return sortByProximity([...byId.values()])
  }, [memberships, activeEvent])

  // Viewed event — local, updates on swipe/tap
  const [viewedEventId, setViewedEventIdState] = useState<string | null>(null)

  // Initialize viewedEventId the first time we know the available events.
  // Prefer the persisted active event so the user opens on whatever they
  // last chose; if that's gone, fall back to the closest upcoming.
  useEffect(() => {
    if (availableEvents.length === 0) return
    if (viewedEventId && availableEvents.some((e) => e.id === viewedEventId)) return
    const preferred =
      (activeEvent && availableEvents.find((e) => e.id === activeEvent.id)) ||
      availableEvents[0]
    setViewedEventIdState(preferred.id)
  }, [availableEvents, activeEvent, viewedEventId])

  const viewedEvent = useMemo(
    () => availableEvents.find((e) => e.id === viewedEventId) ?? null,
    [availableEvents, viewedEventId],
  )

  const viewedIndex = useMemo(
    () => availableEvents.findIndex((e) => e.id === viewedEventId),
    [availableEvents, viewedEventId],
  )

  // Debounced backend sync — so a swipe that passes through 3 events doesn't
  // trigger 3 round-trips; only the one the user lands on for >600ms persists.
  const [syncing, setSyncing] = useState(false)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleSync = useCallback(
    (id: string) => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
      // No-op if we're already on the persisted event
      if (activeEvent?.id === id) {
        setSyncing(false)
        return
      }
      setSyncing(true)
      syncTimer.current = setTimeout(async () => {
        try {
          await switchEvent(id)
        } catch (err) {
          console.error('[HomeEvent] Failed to sync active event:', err)
        } finally {
          setSyncing(false)
        }
      }, SYNC_DEBOUNCE_MS)
    },
    [activeEvent?.id, switchEvent],
  )

  const setViewedEventId = useCallback(
    (id: string) => {
      if (!availableEvents.some((e) => e.id === id)) return
      setViewedEventIdState(id)
      scheduleSync(id)
    },
    [availableEvents, scheduleSync],
  )

  const goToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(availableEvents.length - 1, index))
      const target = availableEvents[clamped]
      if (target) setViewedEventId(target.id)
    },
    [availableEvents, setViewedEventId],
  )

  // Cancel any pending sync on unmount
  useEffect(() => {
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current)
    }
  }, [])

  // Preload ALL user tickets once — each HomePanel reads its QR from here.
  // A single query keeps us from hammering Supabase on every swipe.
  const [ticketsByEvent, setTicketsByEvent] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    supabase
      .from('tickets')
      .select('event_id, qr_code')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled || !data) return
        const map: Record<string, string> = {}
        for (const row of data) {
          if (row.event_id && row.qr_code) map[row.event_id] = row.qr_code
        }
        setTicketsByEvent(map)
      })
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Preload venues for all available events. Keeps panel switches instant —
  // without this, each swipe would trigger a venue fetch and the map/address
  // would flicker. Keyed by event.id (not venue.id) so panels can look up
  // their venue without knowing the foreign-key relationship.
  const [venuesByEvent, setVenuesByEvent] = useState<Record<string, Venue | null>>({})
  useEffect(() => {
    if (availableEvents.length === 0) return
    const venueIds = Array.from(
      new Set(availableEvents.map((e) => e.venue_id).filter((v): v is string => !!v)),
    )
    if (venueIds.length === 0) return
    let cancelled = false
    supabase
      .from('venues')
      .select('*')
      .in('id', venueIds)
      .then(({ data }) => {
        if (cancelled || !data) return
        const venueById = new Map<string, Venue>()
        for (const v of data) venueById.set(v.id, v)
        const map: Record<string, Venue | null> = {}
        for (const ev of availableEvents) {
          map[ev.id] = ev.venue_id ? venueById.get(ev.venue_id) ?? null : null
        }
        setVenuesByEvent(map)
      })
    return () => {
      cancelled = true
    }
  }, [availableEvents])

  const value = useMemo<HomeEventContextType>(
    () => ({
      viewedEventId,
      viewedEvent,
      viewedIndex,
      availableEvents,
      setViewedEventId,
      goToIndex,
      ticketsByEvent,
      venuesByEvent,
      syncing,
    }),
    [
      viewedEventId,
      viewedEvent,
      viewedIndex,
      availableEvents,
      setViewedEventId,
      goToIndex,
      ticketsByEvent,
      venuesByEvent,
      syncing,
    ],
  )

  return <HomeEventContext.Provider value={value}>{children}</HomeEventContext.Provider>
}

export function useHomeEvent() {
  const ctx = useContext(HomeEventContext)
  if (!ctx) throw new Error('useHomeEvent must be used inside <HomeEventProvider>')
  return ctx
}
