'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

interface AdminSelectionContextType {
  // Selection state
  selectedDate: string | null
  selectedVenueId: string | null
  selectedEventId: string | null

  // Data
  dates: string[]                // unique dates with events
  venues: Venue[]                // venues for selected date
  events: Event[]                // events for selected venue
  allEvents: Event[]             // all events for selected date (across venues)
  allVenues: Venue[]             // all org venues (for events board)

  // Loading
  loading: boolean

  // Actions
  setDate: (date: string | null) => void
  setVenue: (venueId: string | null) => void
  setEvent: (eventId: string | null) => void
  refresh: () => Promise<void>
}

const AdminSelectionContext = createContext<AdminSelectionContextType | undefined>(undefined)

export function AdminSelectionProvider({ children }: { children: ReactNode }) {
  const { user, organization, isSuperAdmin, isGroupAdmin, events: userEvents } = useAuth()

  const [allOrgEvents, setAllOrgEvents] = useState<Event[]>([])
  const [allVenues, setAllVenues] = useState<Venue[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 1. Load all events + venues
  const refreshData = useCallback(async (restoreSelection = true) => {
    if (!user) return
    setLoading(true)
    try {
      // Fetch events — scoped by role:
      //   super_admin: all org events
      //   group_admin: only events they're assigned to via user_events
      //   admin: events they created
      let evData: Event[] | null = null
      if (isGroupAdmin && userEvents.length > 0) {
        // group_admin: use their event memberships (already loaded in auth context)
        evData = userEvents.map(m => m.event).sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      } else {
        let evQuery = supabase.from('events').select('*').order('date', { ascending: false })
        if (isSuperAdmin && organization?.id) {
          evQuery = evQuery.eq('organization_id', organization.id)
        } else {
          evQuery = evQuery.eq('created_by', user.id)
        }
        const { data } = await evQuery
        evData = data
      }

      // Fetch venues
      let vnQuery = supabase.from('venues').select('*').order('name')
      if (organization?.id) {
        vnQuery = vnQuery.eq('organization_id', organization.id)
      }
      const { data: vnData } = await vnQuery

      setAllOrgEvents(evData || [])
      setAllVenues(vnData || [])

      if (restoreSelection) {
        // Restore from sessionStorage or auto-select first date
        const savedDate = sessionStorage.getItem('admin_date')
        const savedVenue = sessionStorage.getItem('admin_venue')
        const savedEvent = sessionStorage.getItem('admin_event')

        if (savedDate && evData?.some(e => formatDate(e.date) === savedDate)) {
          setSelectedDate(savedDate)
          if (savedVenue) setSelectedVenueId(savedVenue)
          if (savedEvent) setSelectedEventId(savedEvent)
        } else if (evData && evData.length > 0) {
          const firstDate = formatDate(evData[0].date)
          setSelectedDate(firstDate)
        }
      }
    } catch (err) {
      console.error('[AdminContext] Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, organization?.id, isSuperAdmin, isGroupAdmin, userEvents])

  // Initial load on mount
  useEffect(() => {
    refreshData(true)
  }, [refreshData])

  // Derived: unique dates (memoized to avoid new arrays every render)
  const dates = useMemo(
    () => [...new Set(allOrgEvents.map(e => formatDate(e.date)))].sort().reverse(),
    [allOrgEvents]
  )

  // Derived: events for selected date
  const eventsForDate = useMemo(
    () => allOrgEvents.filter(e => selectedDate && formatDate(e.date) === selectedDate),
    [allOrgEvents, selectedDate]
  )

  // Derived: venues for selected date (only venues that have events that day)
  const venuesForDate = useMemo(() => {
    const venueIdsForDate = new Set(eventsForDate.map(e => e.venue_id).filter(Boolean))
    return allVenues.filter(v => venueIdsForDate.has(v.id))
  }, [eventsForDate, allVenues])

  // Derived: events for selected venue
  const eventsForVenue = useMemo(
    () => selectedVenueId ? eventsForDate.filter(e => e.venue_id === selectedVenueId) : eventsForDate,
    [eventsForDate, selectedVenueId]
  )

  // Setters with sessionStorage persistence + cascade
  const setDate = useCallback((date: string | null) => {
    setSelectedDate(date)
    setSelectedVenueId(null)
    setSelectedEventId(null)
    if (date) sessionStorage.setItem('admin_date', date)
    else sessionStorage.removeItem('admin_date')
    sessionStorage.removeItem('admin_venue')
    sessionStorage.removeItem('admin_event')
  }, [])

  const setVenue = useCallback((venueId: string | null) => {
    setSelectedVenueId(venueId)
    setSelectedEventId(null)
    if (venueId) sessionStorage.setItem('admin_venue', venueId)
    else sessionStorage.removeItem('admin_venue')
    sessionStorage.removeItem('admin_event')
  }, [])

  const setEvent = useCallback((eventId: string | null) => {
    setSelectedEventId(eventId)
    if (eventId) sessionStorage.setItem('admin_event', eventId)
    else sessionStorage.removeItem('admin_event')
  }, [])

  // Auto-select first venue when date changes
  useEffect(() => {
    if (selectedDate && venuesForDate.length > 0 && !selectedVenueId) {
      const saved = sessionStorage.getItem('admin_venue')
      if (saved && venuesForDate.some(v => v.id === saved)) {
        setSelectedVenueId(saved)
      } else {
        setSelectedVenueId(venuesForDate[0].id)
        sessionStorage.setItem('admin_venue', venuesForDate[0].id)
      }
    }
  }, [selectedDate, venuesForDate, selectedVenueId])

  // Auto-select first event when venue changes
  useEffect(() => {
    if (selectedVenueId && eventsForVenue.length > 0 && !selectedEventId) {
      const saved = sessionStorage.getItem('admin_event')
      if (saved && eventsForVenue.some(e => e.id === saved)) {
        setSelectedEventId(saved)
        sessionStorage.setItem('admin_event', saved)
      } else {
        setSelectedEventId(eventsForVenue[0].id)
        sessionStorage.setItem('admin_event', eventsForVenue[0].id)
      }
    }
  }, [selectedVenueId, eventsForVenue, selectedEventId])

  const refresh = useCallback(() => refreshData(false), [refreshData])

  const contextValue = useMemo<AdminSelectionContextType>(() => ({
    selectedDate,
    selectedVenueId,
    selectedEventId,
    dates,
    venues: venuesForDate,
    events: eventsForVenue,
    allEvents: eventsForDate,
    allVenues,
    loading,
    setDate,
    setVenue,
    setEvent,
    refresh,
  }), [
    selectedDate, selectedVenueId, selectedEventId,
    dates, venuesForDate, eventsForVenue, eventsForDate, allVenues,
    loading, setDate, setVenue, setEvent, refresh,
  ])

  return (
    <AdminSelectionContext.Provider value={contextValue}>
      {children}
    </AdminSelectionContext.Provider>
  )
}

export function useAdminSelection() {
  const context = useContext(AdminSelectionContext)
  if (context === undefined) {
    throw new Error('useAdminSelection must be used within an AdminSelectionProvider')
  }
  return context
}

// Normalize event date to YYYY-MM-DD string
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toISOString().split('T')[0]
}
