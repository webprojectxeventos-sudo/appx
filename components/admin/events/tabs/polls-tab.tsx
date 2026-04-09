'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Wine, GlassWater, AlertTriangle, Download, Users, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type DrinkOrder = Database['public']['Tables']['drink_orders']['Row']

interface OrderWithUser extends DrinkOrder {
  user_name: string
  user_email: string
  user_gender: string | null
  group_name?: string
}

interface PollsTabProps {
  eventId: string
  eventType: string
  eventTitle: string
  venueId?: string
  date?: string
}

export function PollsTab({ eventId, eventType, eventTitle, venueId, date }: PollsTabProps) {
  const [orders, setOrders] = useState<OrderWithUser[]>([])
  const [venueOrders, setVenueOrders] = useState<OrderWithUser[]>([])
  const [view, setView] = useState<'summary' | 'list'>('summary')
  const [scope, setScope] = useState<'group' | 'venue'>('group')
  const [loadingVenue, setLoadingVenue] = useState(false)

  useEffect(() => { fetchOrders() }, [eventId])

  // Fetch venue-wide orders when switching to venue scope
  useEffect(() => {
    if (scope === 'venue' && venueId && date && venueOrders.length === 0) {
      fetchVenueOrders()
    }
  }, [scope, venueId, date])

  const fetchOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from('drink_orders')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const userIds = (ordersData || []).map(o => o.user_id)
      const usersMap: Record<string, { full_name: string | null; email: string; gender: string | null }> = {}

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email, gender')
          .in('id', userIds)
        usersData?.forEach(u => { usersMap[u.id] = { full_name: u.full_name, email: u.email, gender: u.gender } })
      }

      setOrders((ordersData || []).map(o => ({
        ...o,
        user_name: usersMap[o.user_id]?.full_name || 'Usuario',
        user_email: usersMap[o.user_id]?.email || '',
        user_gender: usersMap[o.user_id]?.gender || null,
      })))
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const fetchVenueOrders = async () => {
    if (!venueId || !date) return
    setLoadingVenue(true)
    try {
      // Get all events for this venue on this date
      const dateStart = date + 'T00:00:00'
      const dateEnd = date + 'T23:59:59'
      const { data: venueEvents, error: evError } = await supabase
        .from('events')
        .select('id, title, group_name')
        .eq('venue_id', venueId)
        .gte('date', dateStart)
        .lte('date', dateEnd)

      if (evError) throw evError
      if (!venueEvents || venueEvents.length === 0) { setLoadingVenue(false); return }

      const eventIds = venueEvents.map(e => e.id)
      const eventNameMap: Record<string, string> = {}
      venueEvents.forEach(e => { eventNameMap[e.id] = e.group_name || e.title })

      // Fetch all drink orders for these events
      const { data: ordersData, error } = await supabase
        .from('drink_orders')
        .select('*')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false })

      if (error) throw error

      const userIds = (ordersData || []).map(o => o.user_id)
      const usersMap: Record<string, { full_name: string | null; email: string; gender: string | null }> = {}

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email, gender')
          .in('id', userIds)
        usersData?.forEach(u => { usersMap[u.id] = { full_name: u.full_name, email: u.email, gender: u.gender } })
      }

      setVenueOrders((ordersData || []).map(o => ({
        ...o,
        user_name: usersMap[o.user_id]?.full_name || 'Usuario',
        user_email: usersMap[o.user_id]?.email || '',
        user_gender: usersMap[o.user_id]?.gender || null,
        group_name: eventNameMap[o.event_id] || '',
      })))
    } catch (err) {
      console.error('Error fetching venue orders:', err)
    } finally {
      setLoadingVenue(false)
    }
  }

  const activeOrders = scope === 'venue' ? venueOrders : orders

  const countBy = (field: 'alcohol_choice' | 'soft_drink_choice') => {
    const counts: Record<string, number> = {}
    activeOrders.forEach(o => { const val = o[field]; if (val) counts[val] = (counts[val] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  const allergyCount = () => {
    const counts: Record<string, number> = {}
    activeOrders.forEach(o => {
      ;(o.allergies || []).forEach(a => { counts[a] = (counts[a] || 0) + 1 })
      if (o.allergy_notes) counts['Otros: ' + o.allergy_notes] = (counts['Otros: ' + o.allergy_notes] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  // Group breakdown for venue view
  const groupBreakdown = useMemo(() => {
    if (scope !== 'venue') return []
    const map = new Map<string, { name: string; count: number }>()
    venueOrders.forEach(o => {
      const name = o.group_name || 'Sin grupo'
      const entry = map.get(o.event_id) || { name, count: 0 }
      entry.count++
      map.set(o.event_id, entry)
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [venueOrders, scope])

  const handleExportCSV = () => {
    const isVenue = scope === 'venue'
    const exportOrders = isVenue ? venueOrders : orders
    const headers = isVenue
      ? 'Grupo,Nombre,Email,Genero,Alcohol,Refresco,Alergias,Notas\n'
      : 'Nombre,Email,Genero,Alcohol,Refresco,Alergias,Notas\n'
    const rows = exportOrders.map(o => {
      const base = [o.user_name, o.user_email, o.user_gender || '', o.alcohol_choice || '', o.soft_drink_choice, (o.allergies || []).join('; '), o.allergy_notes || '']
      if (isVenue) base.unshift(o.group_name || '')
      return base.map(v => `"${v}"`).join(',')
    })
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = isVenue ? `bebidas-venue-${date}.csv` : `bebidas-${eventTitle}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const alcoholCounts = countBy('alcohol_choice')
  const softDrinkCounts = countBy('soft_drink_choice')
  const allergyCounts = allergyCount()
  const isESO = eventType === 'eso'
  const hasVenueScope = !!venueId && !!date

  return (
    <div className="space-y-4">
      {/* Scope toggle: Group vs Venue */}
      {hasVenueScope && (
        <div className="flex rounded-xl border border-black-border overflow-hidden">
          <button
            onClick={() => setScope('group')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all',
              scope === 'group' ? 'bg-primary text-white' : 'text-white-muted hover:text-white hover:bg-white/5'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            Este grupo
          </button>
          <button
            onClick={() => setScope('venue')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all',
              scope === 'venue' ? 'bg-primary text-white' : 'text-white-muted hover:text-white hover:bg-white/5'
            )}
          >
            <Building2 className="w-3.5 h-3.5" />
            Toda la disco
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {activeOrders.length} pedidos
          {scope === 'venue' && loadingVenue && <span className="text-[10px] text-white-muted animate-pulse">cargando...</span>}
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => setView('summary')} className={cn('px-3 py-1 rounded-lg text-xs font-medium', view === 'summary' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>Resumen</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-1 rounded-lg text-xs font-medium', view === 'list' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>Lista</button>
          {activeOrders.length > 0 && (
            <button onClick={handleExportCSV} className="btn-ghost text-xs"><Download className="w-3 h-3" /> CSV</button>
          )}
        </div>
      </div>

      {activeOrders.length === 0 && !loadingVenue ? (
        <div className="py-8 text-center">
          <GlassWater className="w-8 h-8 mx-auto mb-2 text-black-border" />
          <p className="text-white-muted text-sm">Sin pedidos aun.</p>
        </div>
      ) : view === 'summary' ? (
        <div className="space-y-4">
          {/* Group breakdown in venue view */}
          {scope === 'venue' && groupBreakdown.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Building2 className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-white">Por grupo</span></div>
              <div className="space-y-1.5">
                {groupBreakdown.map(g => {
                  const pct = Math.round((g.count / activeOrders.length) * 100)
                  return (
                    <div key={g.name} className="flex items-center gap-2">
                      <span className="text-xs text-white truncate flex-1 min-w-0">{g.name}</span>
                      <span className="text-xs text-primary font-medium shrink-0">{g.count}</span>
                      <div className="w-16 h-1.5 rounded-full bg-black-border shrink-0"><div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!isESO && alcoholCounts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Wine className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-white">Alcohol</span></div>
              <div className="space-y-2">
                {alcoholCounts.map(([drink, count]) => {
                  const pct = Math.round((count / activeOrders.length) * 100)
                  return (
                    <div key={drink}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-white">{drink}</span><span className="text-primary font-medium">{count} ({pct}%)</span></div>
                      <div className="w-full h-1.5 rounded-full bg-black-border"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 mb-2"><GlassWater className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-white">Refrescos</span></div>
            <div className="space-y-2">
              {softDrinkCounts.map(([drink, count]) => {
                const pct = Math.round((count / activeOrders.length) * 100)
                return (
                  <div key={drink}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-white">{drink}</span><span className="text-primary font-medium">{count} ({pct}%)</span></div>
                    <div className="w-full h-1.5 rounded-full bg-black-border"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
          {allergyCounts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-sm font-medium text-white">Alergias</span></div>
              <div className="flex flex-wrap gap-1.5">
                {allergyCounts.map(([allergy, count]) => (
                  <span key={allergy} className="px-2 py-1 rounded-full text-xs bg-amber-500/15 text-amber-400">{allergy} ({count})</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {activeOrders.map(order => (
            <div key={order.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.03]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-primary text-black">
                {(order.user_name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{order.user_name}</p>
                <p className="text-[11px] text-white-muted">
                  {[order.alcohol_choice, order.soft_drink_choice].filter(Boolean).join(' + ')}
                  {scope === 'venue' && order.group_name && <span className="ml-1 text-primary/60">· {order.group_name}</span>}
                </p>
              </div>
              {(order.allergies?.length > 0 || order.allergy_notes) && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
