'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import {
  Users, MessageCircle, Ticket, BarChart3,
  AlertTriangle, Activity, Clock, Radio,
  Calendar, ScanLine, Megaphone, Building2, UsersRound,
  GlassWater, UserPlus, ArrowRight, Zap,
} from 'lucide-react'
import { cn, toLocalDateKey } from '@/lib/utils'
import { DrinksBreakdown } from '@/components/admin/dashboard/drinks-breakdown'
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
  const [recentUsers, setRecentUsers] = useState<{ id: string; full_name: string; email: string; created_at: string; event_title?: string }[]>([])
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalDrinks, setTotalDrinks] = useState(0)
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
  const dates = useMemo(() => [...new Set(allEvents.map(e => toLocalDateKey(e.date)))].sort(), [allEvents])

  // Auto-select closest date (derived, no effect needed)
  const selectedDate = useMemo(() => {
    if (userSelectedDate && dates.includes(userSelectedDate)) return userSelectedDate
    if (dates.length === 0) return null
    const today = toLocalDateKey(new Date())
    const futureDate = dates.find(d => d >= today)
    return futureDate || dates[dates.length - 1]
  }, [dates, userSelectedDate])

  // Events for selected date
  const eventsForDate = allEvents.filter(e => selectedDate && toLocalDateKey(e.date) === selectedDate)

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
      setRecentUsers([])
      setTotalMessages(0)
      setTotalDrinks(0)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const eventIds = activeEvents.map(e => e.id)
    const eventMap = new Map(activeEvents.map(e => [e.id, e.title]))

    // Load stats + extra data in parallel
    Promise.all([
      loadStats(activeEvents),
      // Recent registrations
      supabase.from('user_events').select('user_id, joined_at, event_id, users!inner(full_name, email)')
        .in('event_id', eventIds).order('joined_at', { ascending: false }).limit(8),
      // Total messages
      supabase.from('messages').select('id', { count: 'exact', head: true }).in('event_id', eventIds),
      // Total drink orders
      supabase.from('drink_orders').select('id', { count: 'exact', head: true }).in('event_id', eventIds),
    ]).then(([, regRes, msgRes, drinkRes]) => {
      if (cancelled) return
      // Recent users
      const regs = (regRes.data || []).map((r: any) => ({
        id: r.user_id,
        full_name: r.users?.full_name || '',
        email: r.users?.email || '',
        created_at: r.joined_at || '',
        event_title: eventMap.get(r.event_id) || '',
      }))
      setRecentUsers(regs)
      setTotalMessages(msgRes.count || 0)
      setTotalDrinks(drinkRes.count || 0)
      setLoading(false)
    })
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

  // Quick actions config
  const quickActions = [
    { href: '/admin/events', label: 'Eventos', icon: Calendar, color: 'text-primary', bg: 'bg-primary/10' },
    { href: '/scanner', label: 'Scanner', icon: ScanLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { href: '/admin/comms', label: 'Mensajes', icon: Megaphone, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { href: '/admin/incidents', label: 'Incidencias', icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    ...(isSuperAdmin ? [
      { href: '/admin/users', label: 'Usuarios', icon: UsersRound, color: 'text-violet-400', bg: 'bg-violet-500/10' },
      { href: '/admin/org', label: 'Organizacion', icon: Building2, color: 'text-white-muted', bg: 'bg-white/5' },
    ] : []),
  ]

  // Relative time helper
  const timeAgo = (dateStr: string) => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `hace ${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `hace ${hours}h`
    return `hace ${Math.floor(hours / 24)}d`
  }

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-start md:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-xl font-bold text-gradient-primary">Centro de control</h1>
              {feed.length > 0 && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Actividad en tiempo real" />}
            </div>
            <p className="text-sm text-white-muted mt-0.5">
              {selectedDate
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                : 'Sin eventos'}
            </p>
          </div>
          {/* Desktop: filters inline right */}
          <div className="hidden md:flex items-center gap-2">
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
        {/* Mobile: filters — large touch targets */}
        <div className="flex md:hidden items-center gap-2.5 mt-3">
          {dates.length > 0 && (
            <select
              value={selectedDate || ''}
              onChange={e => { setUserSelectedDate(e.target.value || null); setSelectedVenueId(null) }}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-black-border bg-white/[0.03] text-white text-sm focus:outline-none focus:border-primary/40"
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
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-black-border bg-white/[0.03] text-white text-sm focus:outline-none focus:border-primary/40"
            >
              <option value="" className="bg-[#1a1a1a]">Todos los venues</option>
              {venuesForDate.map(v => (
                <option key={v.id} value={v.id} className="bg-[#1a1a1a]">{v.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Quick Actions — desktop only (bottom nav replaces this on mobile) */}
      <div className="hidden md:flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {quickActions.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-1.5 min-w-[80px] py-3 px-2 rounded-xl border border-black-border hover:border-white/10 hover:bg-white/[0.02] transition-all shrink-0 group"
          >
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110', a.bg)}>
              <a.icon className={cn('w-5 h-5', a.color)} />
            </div>
            <span className="text-[11px] font-medium text-white-muted group-hover:text-white transition-colors">{a.label}</span>
          </Link>
        ))}
      </div>

      {activeEvents.length === 0 && !loading && (
        <div className="card p-8 text-center">
          <BarChart3 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted text-sm">No hay eventos para esta fecha.</p>
          <Link href="/admin/events" className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-primary/10 text-sm text-primary font-medium active:bg-primary/20 transition-colors">
            Crear evento <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {activeEvents.length > 0 && (
        <>
          {/* Global Stats — 2 cols mobile, 6 cols desktop */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 md:gap-3">
            <StatCard icon={Users} label="Asistentes" value={totalAttendees} color="text-blue-400" bg="bg-blue-500/10" />
            <StatCard icon={Ticket} label="Entrada" value={`${totalScanned}/${totalTickets}`} color="text-emerald-400" bg="bg-emerald-500/10" />
            <StatCard icon={Radio} label="Grupos" value={groupStats.length} color="text-violet-400" bg="bg-violet-500/10" />
            <StatCard icon={MessageCircle} label="Mensajes" value={totalMessages} color="text-blue-400" bg="bg-blue-500/10" />
            <StatCard icon={GlassWater} label="Bebidas" value={totalDrinks} color="text-amber-400" bg="bg-amber-500/10" />
            <StatCard icon={AlertTriangle} label="Incidencias" value={openIncidents} color={openIncidents > 0 ? 'text-red-400' : 'text-white-muted'} bg={openIncidents > 0 ? 'bg-red-500/10' : 'bg-white/5'} />
          </div>

          {/* Drinks breakdown — per venue, for the selected date.
              Gives the user immediate "how much to buy" visibility without
              having to click into each group's polls tab. */}
          {totalDrinks > 0 && (
            <DrinksBreakdown
              eventsForDate={activeEvents}
              venuesForDate={venuesForDate}
              selectedVenueId={selectedVenueId}
            />
          )}

          {/* Two-column layout: Groups + Recent Registrations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-4">
            {/* Groups — takes 2 cols on desktop */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-white">Estado por grupo</h2>
                <Link href="/admin/events" className="text-xs text-white-muted hover:text-primary active:text-primary transition-colors flex items-center gap-1 py-1">
                  Ver todos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupStats.map(g => {
                  const pct = g.total > 0 ? Math.round((g.scanned / g.total) * 100) : 0
                  return (
                    <div key={g.eventId} className="card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white">{g.groupName || g.title}</h3>
                          {g.groupName && g.groupName !== g.title && <p className="text-xs text-white-muted mt-0.5">{g.title}</p>}
                        </div>
                        {g.incidents > 0 && (
                          <span className="text-[11px] font-bold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">{g.incidents} inc.</span>
                        )}
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-white-muted mb-1.5">
                          <span>Entrada</span>
                          <span className="font-medium">{g.scanned}/{g.total} ({pct}%)</span>
                        </div>
                        <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-5 text-xs text-white-muted">
                        <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {g.attendees}</span>
                        <span className="flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5" /> {g.messages}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent Registrations */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4.5 h-4.5 text-emerald-400" />
                  Registros recientes
                </h2>
                {isSuperAdmin && (
                  <Link href="/admin/users" className="text-xs text-white-muted hover:text-primary active:text-primary transition-colors flex items-center gap-1 py-1">
                    Todos <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
              <div className="card divide-y divide-black-border">
                {recentUsers.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users className="w-8 h-8 text-white-muted mx-auto mb-2" />
                    <p className="text-white-muted text-sm">Sin registros aun</p>
                  </div>
                ) : (
                  recentUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <UserPlus className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{u.full_name || u.email}</p>
                        <p className="text-xs text-white-muted truncate">{u.event_title}</p>
                      </div>
                      <span className="text-xs text-white-muted shrink-0">{timeAgo(u.created_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Live Feed */}
          {(isAdmin || isGroupAdmin) && (
            <div>
              <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4.5 h-4.5 text-primary" />
                Feed en tiempo real
              </h2>
              <div ref={feedRef} className="card max-h-[250px] md:max-h-[300px] overflow-y-auto scrollbar-none divide-y divide-black-border">
                {feed.length === 0 ? (
                  <div className="p-8 text-center">
                    <Activity className="w-10 h-10 text-white-muted mx-auto mb-2 animate-pulse" />
                    <p className="text-white-muted text-sm">Esperando actividad...</p>
                  </div>
                ) : (
                  feed.map(entry => {
                    const { icon: Icon, color, bg } = feedIconMap[entry.type]
                    return (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                          <Icon className={cn('w-4 h-4', color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{entry.text}</p>
                          <p className="text-xs text-white-muted mt-0.5">{entry.group}</p>
                        </div>
                        <span className="text-xs text-white-muted shrink-0 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {entry.time}
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
    <div className="card p-3.5 md:p-4">
      <div className="flex items-center gap-2.5 md:block">
        <div className={cn('w-9 h-9 md:w-9 md:h-9 rounded-xl flex items-center justify-center md:mb-2 shrink-0', bg)}>
          <Icon className={cn('w-4.5 h-4.5', color)} />
        </div>
        <div className="md:block">
          <p className="text-xl md:text-2xl font-bold text-white leading-tight">{value}</p>
          <p className="text-xs md:text-[11px] text-white-muted leading-tight mt-0.5">{label}</p>
        </div>
      </div>
    </div>
  )
}
