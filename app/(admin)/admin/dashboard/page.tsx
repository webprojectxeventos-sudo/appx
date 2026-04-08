'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Users, GlassWater, MessageCircle, Image as ImageIcon, Ticket, BarChart3, TrendingUp } from 'lucide-react'

interface VenueStats {
  attendees: number
  drinkOrders: number
  messages: number
  photos: number
  ticketsScanned: number
  ticketsTotal: number
  topAlcohol: string
  topSoftDrink: string
}

export default function DashboardPage() {
  const { isAdmin, initialized } = useAuth()
  const { selectedVenueId, selectedEventId, events } = useAdminSelection()
  const [stats, setStats] = useState<VenueStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    // Need at least a venue with events
    if (!selectedVenueId || events.length === 0) {
      setStats(null)
      setLoading(false)
      return
    }

    setLoading(true)

    // If a specific event is selected, only fetch stats for that event
    // Otherwise, aggregate across all events in the venue
    const targetEventIds = selectedEventId
      ? [selectedEventId]
      : events.map(e => e.id)

    try {
      const [attendees, drinks, messages, photos, tickets] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).in('event_id', targetEventIds).eq('role', 'attendee'),
        supabase.from('drink_orders').select('alcohol_choice, soft_drink_choice').in('event_id', targetEventIds),
        supabase.from('messages').select('id', { count: 'exact', head: true }).in('event_id', targetEventIds),
        supabase.from('photos').select('id', { count: 'exact', head: true }).eq('venue_id', selectedVenueId),
        supabase.from('tickets').select('status').in('event_id', targetEventIds),
      ])

      // Top choices
      const alcoholCounts: Record<string, number> = {}
      const softCounts: Record<string, number> = {}
      drinks.data?.forEach((d) => {
        if (d.alcohol_choice) alcoholCounts[d.alcohol_choice] = (alcoholCounts[d.alcohol_choice] || 0) + 1
        if (d.soft_drink_choice) softCounts[d.soft_drink_choice] = (softCounts[d.soft_drink_choice] || 0) + 1
      })

      const topAlcohol = Object.entries(alcoholCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'
      const topSoftDrink = Object.entries(softCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'

      const ticketsTotal = tickets.data?.length || 0
      const ticketsScanned = tickets.data?.filter((t) => t.status === 'used').length || 0

      setStats({
        attendees: attendees.count || 0,
        drinkOrders: drinks.data?.length || 0,
        messages: messages.count || 0,
        photos: photos.count || 0,
        ticketsScanned,
        ticketsTotal,
        topAlcohol,
        topSoftDrink,
      })
    } catch (err) {
      console.error('Error fetching dashboard stats:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVenueId, selectedEventId, events])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="card p-4 h-24 animate-pulse" />)}
        </div>
      </div>
    )
  }

  const subtitle = selectedEventId
    ? events.find(e => e.id === selectedEventId)?.title || 'Instituto'
    : `${events.length} instituto${events.length !== 1 ? 's' : ''} en este venue`

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-gradient-primary">Dashboard</h1>
        <p className="text-sm text-white-muted mt-0.5">{subtitle}</p>
      </div>

      {!selectedVenueId && (
        <div className="card p-8 text-center">
          <BarChart3 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">Selecciona una fecha y venue en la barra superior.</p>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={Users} label="Asistentes" value={stats.attendees} color="text-blue-400" bg="bg-blue-500/10" border="border-l-blue-400" delay="delay-100" />
            <StatCard icon={GlassWater} label="Pedidos bebidas" value={stats.drinkOrders} color="text-emerald-400" bg="bg-emerald-500/10" border="border-l-emerald-400" delay="delay-200" />
            <StatCard icon={MessageCircle} label="Mensajes" value={stats.messages} color="text-violet-400" bg="bg-violet-500/10" border="border-l-violet-400" delay="delay-100" />
            <StatCard icon={ImageIcon} label="Fotos" value={stats.photos} color="text-amber-400" bg="bg-amber-500/10" border="border-l-amber-400" delay="delay-200" />
            <StatCard
              icon={Ticket}
              label="Tickets escaneados"
              value={`${stats.ticketsScanned}/${stats.ticketsTotal}`}
              color="text-primary"
              bg="bg-primary/10"
              border="border-l-primary"
              delay="delay-300"
            />
            <StatCard icon={BarChart3} label="% Asistencia" value={stats.ticketsTotal > 0 ? `${Math.round((stats.ticketsScanned / stats.ticketsTotal) * 100)}%` : '0%'} color="text-cyan-400" bg="bg-cyan-500/10" border="border-l-cyan-400" delay="delay-400" />
          </div>

          {/* Top choices */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-xs text-white-muted">Alcohol favorito</p>
              </div>
              <p className="text-white font-bold">{stats.topAlcohol}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <p className="text-xs text-white-muted">Refresco favorito</p>
              </div>
              <p className="text-white font-bold text-sm">{stats.topSoftDrink}</p>
            </div>
          </div>
        </>
      )}

      {selectedVenueId && !stats && !loading && (
        <div className="text-center py-12">
          <BarChart3 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">No hay datos para este venue</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg, border = '', delay = '' }: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
  bg: string
  border?: string
  delay?: string
}) {
  return (
    <div className={`card p-4 border-l-2 ${border} hover:translate-y-[-2px] transition-transform duration-300 animate-scale-in ${delay}`}>
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-2.5`}>
        <Icon className={`w-4.5 h-4.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-[11px] text-white-muted mt-0.5">{label}</p>
    </div>
  )
}
