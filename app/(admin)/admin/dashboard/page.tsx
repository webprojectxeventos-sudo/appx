'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import {
  Users, MessageCircle, Ticket, BarChart3,
  AlertTriangle, Activity, Clock, Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']

interface GroupStats {
  eventId: string
  title: string
  groupName: string | null
  attendees: number
  scanned: number
  total: number
  messages: number
  incidents: number
}

interface LiveEntry {
  id: string
  type: 'scan' | 'message' | 'incident'
  text: string
  group: string
  time: string
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toISOString().split('T')[0]
}

export default function DashboardPage() {
  const { user, organization, isAdmin, isSuperAdmin, isGroupAdmin, initialized, events: userEvents } = useAuth()
  const { allVenues } = useAdminSelection()

  // Local state for inline selection
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [userSelectedDate, setUserSelectedDate] = useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [groupStats, setGroupStats] = useState<GroupStats[]>([])
  const [loading, setLoading] = useState(true)
  const [feed, setFeed] = useState<LiveEntry[]>([])
  const feedRef = useRef<HTMLDivElement>(null)

  // Fetch events — scoped by role
  useEffect(() => {
    if (!user) return
    const fetchEvents = async () => {
      if (isGroupAdmin && userEvents.length > 0) {
        // group_admin: use their assigned events from auth context
        const sorted = userEvents.map(m => m.event).sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        setAllEvents(sorted)
        return
      }
      if (!organization?.id) return
      let query = supabase.from('events').select('*').order('date', { ascending: true })
      if (isSuperAdmin) {
        query = query.eq('organization_id', organization.id)
      } else {
        query = query.eq('created_by', user.id)
      }
      const { data } = await query
      setAllEvents(data || [])
    }
    fetchEvents()
  }, [user?.id, organization?.id, isSuperAdmin, isGroupAdmin, userEvents])

  // Derived: unique dates
  const dates = useMemo(() => [...new Set(allEvents.map(e => formatDate(e.date)))].sort(), [allEvents])

  // Auto-select closest date (derived, no effect needed)
  const selectedDate = useMemo(() => {
    if (userSelectedDate && dates.includes(userSelectedDate)) return userSelectedDate
    if (dates.length === 0) return null
    const today = new Date().toISOString().split('T')[0]
    const futureDate = dates.find(d => d >= today)
    return futureDate || dates[dates.length - 1]
  }, [dates, userSelectedDate])

  // Events for selected date
  const eventsForDate = allEvents.filter(e => selectedDate && formatDate(e.date) === selectedDate)

  // Venues with events on this date
  const venueIdsForDate = new Set(eventsForDate.map(e => e.venue_id).filter(Boolean))
  const venuesForDate = allVenues.filter(v => venueIdsForDate.has(v.id))

  // Active events (filtered by venue if selected)
  const activeEvents = selectedVenueId
    ? eventsForDate.filter(e => e.venue_id === selectedVenueId)
    : eventsForDate

  // Load stats
  const loadStats = useCallback(async (evts: Event[]) => {
    if (evts.length === 0) { setGroupStats([]); return }
    const stats: GroupStats[] = await Promise.all(
      evts.map(async ev => {
        const [att, tix, msgs, incs] = await Promise.all([
          supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('is_active', true),
          supabase.from('tickets').select('status').eq('event_id', ev.id),
          supabase.from('messages').select('id', { count: 'exact', head: true }).eq('event_id', ev.id),
          supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).in('status', ['open', 'in_progress']),
        ])
        const ticketsData = tix.data || []
        return {
          eventId: ev.id,
          title: ev.title,
          groupName: ev.group_name,
          attendees: att.count || 0,
          scanned: ticketsData.filter(t => t.status === 'used').length,
          total: ticketsData.length,
          messages: msgs.count || 0,
          incidents: incs.count || 0,
        }
      })
    )
    setGroupStats(stats)
  }, [])

  useEffect(() => {
    if (activeEvents.length === 0) {
      setGroupStats([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    loadStats(activeEvents).then(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [activeEvents.length, selectedDate, selectedVenueId, loadStats])

  // Realtime feed
  useEffect(() => {
    if (!organization?.id || activeEvents.length === 0) return
    const eventIds = activeEvents.map(e => e.id)
    setFeed([])

    const addEntry = (entry: Omit<LiveEntry, 'id' | 'time'>) => {
      const newEntry: LiveEntry = {
        ...entry,
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }
      setFeed(prev => [newEntry, ...prev].slice(0, 50))
    }

    const ticketSub = supabase
      .channel(`dash-tickets-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, async payload => {
        const ticket = payload.new as { event_id: string; user_id: string; status: string }
        if (ticket.status !== 'used' || !eventIds.includes(ticket.event_id)) return
        const { data: userData } = await supabase.from('users').select('full_name').eq('id', ticket.user_id).single()
        const ev = activeEvents.find(e => e.id === ticket.event_id)
        addEntry({ type: 'scan', text: `${userData?.full_name || 'Asistente'} ha entrado`, group: ev?.group_name || ev?.title || '' })
        loadStats(activeEvents)
      })
      .subscribe()

    const msgSub = supabase
      .channel(`dash-messages-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
        const msg = payload.new as { event_id: string; user_id: string; content: string; is_announcement: boolean }
        if (!msg.event_id || !eventIds.includes(msg.event_id)) return
        const { data: userData } = await supabase.from('users').select('full_name').eq('id', msg.user_id).single()
        const ev = activeEvents.find(e => e.id === msg.event_id)
        addEntry({ type: 'message', text: msg.is_announcement ? `Anuncio: ${msg.content.slice(0, 60)}` : `${userData?.full_name || 'Usuario'}: ${msg.content.slice(0, 60)}`, group: ev?.group_name || ev?.title || '' })
      })
      .subscribe()

    const incSub = supabase
      .channel(`dash-incidents-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, async payload => {
        const inc = payload.new as { event_id: string; type: string; description: string }
        if (!eventIds.includes(inc.event_id)) return
        const ev = activeEvents.find(e => e.id === inc.event_id)
        addEntry({ type: 'incident', text: `[${inc.type.toUpperCase()}] ${inc.description.slice(0, 80)}`, group: ev?.group_name || ev?.title || '' })
        loadStats(activeEvents)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ticketSub)
      supabase.removeChannel(msgSub)
      supabase.removeChannel(incSub)
    }
  }, [activeEvents.length, organization?.id, selectedVenueId])

  const totalAttendees = groupStats.reduce((s, g) => s + g.attendees, 0)
  const totalScanned = groupStats.reduce((s, g) => s + g.scanned, 0)
  const totalTickets = groupStats.reduce((s, g) => s + g.total, 0)
  const openIncidents = groupStats.reduce((s, g) => s + g.incidents, 0)

  const feedIconMap = {
    scan: { icon: Ticket, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    message: { icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    incident: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin && !isGroupAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with inline selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {feed.length > 0 && <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
          <h1 className="text-xl font-bold text-gradient-primary">Resumen</h1>
        </div>
        <div className="flex items-center gap-2">
          {dates.length > 0 && (
            <select
              value={selectedDate || ''}
              onChange={e => { setUserSelectedDate(e.target.value || null); setSelectedVenueId(null) }}
              className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
            >
              {dates.map(d => (
                <option key={d} value={d} className="bg-[#1a1a1a]">
                  {new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                </option>
              ))}
            </select>
          )}
          {venuesForDate.length > 0 && (
            <select
              value={selectedVenueId || ''}
              onChange={e => setSelectedVenueId(e.target.value || null)}
              className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
            >
              <option value="" className="bg-[#1a1a1a]">Todos los venues</option>
              {venuesForDate.map(v => (
                <option key={v.id} value={v.id} className="bg-[#1a1a1a]">{v.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {activeEvents.length === 0 && !loading && (
        <div className="card p-8 text-center">
          <BarChart3 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">No hay eventos para esta fecha.</p>
        </div>
      )}

      {activeEvents.length > 0 && (
        <>
          {/* Global Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="Asistentes" value={totalAttendees} color="text-blue-400" bg="bg-blue-500/10" />
            <StatCard icon={Ticket} label="Entrada" value={`${totalScanned}/${totalTickets}`} color="text-emerald-400" bg="bg-emerald-500/10" />
            <StatCard icon={Radio} label="Grupos" value={groupStats.length} color="text-violet-400" bg="bg-violet-500/10" />
            <StatCard icon={AlertTriangle} label="Incidencias" value={openIncidents} color={openIncidents > 0 ? 'text-red-400' : 'text-white-muted'} bg={openIncidents > 0 ? 'bg-red-500/10' : 'bg-white/5'} />
          </div>

          {/* Groups Grid */}
          <div>
            <h2 className="text-base font-bold text-white mb-3">Estado por grupo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupStats.map(g => {
                const pct = g.total > 0 ? Math.round((g.scanned / g.total) * 100) : 0
                return (
                  <div key={g.eventId} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white">{g.groupName || g.title}</h3>
                        {g.groupName && <p className="text-[11px] text-white-muted">{g.title}</p>}
                      </div>
                      {g.incidents > 0 && (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">{g.incidents} inc.</span>
                      )}
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-white-muted mb-1">
                        <span>Entrada</span>
                        <span>{g.scanned}/{g.total} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="flex gap-4 text-[11px] text-white-muted">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {g.attendees}</span>
                      <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {g.messages}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live Feed — visible to all admin roles */}
          {(isAdmin || isGroupAdmin) && (
            <div>
              <h2 className="text-base font-bold text-white mb-3">Feed en tiempo real</h2>
              <div ref={feedRef} className="card max-h-[300px] overflow-y-auto scrollbar-none divide-y divide-black-border">
                {feed.length === 0 ? (
                  <div className="p-6 text-center">
                    <Activity className="w-8 h-8 text-white-muted mx-auto mb-2 animate-pulse" />
                    <p className="text-white-muted text-sm">Esperando actividad...</p>
                  </div>
                ) : (
                  feed.map(entry => {
                    const { icon: Icon, color, bg } = feedIconMap[entry.type]
                    return (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', bg)}>
                          <Icon className={cn('w-3.5 h-3.5', color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{entry.text}</p>
                          <p className="text-[10px] text-white-muted">{entry.group}</p>
                        </div>
                        <span className="text-[10px] text-white-muted shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {entry.time}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: string | number; color: string; bg: string
}) {
  return (
    <div className="card p-4">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-2', bg)}>
        <Icon className={cn('w-4.5 h-4.5', color)} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-white-muted">{label}</p>
    </div>
  )
}
