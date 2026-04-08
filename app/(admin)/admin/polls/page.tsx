'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Wine, GlassWater, AlertTriangle, Download, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type DrinkOrder = Database['public']['Tables']['drink_orders']['Row']

interface OrderWithUser extends DrinkOrder {
  user_name: string
  user_email: string
  user_gender: string | null
}

export default function DrinkOrdersAdminPage() {
  const { user, isAdmin, initialized } = useAuth()
  const { selectedEventId, events } = useAdminSelection()
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [orders, setOrders] = useState<OrderWithUser[]>([])
  const [view, setView] = useState<'summary' | 'list'>('summary')

  useEffect(() => {
    if (selectedEventId) fetchOrders()
  }, [selectedEventId])

  const fetchOrders = async () => {
    if (!selectedEventId) return
    try {
      const ev = events.find((e) => e.id === selectedEventId)
      setSelectedEvent(ev || null)

      const { data: ordersData, error: ordersError } = await supabase
        .from('drink_orders')
        .select('*')
        .eq('event_id', selectedEventId!)
        .order('created_at', { ascending: false })

      if (ordersError) throw ordersError

      const userIds = (ordersData || []).map((o) => o.user_id)
      let usersMap: Record<string, { full_name: string | null; email: string; gender: string | null }> = {}

      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email, gender')
          .in('id', userIds)

        usersData?.forEach((u) => {
          usersMap[u.id] = { full_name: u.full_name, email: u.email, gender: u.gender }
        })
      }

      setOrders(
        (ordersData || []).map((o) => ({
          ...o,
          user_name: usersMap[o.user_id]?.full_name || 'Usuario',
          user_email: usersMap[o.user_id]?.email || '',
          user_gender: usersMap[o.user_id]?.gender || null,
        }))
      )
    } catch (err) {
      console.error('Error:', err)
    }
  }

  // Count helpers
  const countBy = (field: 'alcohol_choice' | 'soft_drink_choice') => {
    const counts: Record<string, number> = {}
    orders.forEach((o) => {
      const val = o[field]
      if (val) counts[val] = (counts[val] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  const allergyCount = () => {
    const counts: Record<string, number> = {}
    orders.forEach((o) => {
      ;(o.allergies || []).forEach((a) => {
        counts[a] = (counts[a] || 0) + 1
      })
      if (o.allergy_notes) {
        counts['Otros: ' + o.allergy_notes] = (counts['Otros: ' + o.allergy_notes] || 0) + 1
      }
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  const handleExportCSV = () => {
    const headers = 'Nombre,Email,Género,Alcohol,Refresco,Alergias,Notas\n'
    const rows = orders.map((o) =>
      [
        o.user_name,
        o.user_email,
        o.user_gender || '',
        o.alcohol_choice || '',
        o.soft_drink_choice,
        (o.allergies || []).join('; '),
        o.allergy_notes || '',
      ]
        .map((v) => `"${v}"`)
        .join(',')
    )
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bebidas-${selectedEvent?.title || 'evento'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  const alcoholCounts = countBy('alcohol_choice')
  const softDrinkCounts = countBy('soft_drink_choice')
  const allergyCounts = allergyCount()
  const isESO = selectedEvent?.event_type === 'eso'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gradient-primary">
            Pedidos de Bebidas
          </h1>
          <p className="text-sm mt-1 text-white-muted">
            Resumen de lo que van a beber los asistentes
          </p>
        </div>
        {orders.length > 0 && (
          <button onClick={handleExportCSV} className="btn-primary">
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        )}
      </div>

      {!selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior.</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-3">
        <Users className="w-5 h-5 text-primary" />
        <span className="text-white font-semibold text-lg">{orders.length} pedidos</span>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setView('summary')}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition',
              view === 'summary' ? 'btn-primary' : 'btn-ghost'
            )}
          >
            Resumen
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition',
              view === 'list' ? 'btn-primary' : 'btn-ghost'
            )}
          >
            Lista
          </button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card p-8 text-center">
          <GlassWater className="w-12 h-12 mx-auto mb-4 text-black-border" />
          <p className="text-white-muted">Aún no hay pedidos para este evento.</p>
        </div>
      ) : view === 'summary' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Alcohol Summary */}
          {!isESO && alcoholCounts.length > 0 && (
            <div className="card p-6 animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <Wine className="w-5 h-5 text-primary" />
                <h3 className="text-white font-semibold">¿Qué suelen beber?</h3>
              </div>
              <div className="space-y-3">
                {alcoholCounts.map(([drink, count]) => {
                  const pct = Math.round((count / orders.length) * 100)
                  return (
                    <div key={drink}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white">{drink}</span>
                        <span className="text-primary font-semibold">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-black-border">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Soft Drinks Summary */}
          <div className="card p-6 animate-slide-up">
            <div className="flex items-center gap-2 mb-4">
              <GlassWater className="w-5 h-5 text-primary" />
              <h3 className="text-white font-semibold">¿Qué van a beber?</h3>
            </div>
            <div className="space-y-3">
              {softDrinkCounts.map(([drink, count]) => {
                const pct = Math.round((count / orders.length) * 100)
                return (
                  <div key={drink}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white">{drink}</span>
                      <span className="text-primary font-semibold">
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-black-border">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Allergies Summary */}
          {allergyCounts.length > 0 && (
            <div className="card-accent p-6 md:col-span-2 animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-white font-semibold">Alergias / Intolerancias</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {allergyCounts.map(([allergy, count]) => (
                  <span
                    key={allergy}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-amber-500/15 text-amber-400"
                  >
                    {allergy} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="card p-4 flex items-center gap-4 animate-slide-up"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-black text-sm bg-primary">
                {(order.user_name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{order.user_name}</p>
                <p className="text-xs text-white-muted">
                  {[order.alcohol_choice, order.soft_drink_choice].filter(Boolean).join(' + ')}
                </p>
              </div>
              {(order.allergies?.length > 0 || order.allergy_notes) && (
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
              )}
              <span className="text-xs flex-shrink-0 text-white-muted/60">
                {order.user_gender === 'masculino' ? 'M' : order.user_gender === 'femenino' ? 'F' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
