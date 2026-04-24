'use client'

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { AttendeeRow, ScannerEvent, DayGroup } from './scanner-types'
import { useAnimatedNumber } from './scanner-utils'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import * as outbox from '@/lib/scanner-outbox'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'

// ── Context shape ──────────────────────────────────────────────────────────

interface ScannerContextValue {
  // Data
  serverEvents: ScannerEvent[]
  attendees: AttendeeRow[]
  stats: { total: number; scanned: number; pending: number }
  animTotal: number
  animScanned: number
  animPending: number
  eventIds: string[]
  eventNameMap: Record<string, string>
  eventsByDay: DayGroup[]
  doorCount: number

  // Loading state
  loadingAttendees: boolean
  bootstrapError: string | null

  // Day-level focus — 'all' means show every day at this venue, else only that day's events.
  // Stats, doorCount, metrics, and per-tab filtering all respect this scope so the scanner
  // is "one day at a time" (the venue is implicit in the login; the operator only needs
  // to pick which day they're working). Per-group selection is intentionally removed —
  // inside a day, all groups are aggregated automatically.
  selectedDayKey: string | 'all'
  setSelectedDayKey: (key: string | 'all') => void
  /** Events belonging to the currently selected day (or all venue events when 'all'). */
  selectedDayEvents: ScannerEvent[]
  /** True when there is more than one day to choose from — drives the day-picker UI. */
  multipleDays: boolean
  /** True when the current day has more than one event/group — drives door-tab disambiguation. */
  multipleEventsInDay: boolean
  /** Filtered set: attendees belonging to the events of the selected day. */
  filteredAttendees: AttendeeRow[]

  // Actions
  loadAttendees: () => Promise<void>
  /** Merge a ticket row into local state (used by scan/door actions for instant feedback). */
  patchAttendee: (row: Partial<AttendeeRow> & { id: string }) => void

  // Sound
  soundEnabled: boolean
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>

  // Refs for scanner callback (stale-closure safe)
  attendeesRef: React.MutableRefObject<AttendeeRow[]>
  attendeesByQrRef: React.MutableRefObject<Map<string, AttendeeRow>>
  eventNameMapRef: React.MutableRefObject<Record<string, string>>
  soundEnabledRef: React.MutableRefObject<boolean>
  loadAttendeesRef: React.MutableRefObject<() => void>

  // Venue name from auth context
  venueName: string

  // Offline / outbox
  online: boolean
  pendingSyncCount: number
  pendingItems: outbox.OutboxItem[]
  flushOutbox: () => Promise<void>
  clearFailedOutbox: () => Promise<void>

  // Live metrics (recompute with `now` tick every 60s)
  metrics: {
    /** Scans per minute over the last 5 minutes (rolling). */
    velocityPerMin: number
    /** Milliseconds to reach 100% at current velocity; null if velocity == 0. */
    etaMs: number | null
    /** Hour (0..23) with most scans today; null if no scans. */
    peakHour: number | null
    /** Scans per 15-minute bucket over the last 2h (oldest → newest). Length: 8. */
    sparkline: number[]
  }
}

const ScannerContext = createContext<ScannerContextValue | null>(null)

type TicketRow = {
  id: string
  user_id: string
  event_id: string
  qr_code: string
  status: AttendeeRow['status']
  scanned_at: string | null
  created_at: string
}

// ── Provider ───────────────────────────────────────────────────────────────

