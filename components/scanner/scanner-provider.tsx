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
  multipleEvents: boolean

  // Loading state
  loadingAttendees: boolean
  bootstrapError: string | null

  // Actions
  loadAttendees: () => Promise<void>

  // Sound
  soundEnabled: boolean
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>

  // Refs for scanner callback (stale-closure safe)
  attendeesRef: React.MutableRefObject<AttendeeRow[]>
  eventNameMapRef: React.MutableRefObject<Record<string, string>>
  soundEnabledRef: React.MutableRefObject<boolean>
  loadAttendeesRef: React.MutableRefObject<() => void>

  // Venue name from auth context
  venueName: string
}

const ScannerContext = createContext<ScannerContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────────────

export function ScannerProvider({ children }: { children: ReactNode }) {
  const { venue } = useAuth()

  // Core state
  const [serverEvents, setServerEvents] = useState<ScannerEvent[]>([])
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [stats, setStats] = useState({ total: 0, scanned: 0, pending: 0 })
  const [loadingAttendees, setLoadingAttendees] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Refs for stale-closure safety in scanner callbacks
  const attendeesRef = useRef(attendees)
  const eventNameMapRef = useRef<Record<string, string>>({})
  const soundEnabledRef = useRef(soundEnabled)
  const loadAttendeesRef = useRef<() => void>(() => {})

  // ── Derived data ─────────────────────────────────────────────────────────

  const eventIds = useMemo(() => serverEvents.map((e) => e.id), [serverEvents])

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

  const multipleEvents = eventIds.length > 0

  const doorCount = useMemo(
    () => attendees.filter((a) => a.qr_code.startsWith('DOOR-')).length,
    [attendees],
  )

  // Animated numbers
  const animTotal = useAnimatedNumber(stats.total)
  const animScanned = useAnimatedNumber(stats.scanned)
  const animPending = useAnimatedNumber(stats.pending)

  // ── Keep refs in sync ────────────────────────────────────────────────────

  useEffect(() => {
    attendeesRef.current = attendees
  }, [attendees])
  useEffect(() => {
    eventNameMapRef.current = eventNameMap
  }, [eventNameMap])
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])

  // ── Load attendees ───────────────────────────────────────────────────────

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
      const attArr = data.attendees || []
      const total = attArr.length
      const scanned = attArr.filter((t) => t.status === 'used').length
      setStats({ total, scanned, pending: total - scanned })
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

  // ── Realtime subscriptions ───────────────────────────────────────────────

  useEffect(() => {
    if (eventIds.length === 0) return
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
          () => {
            loadAttendeesRef.current()
          },
        )
        .subscribe(),
    )
    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  }, [eventIds])

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
      multipleEvents,
      loadingAttendees,
      bootstrapError,
      loadAttendees,
      soundEnabled,
      setSoundEnabled,
      attendeesRef,
      eventNameMapRef,
      soundEnabledRef,
      loadAttendeesRef,
      venueName: venue?.name || '',
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
      multipleEvents,
      loadingAttendees,
      bootstrapError,
      loadAttendees,
      soundEnabled,
      venue?.name,
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
