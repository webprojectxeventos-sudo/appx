'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Activity, Ticket, MessageCircle, AlertTriangle, Users, Clock, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']

interface LiveEntry {
  id: string
  type: 'scan' | 'message' | 'incident' | 'join'
  text: string
  group: string
  time: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
}

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

export default function LivePage() {
  const { organization, isSuperAdmin, initialized } = useAuth()
  const { allEvents, selectedVenueId, events: venueEvents } = useAdminSelection()
  const [feed, setFeed] = useState<LiveEntry[]>([])
  const [groupStats, setGroupStats] = useState<GroupStats[]>([])
  const [loading, setLoading] = useState(true)
  const feedRef = useRef<HTMLDivElement>(null)

  // Use venue events if venue selected, otherwise all events for the day
  const activeEvents = selectedVenueId ? venueEvents : allEvents

  const loadStats = useCallback(async (evts: Event[]) => {
    if (evts.length === 0) {
      setGroupStats([])
      return
    }
    const stats: GroupStats[] = await Promise.all(
      evts.map(async (ev) => {
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

  // Load stats when active events change
  useEffect(() => {
    if (activeEvents.length === 0) {
      setGroupStats([])
      setLoading(false)
      return
    }
    setLoading(true)
    loadStats(activeEvents).then(() => setLoading(false))
  }, [activeEvents, loadStats])

  // Clear feed when selection changes
  useEffect(() => {
    setFeed([])
  }, [selectedVenueId])

  // Realtime subscriptions
  useEffect(() => {
    if (!organization?.id || activeEvents.length === 0) return
    const eventIds = activeEvents.map(e => e.id)

    const ticketSub = supabase
      .channel(`live-tickets-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, async (payload) => {
        const ticket = payload.new as { event_id: string; user_id: string; status: string }
        if (ticket.status !== 'used' || !eventIds.includes(ticket.event_id)) return
        const { data: userData } = await supabase.from('users').select('full_name').eq('id', ticket.user_id).single()
        const ev = activeEvents.find(e => e.id === ticket.event_id)
        addFeedEntry({
          type: 'scan',
          text: `${userData?.full_name || 'Asistente'} ha entrado`,
          group: ev?.group_name || ev?.title || '',
        })
        loadStats(activeEvents)
      })
      .subscribe()

    const msgSub = supabase
      .channel(`live-messages-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as { event_id: string; user_id: string; content: string; is_announcement: boolean }
        if (!msg.event_id || !eventIds.includes(msg.event_id)) return
        const { data: userData } = await supabase.from('users').select('full_name').eq('id', msg.user_id).single()
        const ev = activeEvents.find(e => e.id === msg.event_id)
        addFeedEntry({
          type: 'message',
          text: msg.is_announcement ? `Anuncio: ${msg.content.slice(0, 60)}` : `${userData?.full_name || 'Usuario'}: ${msg.content.slice(0, 60)}`,
          group: ev?.group_name || ev?.title || '',
        })
        loadStats(activeEvents)
      })
      .subscribe()

    const incSub = supabase
      .channel(`live-incidents-${organization.id}-${selectedVenueId || 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidents' }, async (payload) => {
        const inc = payload.new as { event_id: string; type: string; description: string; priority: string }
        if (!eventIds.includes(inc.event_id)) return
        const ev = activeEvents.find(e => e.id === inc.event_id)
        addFeedEntry({
          type: 'incident',
          text: `[${inc.type.toUpperCase()}] ${inc.description.slice(0, 80)}`,
          group: ev?.group_name || ev?.title || '',
          priority: inc.priority as LiveEntry['priority'],
        })
        loadStats(activeEvents)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ticketSub)
      supabase.removeChannel(msgSub)
      supabase.removeChannel(incSub)
    }
  }, [activeEvents, organization?.id, selectedVenueId])

  const addFeedEntry = (entry: Omit<LiveEntry, 'id' | 'time'>) => {
    const newEntry: LiveEntry = {
      ...entry,
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }
    setFeed(prev => [newEntry, ...prev].slice(0, 100))
  }

  const totalAttendees = groupStats.reduce((s, g) => s + g.attendees, 0)
  const totalScanned = groupStats.reduce((s, g) => s + g.scanned, 0)
  const totalTickets = groupStats.reduce((s, g) => s + g.total, 0)
  const openIncidents = groupStats.reduce((s, g) => s + g.incidents, 0)

  const feedIconMap = {
    scan: { icon: Ticket, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    message: { icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    incident: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    join: { icon: Users, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isSuperAdmin) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="card h-24 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <h1 className="text-xl font-bold text-white">Monitor en Vivo</h1>
        <span className="text-xs text-white-muted">
          {selectedVenueId ? `${activeEvents.length} instituto${activeEvents.length !== 1 ? 's' : ''}` : 'Todos los institutos del dia'}
        </span>
      </div>

      {activeEvents.length === 0 && (
        <div className="card p-8 text-center">
          <Activity className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">Selecciona una fecha en la barra superior para ver la actividad en vivo.</p>
        </div>
      )}

      {activeEvents.length > 0 && (
        <>
          {/* Global Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <Users className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-white">{totalAttendees}</p>
              <p className="text-[11px] text-white-muted">Asistentes totales</p>
            </div>
            <div className="card p-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
                <Ticket className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white">{totalScanned}/{totalTickets}</p>
              <p className="text-[11px] text-white-muted">Entradas escaneadas</p>
            </div>
            <div className="card p-4">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center mb-2">
                <Radio className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <p className="text-2xl font-bold text-white">{groupStats.length}</p>
              <p className="text-[11px] text-white-muted">Grupos activos</p>
            </div>
            <div className="card p-4">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-2', openIncidents > 0 ? 'bg-red-500/10' : 'bg-white/5')}>
                <AlertTriangle className={cn('w-4.5 h-4.5', openIncidents > 0 ? 'text-red-400' : 'text-white-muted')} />
              </div>
              <p className={cn('text-2xl font-bold', openIncidents > 0 ? 'text-red-400' : 'text-white')}>{openIncidents}</p>
              <p className="text-[11px] text-white-muted">Incidencias abiertas</p>
            </div>
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

          {/* Live Feed */}
          <div>
            <h2 className="text-base font-bold text-white mb-3">Feed en tiempo real</h2>
            <div ref={feedRef} className="card max-h-[400px] overflow-y-auto scrollbar-none divide-y divide-black-border">
              {feed.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-8 h-8 text-white-muted mx-auto mb-2 animate-pulse" />
                  <p className="text-white-muted text-sm">Esperando actividad en tiempo real...</p>
                  <p className="text-white-muted text-[11px] mt-1">Los eventos apareceran aqui automaticamente</p>
                </div>
              ) : (
                feed.map(entry => {
                  const { icon: Icon, color, bg } = feedIconMap[entry.type]
                  return (
                    <div key={entry.id} className={cn('flex items-center gap-3 px-4 py-3', entry.priority === 'critical' && 'bg-red-500/5')}>
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
                        <Icon className={cn('w-4 h-4', color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{entry.text}</p>
                        <p className="text-[10px] text-white-muted">{entry.group}</p>
                      </div>
                      <span className="text-[10px] text-white-muted flex-shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {entry.time}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
