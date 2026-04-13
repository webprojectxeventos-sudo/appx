'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Plus, ChevronDown } from 'lucide-react'
import { SearchInput } from '@/components/admin/search-input'
import { DateStrip } from '@/components/admin/events/date-strip'
import { VenueCard } from '@/components/admin/events/venue-card'
import { NewSessionModal } from '@/components/admin/events/new-session-modal'
import { GroupDetailDrawer } from '@/components/admin/events/group-detail-drawer'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toISOString().split('T')[0]
}

export default function EventsPage() {
  const { user, organization, isSuperAdmin, isAdmin, initialized } = useAuth()
  const adminCtx = useAdminSelection()

  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [allVenues, setAllVenues] = useState<Venue[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Modals
  const [showNewSession, setShowNewSession] = useState(false)
  const [showAddVenue, setShowAddVenue] = useState(false)

  // Track manually added empty venues for a date
  const [manualVenues, setManualVenues] = useState<Set<string>>(new Set())

  // Drawer for group detail
  const [drawerEvent, setDrawerEvent] = useState<Event | null>(null)

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let evQuery = supabase.from('events').select('*').order('date', { ascending: true })
      if (isSuperAdmin && organization?.id) {
        evQuery = evQuery.eq('organization_id', organization.id)
      } else {
        evQuery = evQuery.eq('created_by', user.id)
      }
      const { data: evData } = await evQuery

      let vnQuery = supabase.from('venues').select('*').order('name')
      if (organization?.id) {
        vnQuery = vnQuery.eq('organization_id', organization.id)
      }
      const { data: vnData } = await vnQuery

      setAllEvents(evData || [])
      setAllVenues(vnData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, organization?.id, isSuperAdmin])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRefresh = useCallback(async () => {
    await fetchData()
    adminCtx.refresh()
  }, [fetchData, adminCtx.refresh])

  // Derived: unique dates sorted chronologically
  const dates = useMemo(() => {
    const set = new Set(allEvents.map(e => formatDate(e.date)))
    return [...set].sort()
  }, [allEvents])

  // Event counts per date
  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of allEvents) {
      const d = formatDate(e.date)
      counts[d] = (counts[d] || 0) + 1
    }
    return counts
  }, [allEvents])

  // Auto-select first date (or closest future date)
  useEffect(() => {
    if (selectedDate && dates.includes(selectedDate)) return
    if (dates.length === 0) { setSelectedDate(null); return }
    const today = new Date().toISOString().split('T')[0]
    const futureDate = dates.find(d => d >= today)
    setSelectedDate(futureDate || dates[dates.length - 1])
  }, [dates, selectedDate])

  // Clear manual venues when date changes
  useEffect(() => {
    setManualVenues(new Set())
  }, [selectedDate])

  // Events for selected date
  const eventsForDate = useMemo(() =>
    allEvents.filter(e => selectedDate && formatDate(e.date) === selectedDate),
    [allEvents, selectedDate]
  )

  // Filter by search
  const filteredEvents = useMemo(() => {
    if (!search.trim()) return eventsForDate
    const q = search.toLowerCase()
    return eventsForDate.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.event_code.toLowerCase().includes(q) ||
      (e.group_name || '').toLowerCase().includes(q)
    )
  }, [eventsForDate, search])

  // Group events by venue
  const venueGroups = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const e of filteredEvents) {
      if (!e.venue_id) continue
      const arr = map.get(e.venue_id) || []
      arr.push(e)
      map.set(e.venue_id, arr)
    }
    return map
  }, [filteredEvents])

  // Events without venue (standalone)
  const ungroupedEvents = useMemo(() =>
    filteredEvents.filter(e => !e.venue_id),
    [filteredEvents]
  )

  // Venues to display: those with events + manually added
  const displayVenues = useMemo(() => {
    const venueIds = new Set([...venueGroups.keys(), ...manualVenues])
    return allVenues.filter(v => venueIds.has(v.id))
  }, [allVenues, venueGroups, manualVenues])

  // Venues not on this date (for "add venue" dropdown)
  const availableVenues = useMemo(() => {
    const usedIds = new Set(displayVenues.map(v => v.id))
    return allVenues.filter(v => !usedIds.has(v.id))
  }, [allVenues, displayVenues])

  // Handle new session creation — actually insert placeholder events for each venue
  const handleSessionCreated = async (date: string, venueIds: string[], time: string) => {
    setSelectedDate(date)
    if (venueIds.length > 0 && user?.id && organization?.id) {
      // Check which venues already have events on this date
      const existingVenueIds = new Set(
        allEvents
          .filter(e => formatDate(e.date) === date)
          .map(e => e.venue_id)
          .filter(Boolean)
      )
      const newVenueIds = venueIds.filter(id => !existingVenueIds.has(id))
      const dateTime = `${date}T${time || '22:00'}:00`

      if (newVenueIds.length > 0) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        const genCode = () => {
          let code = ''
          for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
          return code
        }
        const venueLookup = new Map(allVenues.map(v => [v.id, v]))
        const inserts = newVenueIds.map(venueId => {
          const v = venueLookup.get(venueId)
          return {
            title: v?.name || 'Nuevo evento',
            group_name: v?.name || 'Nuevo evento',
            date: dateTime,
            venue_id: venueId,
            event_type: 'fiesta' as const,
            event_code: genCode(),
            organization_id: organization.id,
            created_by: user.id,
          }
        })
        await supabase.from('events').insert(inserts)
        await fetchData()
      } else {
        // All venues already have events, just show them
        setManualVenues(new Set(venueIds))
      }
    }
  }

  // Handle adding a venue to current date
  const handleAddVenue = (venueId: string) => {
    setManualVenues(prev => new Set([...prev, venueId]))
    setShowAddVenue(false)
  }

  if (!initialized) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="card h-48 animate-pulse" />)}
        </div>
      </div>
    )
  }
  if (!isAdmin) return null

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Eventos</h1>
          <p className="text-sm text-white-muted mt-0.5">Gestiona tus eventos y grupos</p>
        </div>
        <button onClick={() => setShowNewSession(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Crear Sesión
        </button>
      </div>

      {/* Date strip */}
      {dates.length > 0 && (
        <DateStrip
          dates={dates}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          onAddDate={() => setShowNewSession(true)}
          eventCounts={eventCounts}
        />
      )}

      {/* Search (only when there are events) */}
      {eventsForDate.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar grupos por nombre o codigo..."
        />
      )}

      {/* Board: Venue columns */}
      {selectedDate && (
        <div className="flex flex-col md:flex-row gap-4 md:overflow-x-auto pb-2 scrollbar-hide">
          {displayVenues.map(venue => (
            <VenueCard
              key={venue.id}
              venue={venue}
              groups={venueGroups.get(venue.id) || []}
              otherVenues={displayVenues.filter(v => v.id !== venue.id)}
              date={selectedDate}
              organizationId={organization?.id || ''}
              userId={user?.id || ''}
              onRefresh={handleRefresh}
              onSelectGroup={setDrawerEvent}
            />
          ))}

          {/* Add venue button */}
          {availableVenues.length > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowAddVenue(!showAddVenue)}
                className="flex flex-col items-center justify-center min-w-[200px] h-32 rounded-2xl border border-dashed border-black-border text-white-muted hover:border-primary/30 hover:text-primary transition-all"
              >
                <Plus className="w-5 h-5 mb-1.5" />
                <span className="text-sm font-medium">Añadir venue</span>
                <ChevronDown className="w-3.5 h-3.5 mt-0.5" />
              </button>
              {showAddVenue && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[220px] py-1 rounded-xl border border-black-border bg-black-card shadow-xl">
                  {availableVenues.map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleAddVenue(v.id)}
                      className="w-full text-left px-3 py-2.5 text-sm text-white hover:bg-white/5 transition-colors"
                    >
                      <span className="block">{v.name}</span>
                      {v.city && <span className="text-[11px] text-white-muted">{v.city}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ungrouped events (without venue) */}
      {ungroupedEvents.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-white mb-2">Sin venue asignado ({ungroupedEvents.length})</h3>
          <div className="space-y-1">
            {ungroupedEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-white/[0.03]">
                <span className="text-sm text-white">{ev.title}</span>
                <span className="text-[10px] font-mono text-white-muted bg-white/5 px-1.5 py-0.5 rounded">{ev.event_code}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {dates.length === 0 && !loading && (
        <div className="card-accent p-12 text-center">
          <p className="text-white-muted mb-4">No hay eventos todavía. Crea tu primera sesión para empezar.</p>
          <button onClick={() => setShowNewSession(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Crear primera sesión
          </button>
        </div>
      )}

      {/* Summary bar */}
      {selectedDate && eventsForDate.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-white-muted">
          <span><span className="text-white font-medium">{eventsForDate.length}</span> grupos</span>
          <span><span className="text-white font-medium">{displayVenues.length}</span> venues</span>
          <span className="capitalize">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      )}

      {/* New session modal */}
      <NewSessionModal
        open={showNewSession}
        onClose={() => setShowNewSession(false)}
        allVenues={allVenues}
        existingDates={dates}
        onCreated={handleSessionCreated}
      />

      {/* Group detail drawer */}
      <GroupDetailDrawer
        event={drawerEvent}
        venueName={drawerEvent?.venue_id ? allVenues.find(v => v.id === drawerEvent.venue_id)?.name : undefined}
        date={selectedDate || undefined}
        onClose={() => setDrawerEvent(null)}
      />
    </div>
  )
}