export function ScannerProvider({ children }: { children: ReactNode }) {
  const { venue } = useAuth()
  const online = useOnlineStatus()

  // Core state
  const [serverEvents, setServerEvents] = useState<ScannerEvent[]>([])
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [pendingItems, setPendingItems] = useState<outbox.OutboxItem[]>([])

  // Which day the scanner is focused on. 'all' = show every day at this venue.
  // Persisted in sessionStorage so a page reload keeps the same focus during the event.
  // Per-group selection was removed on purpose — the operator picks venue (implicit via
  // login) + day, and everything inside that day is aggregated.
  const [selectedDayKey, setSelectedDayKeyState] = useState<string | 'all'>(() => {
    if (typeof window === 'undefined') return 'all'
    try {
      return (sessionStorage.getItem('scanner:selectedDayKey') as string) || 'all'
    } catch {
      return 'all'
    }
  })
  const setSelectedDayKey = useCallback((key: string | 'all') => {
    setSelectedDayKeyState(key)
    try {
      sessionStorage.setItem('scanner:selectedDayKey', key)
    } catch {
      /* sessionStorage may be disabled */
    }
  }, [])

  // Refs for stale-closure safety in scanner callbacks
  const attendeesRef = useRef(attendees)
  const eventNameMapRef = useRef<Record<string, string>>({})
  const soundEnabledRef = useRef(soundEnabled)
  const loadAttendeesRef = useRef<() => void>(() => {})
  // O(1) QR lookup — rebuilt whenever attendees change. Avoids the O(n)
  // `attendees.find(a => a.qr_code === qr)` on every scan: with 5000 rows,
  // that's a full array scan on the hot path just to fetch a display name.
  const attendeesByQrRef = useRef<Map<string, AttendeeRow>>(new Map())

  // ── Derived data ─────────────────────────────────────────────────────────

  const eventIds = useMemo(() => serverEvents.map((e) => e.id), [serverEvents])
  const eventIdsKey = useMemo(() => eventIds.join(','), [eventIds])

  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    serverEvents.forEach((e) => {
      map[e.id] = e.group_name || e.title
    })
    return map
  }, [serverEvents])

  const eventsByDay = useMemo<DayGroup[]>(() => {
    if (serverEvents.length === 0) return []
    const groups = new Map<string, ScannerEvent[]>()
    for (const ev of serverEvents) {
      const key = new Date(ev.date).toDateString()
      const arr = groups.get(key) || []
      arr.push(ev)
      groups.set(key, arr)
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }
    const now = new Date()
    const todayKey = now.toDateString()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowKey = tomorrow.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = yesterday.toDateString()

    return [...groups.entries()]
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([key, events]) => {
        let label: string
        if (key === todayKey) label = 'Hoy'
        else if (key === tomorrowKey) label = 'Mañana'
        else if (key === yesterdayKey) label = 'Ayer'
        else
          label = new Date(key).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
        return { key, label, events }
      })
  }, [serverEvents])

  // Selected-day derivations. All per-scope state (stats, filtered list, metrics)
  // flows from `selectedDayEvents` → there is no per-group scope anymore.
  const selectedDayEvents = useMemo<ScannerEvent[]>(() => {
    if (selectedDayKey === 'all') return serverEvents
    const day = eventsByDay.find((d) => d.key === selectedDayKey)
    return day?.events ?? []
  }, [selectedDayKey, eventsByDay, serverEvents])

  const selectedDayEventIds = useMemo(
    () => new Set(selectedDayEvents.map((e) => e.id)),
    [selectedDayEvents],
  )

  const multipleDays = eventsByDay.length > 1
  const multipleEventsInDay = selectedDayEvents.length > 1

  // Auto-default the day focus when:
  //   - nothing selected yet (first load, selectedDayKey is 'all'), OR
  //   - the previously-selected day is no longer in the event list (events
  //     were rescheduled or the operator was reassigned).
  // The picker UI doesn't expose 'all' as an option; we prefer a concrete day
  // so the operator sees a meaningful day-scoped view from the first render.
  // Preferred day:
  //   0) today's calendar day if it has events (fixes past-midnight parties
  //      where the live window has elapsed by morning) >
  //   1) any day with an event in the live-ish window (−6h..+24h) >
  //   2) earliest upcoming day >
  //   3) last day overall.
  useEffect(() => {
    if (eventsByDay.length === 0) return
    const hasConcreteSelection =
      selectedDayKey !== 'all' && eventsByDay.some((d) => d.key === selectedDayKey)
    if (hasConcreteSelection) return

    const now = Date.now()
    const hourMs = 3_600_000
    let bestKey: string | null = null

    // 0) Same calendar day as now. Night-club events start at 00:00 Madrid
    //    and get scanned through the night and next morning. Without this,
    //    by ~09:00 the event is −9h old → out of the live window below, and
    //    the picker would drift to the next future day (first upcoming).
    const todayKey = new Date(now).toDateString()
    if (eventsByDay.some((d) => d.key === todayKey)) {
      bestKey = todayKey
    }

    // 1) Any day with a live-ish event.
    if (!bestKey) {
      for (const d of eventsByDay) {
        const hasLive = d.events.some((ev) => {
          const delta = new Date(ev.date).getTime() - now
          return delta >= -6 * hourMs && delta <= 24 * hourMs
        })
        if (hasLive) {
          bestKey = d.key
          break
        }
      }
    }

    // 2) Earliest upcoming.
    if (!bestKey) {
      for (const d of eventsByDay) {
        if (d.events.some((ev) => new Date(ev.date).getTime() >= now - hourMs)) {
          bestKey = d.key
          break
        }
      }
    }

    // 3) Last-day fallback.
    if (!bestKey) bestKey = eventsByDay[eventsByDay.length - 1].key

    setSelectedDayKeyState(bestKey)
    try {
      sessionStorage.setItem('scanner:selectedDayKey', bestKey)
    } catch {
      /* sessionStorage may be disabled */
    }
  }, [eventsByDay, selectedDayKey])

  // Filtered attendees — single source of truth for all scoped derived data.
  // When 'all' is selected we pass through the full list (no overhead).
  const filteredAttendees = useMemo(() => {
    if (selectedDayKey === 'all') return attendees
    return attendees.filter((a) => selectedDayEventIds.has(a.event_id))
  }, [attendees, selectedDayKey, selectedDayEventIds])

  const doorCount = useMemo(
    () => filteredAttendees.filter((a) => a.qr_code.startsWith('DOOR-')).length,
    [filteredAttendees],
  )

  // Stats derived from filteredAttendees so the Stats bar shows the selected scope.
  const stats = useMemo(() => {
    const total = filteredAttendees.length
    const scanned = filteredAttendees.filter((t) => t.status === 'used').length
    return { total, scanned, pending: total - scanned }
  }, [filteredAttendees])

  // `now` tick — drives rolling-window metrics. Updates every 60s so the
  // velocity / eta / sparkline stay fresh without being expensive.
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const metrics = useMemo(() => {
    const fiveMinAgo = now - 5 * 60_000
    const twoHoursAgo = now - 2 * 60 * 60_000
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()

    let scansLast5Min = 0
    const bucketCount = 8 // 2h / 15min
    const bucketMs = 15 * 60_000
    const buckets = new Array<number>(bucketCount).fill(0)
    const hourCounts: Record<number, number> = {}

    for (const a of filteredAttendees) {
      if (a.status !== 'used' || !a.scanned_at) continue
      const t = new Date(a.scanned_at).getTime()
      if (Number.isNaN(t)) continue

      if (t >= fiveMinAgo) scansLast5Min++

      if (t >= twoHoursAgo && t <= now) {
        const idx = Math.min(
          bucketCount - 1,
          Math.floor((t - twoHoursAgo) / bucketMs),
        )
        buckets[idx]++
      }

      if (t >= todayStart) {
        const hour = new Date(t).getHours()
        hourCounts[hour] = (hourCounts[hour] || 0) + 1
      }
    }

    const velocityPerMin = scansLast5Min / 5
    const pending = stats.pending
    const etaMs =
      velocityPerMin > 0 && pending > 0
        ? (pending / velocityPerMin) * 60_000
        : null

    let peakHour: number | null = null
    let peakCount = 0
    for (const [hStr, count] of Object.entries(hourCounts)) {
      if (count > peakCount) {
        peakCount = count
        peakHour = Number(hStr)
      }
    }

    return {
      velocityPerMin,
      etaMs,
      peakHour,
      sparkline: buckets,
    }
  }, [filteredAttendees, stats.pending, now])

  // Animated numbers
  const animTotal = useAnimatedNumber(stats.total)
  const animScanned = useAnimatedNumber(stats.scanned)
  const animPending = useAnimatedNumber(stats.pending)

  // ── Keep refs in sync ────────────────────────────────────────────────────

  useEffect(() => {
    attendeesRef.current = attendees
    const map = new Map<string, AttendeeRow>()
    for (const a of attendees) {
      if (a.qr_code) map.set(a.qr_code, a)
    }
    attendeesByQrRef.current = map
  }, [attendees])
  useEffect(() => {
    eventNameMapRef.current = eventNameMap
  }, [eventNameMap])
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  // ── In-place patcher (used by realtime + local action feedback) ──────────

  const patchAttendee = useCallback(
    (row: Partial<AttendeeRow> & { id: string }) => {
      setAttendees((prev) => {
        const idx = prev.findIndex((a) => a.id === row.id)
        if (idx === -1) return prev
        const next = prev.slice()
        next[idx] = { ...prev[idx], ...row }
        return next
      })
    },
    [],
  )

  // ── Load attendees (initial + manual refresh only) ───────────────────────

  const loadAttendees = useCallback(async () => {
    setLoadingAttendees(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setLoadingAttendees(false)
        return
      }
      const res = await fetch('/api/scanner/attendees', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        setBootstrapError(errBody.error || `HTTP ${res.status}`)
        return
      }
      const data = (await res.json()) as {
        events: ScannerEvent[]
        attendees: AttendeeRow[]
      }
      setBootstrapError(null)
      setServerEvents(data.events || [])
      setAttendees(data.attendees || [])
    } catch (err) {
      console.error('Error loading attendees:', err)
      setBootstrapError('Error de conexion')
    } finally {
      setLoadingAttendees(false)
    }
  }, [])

  useEffect(() => {
    loadAttendeesRef.current = loadAttendees
  }, [loadAttendees])
  useEffect(() => {
    loadAttendees()
  }, [loadAttendees])

  // ── Outbox: subscribe + auto-flush ───────────────────────────────────────

  const refreshPending = useCallback(async () => {
    const items = await outbox.pending()
    setPendingItems(items)
  }, [])

  const getAuthToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  const flushOutbox = useCallback(async () => {
    await outbox.flush({ getAuthToken })
    await refreshPending()
  }, [getAuthToken, refreshPending])

  const clearFailedOutbox = useCallback(async () => {
    await outbox.clearFailed()
    await refreshPending()
  }, [refreshPending])

  // Initial load + subscribe
  useEffect(() => {
    refreshPending()
    const unsub = outbox.subscribe(() => {
      refreshPending()
    })
    return unsub
  }, [refreshPending])

  // Auto-flush when online, with a periodic retry while pending items exist
  useEffect(() => {
    if (!online) return
    let cancelled = false
    const run = async () => {
      if (cancelled) return
      await flushOutbox()
    }
    run()
    const interval = setInterval(() => {
      if (!cancelled) run()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [online, flushOutbox])

  const pendingSyncCount = useMemo(
    () => pendingItems.filter((i) => i.status === 'pending').length,
    [pendingItems],
  )

  // ── Realtime subscriptions ───────────────────────────────────────────────
  //
  // Instead of refetching the whole attendees list on every change, we apply
  // the postgres_changes payload in-place. This cuts realtime-driven IO from
  // O(N scanners * M tickets) per scan to O(1). On INSERT we fetch only the
  // one user row we are missing.

  useEffect(() => {
    if (eventIds.length === 0) return

    const applyUpdate = (newRow: TicketRow) => {
      setAttendees((prev) => {
        const idx = prev.findIndex((a) => a.id === newRow.id)
        if (idx === -1) return prev
        const next = prev.slice()
        next[idx] = {
          ...prev[idx],
          qr_code: newRow.qr_code,
          status: newRow.status,
          scanned_at: newRow.scanned_at,
          created_at: newRow.created_at,
          event_id: newRow.event_id,
          user_id: newRow.user_id,
        }
        return next
      })
    }

    const applyDelete = (oldRow: Pick<TicketRow, 'id'>) => {
      setAttendees((prev) => prev.filter((a) => a.id !== oldRow.id))
    }

    const applyInsert = async (newRow: TicketRow) => {
      // Skip if we already have this id (e.g. we optimistically added it)
      if (attendeesRef.current.some((a) => a.id === newRow.id)) {
        applyUpdate(newRow)
        return
      }
      // Fetch just this user's display info — 1 row instead of reloading everything
      let user_name: string | null = null
      let user_email = ''
      try {
        const { data: u } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', newRow.user_id)
          .single()
        if (u) {
          user_name = u.full_name ?? null
          user_email = u.email ?? ''
        }
      } catch {
        /* use placeholder */
      }
      setAttendees((prev) => {
        if (prev.some((a) => a.id === newRow.id)) return prev
        const next: AttendeeRow = {
          id: newRow.id,
          user_id: newRow.user_id,
          event_id: newRow.event_id,
          qr_code: newRow.qr_code,
          status: newRow.status,
          scanned_at: newRow.scanned_at,
          created_at: newRow.created_at,
          user_name,
          user_email,
        }
        return [next, ...prev]
      })
    }

    const handle = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) => {
      const eventType = payload.eventType
      if (eventType === 'INSERT') {
        applyInsert(payload.new as unknown as TicketRow)
      } else if (eventType === 'UPDATE') {
        applyUpdate(payload.new as unknown as TicketRow)
      } else if (eventType === 'DELETE') {
        applyDelete(payload.old as unknown as { id: string })
      }
    }

    const channels = eventIds.map((eid) =>
      supabase
        .channel(`scanner-tickets-${eid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tickets',
            filter: `event_id=eq.${eid}`,
          },
          handle,
        )
        .subscribe(),
    )
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
    // eventIdsKey captures the content, not the array reference, so we don't
    // tear down and re-subscribe on every render when the events list is the
    // same but loadAttendees returned a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventIdsKey])

  // ── Context value ────────────────────────────────────────────────────────

  const value = useMemo<ScannerContextValue>(
    () => ({
      serverEvents,
      attendees,
      stats,
      animTotal,
      animScanned,
      animPending,
      eventIds,
      eventNameMap,
      eventsByDay,
      doorCount,
      loadingAttendees,
      bootstrapError,
      selectedDayKey,
      setSelectedDayKey,
      selectedDayEvents,
      multipleDays,
      multipleEventsInDay,
      filteredAttendees,
      loadAttendees,
      patchAttendee,
      soundEnabled,
      setSoundEnabled,
      attendeesRef,
      attendeesByQrRef,
      eventNameMapRef,
      soundEnabledRef,
      loadAttendeesRef,
      venueName: venue?.name || '',
      online,
      pendingSyncCount,
      pendingItems,
      flushOutbox,
      clearFailedOutbox,
      metrics,
    }),
    [
      serverEvents,
      attendees,
      stats,
      animTotal,
      animScanned,
      animPending,
      eventIds,
      eventNameMap,
      eventsByDay,
      doorCount,
      loadingAttendees,
      bootstrapError,
      selectedDayKey,
      setSelectedDayKey,
      selectedDayEvents,
      multipleDays,
      multipleEventsInDay,
      filteredAttendees,
      loadAttendees,
      patchAttendee,
      soundEnabled,
      venue?.name,
      online,
      pendingSyncCount,
      pendingItems,
      flushOutbox,
      clearFailedOutbox,
      metrics,
    ],
  )

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useScanner() {
  const ctx = useContext(ScannerContext)
  if (!ctx) throw new Error('useScanner must be used within <ScannerProvider>')
  return ctx
}
