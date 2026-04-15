'use client'

// Dashboard drinks breakdown — answers "how many of each drink to buy today?"
//
// Given the date's events and their venues, fetches `drink_orders` in one
// shot, groups by venue, then aggregates alcohol + soft + allergies. The
// point is the user lands on the dashboard, picks a date, and sees per-venue
// drink totals immediately — no clicking into group detail → polls tab for
// each venue.
//
// Re-uses the field names exactly as stored in drink_orders so the numbers
// match what they'd see in the polls tab (single source of truth).

import { useEffect, useMemo, useState } from 'react'
import { GlassWater, Wine, Martini, AlertTriangle, Building2, Users, ChevronDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

interface DrinksBreakdownProps {
  /** Events filtered to the date the user is looking at. */
  eventsForDate: Event[]
  /** Venues that have events on this date. Optional — we gracefully group by venue_id. */
  venuesForDate: Venue[]
  /** If set, only show this venue's breakdown. */
  selectedVenueId: string | null
}

interface DrinkOrderRow {
  id: string
  event_id: string
  alcohol_choice: string | null
  soft_drink_choice: string | null
  allergies: string[] | null
  allergy_notes: string | null
}

interface VenueBreakdown {
  venueId: string
  venueName: string
  total: number
  alcohol: Array<[string, number]>
  soft: Array<[string, number]>
  allergyTags: Array<[string, number]>
  allergyNotes: number
}

/** Empty counts → sorted [name, count][] desc. */
function aggregate(rows: DrinkOrderRow[], field: 'alcohol_choice' | 'soft_drink_choice'): Array<[string, number]> {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const val = r[field]
    if (!val) continue
    counts[val] = (counts[val] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

function aggregateAllergies(rows: DrinkOrderRow[]): Array<[string, number]> {
  const counts: Record<string, number> = {}
  for (const r of rows) {
    if (!r.allergies) continue
    for (const a of r.allergies) counts[a] = (counts[a] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}

export function DrinksBreakdown({ eventsForDate, venuesForDate, selectedVenueId }: DrinksBreakdownProps) {
  const [orders, setOrders] = useState<DrinkOrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Map event_id → venue_id so we can group drink orders by venue
  const eventToVenue = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const e of eventsForDate) m.set(e.id, e.venue_id)
    return m
  }, [eventsForDate])

  const venueNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of venuesForDate) m.set(v.id, v.name)
    return m
  }, [venuesForDate])

  // Fetch drink orders for all events on this date in one shot
  useEffect(() => {
    if (eventsForDate.length === 0) {
      setOrders([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const eventIds = eventsForDate.map(e => e.id)
    supabase
      .from('drink_orders')
      .select('id, event_id, alcohol_choice, soft_drink_choice, allergies, allergy_notes')
      .in('event_id', eventIds)
      .then(({ data }) => {
        if (cancelled) return
        setOrders((data || []) as DrinkOrderRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [eventsForDate])

  // Group orders by venue, then aggregate
  const breakdowns: VenueBreakdown[] = useMemo(() => {
    const byVenue = new Map<string, DrinkOrderRow[]>()
    for (const o of orders) {
      const vid = eventToVenue.get(o.event_id) || 'none'
      const arr = byVenue.get(vid) || []
      arr.push(o)
      byVenue.set(vid, arr)
    }
    const result: VenueBreakdown[] = []
    for (const [vid, rows] of byVenue.entries()) {
      // Respect venue filter
      if (selectedVenueId && vid !== selectedVenueId) continue
      const allergyNoteCount = rows.filter(r => r.allergy_notes && r.allergy_notes.trim()).length
      result.push({
        venueId: vid,
        venueName: vid === 'none' ? 'Sin venue' : (venueNameById.get(vid) || 'Venue sin nombre'),
        total: rows.length,
        alcohol: aggregate(rows, 'alcohol_choice'),
        soft: aggregate(rows, 'soft_drink_choice'),
        allergyTags: aggregateAllergies(rows),
        allergyNotes: allergyNoteCount,
      })
    }
    return result.sort((a, b) => b.total - a.total)
  }, [orders, eventToVenue, venueNameById, selectedVenueId])

  // Auto-expand the first venue card if there's only a small number, so the
  // user immediately sees the numbers without an extra click
  useEffect(() => {
    if (breakdowns.length > 0 && breakdowns.length <= 2) {
      setExpanded(new Set(breakdowns.map(b => b.venueId)))
    }
  }, [breakdowns])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (eventsForDate.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <GlassWater className="w-4.5 h-4.5 text-amber-400" />
          Bebidas por venue
        </h2>
        {orders.length > 0 && (
          <span className="text-[11px] text-white-muted">
            {orders.length} {orders.length === 1 ? 'encuesta' : 'encuestas'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="card p-6 flex items-center justify-center gap-2 text-white-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando encuestas...
        </div>
      ) : breakdowns.length === 0 || orders.length === 0 ? (
        <div className="card p-6 text-center">
          <GlassWater className="w-8 h-8 text-white-muted mx-auto mb-2 opacity-60" />
          <p className="text-sm text-white-muted">
            Sin encuestas de bebida todavia
          </p>
          <p className="text-[11px] text-white-muted/60 mt-1">
            Los asistentes completan la encuesta desde su evento
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {breakdowns.map(b => {
            const isOpen = expanded.has(b.venueId)
            const hasAlcohol = b.alcohol.length > 0
            return (
              <div key={b.venueId} className="card overflow-hidden">
                {/* Header — always visible, click to expand/collapse */}
                <button
                  onClick={() => toggle(b.venueId)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-bold text-white truncate">{b.venueName}</p>
                    <p className="text-[11px] text-white-muted flex items-center gap-1 mt-0.5">
                      <Users className="w-3 h-3" />
                      {b.total} {b.total === 1 ? 'pedido' : 'pedidos'}
                      {b.allergyTags.length + b.allergyNotes > 0 && (
                        <>
                          <span className="mx-0.5">&middot;</span>
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span className="text-amber-400">
                            {b.allergyTags.reduce((s, [, n]) => s + n, 0) + b.allergyNotes} alergias
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <ChevronDown className={cn(
                    'w-4 h-4 text-white-muted shrink-0 transition-transform',
                    isOpen && 'rotate-180'
                  )} />
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 space-y-4 border-t border-black-border animate-fade-in">
                    {/* Alcohol */}
                    {hasAlcohol && (
                      <div className="pt-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Wine className="w-3.5 h-3.5 text-primary" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Alcohol</span>
                          <span className="text-[10px] text-white-muted ml-auto">
                            {b.alcohol.reduce((s, [, n]) => s + n, 0)} total
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {b.alcohol.map(([name, count]) => {
                            const max = b.alcohol[0][1]
                            const pct = Math.round((count / max) * 100)
                            return (
                              <div key={name} className="flex items-center gap-2.5">
                                <span className="text-[11px] text-white truncate flex-1">{name}</span>
                                <div className="flex-[2] h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-white tabular-nums w-8 text-right">{count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Soft drinks */}
                    {b.soft.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Martini className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">Refrescos</span>
                          <span className="text-[10px] text-white-muted ml-auto">
                            {b.soft.reduce((s, [, n]) => s + n, 0)} total
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {b.soft.map(([name, count]) => {
                            const max = b.soft[0][1]
                            const pct = Math.round((count / max) * 100)
                            return (
                              <div key={name} className="flex items-center gap-2.5">
                                <span className="text-[11px] text-white truncate flex-1">{name}</span>
                                <div className="flex-[2] h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-400 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[11px] font-bold text-white tabular-nums w-8 text-right">{count}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Allergies */}
                    {(b.allergyTags.length > 0 || b.allergyNotes > 0) && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Alergias</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {b.allergyTags.map(([name, count]) => (
                            <span
                              key={name}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400"
                            >
                              {name} · {count}
                            </span>
                          ))}
                          {b.allergyNotes > 0 && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white-muted">
                              + {b.allergyNotes} con notas
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
