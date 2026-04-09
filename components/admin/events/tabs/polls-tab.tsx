'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Wine, GlassWater, AlertTriangle, Download, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type DrinkOrder = Database['public']['Tables']['drink_orders']['Row']

interface OrderWithUser extends DrinkOrder {
  user_name: string
  user_email: string
  user_gender: string | null
}

interface PollsTabProps {
  eventId: string
  eventType: string
  eventTitle: string
}

export function PollsTab({ eventId, eventType, eventTitle }: PollsTabProps) {
  const [orders, setOrders] = useState<OrderWithUser[]>([])
  const [view, setView] = useState<'summary' | 'list'>('summary')

  useEffect(() => { fetchOrders() }, [eventId])

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

  const countBy = (field: 'alcohol_choice' | 'soft_drink_choice') => {
    const counts: Record<string, number> = {}
    orders.forEach(o => { const val = o[field]; if (val) counts[val] = (counts[val] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  const allergyCount = () => {
    const counts: Record<string, number> = {}
    orders.forEach(o => {
      ;(o.allergies || []).forEach(a => { counts[a] = (counts[a] || 0) + 1 })
      if (o.allergy_notes) counts['Otros: ' + o.allergy_notes] = (counts['Otros: ' + o.allergy_notes] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }

  const handleExportCSV = () => {
    const headers = 'Nombre,Email,Genero,Alcohol,Refresco,Alergias,Notas\n'
    const rows = orders.map(o =>
      [o.user_name, o.user_email, o.user_gender || '', o.alcohol_choice || '', o.soft_drink_choice, (o.allergies || []).join('; '), o.allergy_notes || '']
        .map(v => `"${v}"`).join(',')
    )
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bebidas-${eventTitle}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const alcoholCounts = countBy('alcohol_choice')
  const softDrinkCounts = countBy('soft_drink_choice')
  const allergyCounts = allergyCount()
  const isESO = eventType === 'eso'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> {orders.length} pedidos
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => setView('summary')} className={cn('px-3 py-1 rounded-lg text-xs font-medium', view === 'summary' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>Resumen</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-1 rounded-lg text-xs font-medium', view === 'list' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>Lista</button>
          {orders.length > 0 && (
            <button onClick={handleExportCSV} className="btn-ghost text-xs"><Download className="w-3 h-3" /> CSV</button>
          )}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="py-8 text-center">
          <GlassWater className="w-8 h-8 mx-auto mb-2 text-black-border" />
          <p className="text-white-muted text-sm">Sin pedidos aun.</p>
        </div>
      ) : view === 'summary' ? (
        <div className="space-y-4">
          {!isESO && alcoholCounts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><Wine className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-white">Alcohol</span></div>
              <div className="space-y-2">
                {alcoholCounts.map(([drink, count]) => {
                  const pct = Math.round((count / orders.length) * 100)
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
                const pct = Math.round((count / orders.length) * 100)
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
          {orders.map(order => (
            <div key={order.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.03]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-primary text-black">
                {(order.user_name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{order.user_name}</p>
                <p className="text-[11px] text-white-muted">{[order.alcohol_choice, order.soft_drink_choice].filter(Boolean).join(' + ')}</p>
              </div>
              {(order.allergies?.length > 0 || order.allergy_notes) && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
