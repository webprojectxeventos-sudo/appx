'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Layers, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import type { ScannerEvent } from './scanner-types'

// ── Timing buckets — drives the colored status chip on each pill. ────────────
type Phase =
  | { kind: 'live' } // started within last 6h — RED (active event, scan now)
  | { kind: 'soon'; label: string } // starts within 4h — EMERALD (imminent)
  | { kind: 'upcoming'; label: string } // more than 4h away — NEUTRAL
  | { kind: 'ended' } // ended >6h ago — GRAY

function phaseFor(date: Date, now: Date = new Date()): Phase {
  const diffMs = date.getTime() - now.getTime()
  const hourMs = 3_600_000
  if (diffMs <= 0) {
    if (-diffMs < 6 * hourMs) return { kind: 'live' }
    return { kind: 'ended' }
  }
  const hours = Math.floor(diffMs / hourMs)
  const minutes = Math.floor((diffMs % hourMs) / 60_000)
  const label =
    hours >= 1 ? `En ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}` : `En ${minutes}m`
  return diffMs < 4 * hourMs ? { kind: 'soon', label } : { kind: 'upcoming', label }
}

function chipFor(phase: Phase): { label: string; cls: string } {
  if (phase.kind === 'live')
    return { label: 'En curso', cls: 'text-red-600' }
  if (phase.kind === 'soon')
    return { label: phase.label, cls: 'text-emerald-600' }
  if (phase.kind === 'upcoming')
    return { label: phase.label, cls: 'text-gray-500' }
  return { label: 'Acabó', cls: 'text-gray-400' }
}

function shortDate(date: Date, now: Date = new Date()): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return 'Hoy'
  if (d.getTime() === tomorrow.getTime()) return 'Mañana'
  if (d.getTime() === yesterday.getTime()) return 'Ayer'
  return new Date(date).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
}

/**
 * Horizontal rail of selectable event pills — the primary navigation surface
 * for scoping what the scanner is looking at. Light theme con pill activa en
 * gradient azul-índigo, "live" sigue siendo rojo semántico (evento en curso,
 * escanea ya) para distinguirse del estado "seleccionado".
 *
 *  - Todos los eventos visibles a la vez (scroll horizontal si hace falta)
 *  - "Todos" pill de agregación a la izquierda para vista venue-wide
 *  - Pill activa con ring azul + sombra blanda
 *  - 1 sólo evento → compact status card (sin rail)
 */
export function EventPicker() {
  const { serverEvents, selectedEventId, setSelectedEventId, attendees } = useScanner()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Per-event counts for the pill subtitle.
  const perEvent = useMemo(() => {
    const map: Record<string, { total: number; inside: number }> = {}
    for (const a of attendees) {
      const m = map[a.event_id] || { total: 0, inside: 0 }
      m.total++
      if (a.status === 'used') m.inside++
      map[a.event_id] = m
    }
    return map
  }, [attendees])

  const allStats = useMemo(() => {
    let inside = 0
    for (const a of attendees) if (a.status === 'used') inside++
    return { total: attendees.length, inside }
  }, [attendees])

  // When a user only has 1 event, selection in sessionStorage may still be
  // 'all'. Snap to that one event implicitly so the UI matches intent.
  const effectiveId =
    serverEvents.length === 1 ? serverEvents[0].id : selectedEventId

  // Auto-scroll the selected pill into view on mount / selection change so
  // re-opening the scanner never hides the active event off-screen.
  useEffect(() => {
    if (!scrollerRef.current) return
    const sel = scrollerRef.current.querySelector<HTMLButtonElement>('[data-active="true"]')
    if (!sel) return
    sel.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [effectiveId])

  // Nothing to show — StatsBar renders the empty state.
  if (serverEvents.length === 0) return null

  // Single-event mode — compact status card, no scrolling rail.
  if (serverEvents.length === 1) {
    const ev = serverEvents[0]
    const counts = perEvent[ev.id] || { total: 0, inside: 0 }
    return <SingleEventCard event={ev} counts={counts} />
  }

  const activeAll = effectiveId === 'all'

  return (
    <div className="-mx-4">
      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto px-4 pb-1 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Aggregate pill — venue-wide view */}
        <AggregatePill
          active={activeAll}
          total={allStats.total}
          inside={allStats.inside}
          eventCount={serverEvents.length}
          onClick={() => setSelectedEventId('all')}
        />

        {/* One pill per event */}
        {serverEvents.map((ev) => {
          const counts = perEvent[ev.id] || { total: 0, inside: 0 }
          return (
            <EventPill
              key={ev.id}
              event={ev}
              counts={counts}
              active={effectiveId === ev.id}
              onClick={() => setSelectedEventId(ev.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Single-event variant ───────────────────────────────────────────────────

function SingleEventCard({
  event,
  counts,
}: {
  event: ScannerEvent
  counts: { total: number; inside: number }
}) {
  const date = new Date(event.date)
  const phase = phaseFor(date)
  const chip = chipFor(phase)
  const name = event.group_name || event.title
  const timeLabel = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0

  return (
    <div className="glass-strong rounded-2xl shadow-soft p-3.5 relative overflow-hidden">
      {/* Glow tint for live events — subtle but unmissable */}
      {phase.kind === 'live' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 0% 50%, rgba(239, 68, 68, 0.10) 0%, transparent 55%)',
          }}
        />
      )}

      <div className="relative flex items-center gap-3">
        <PhaseDot phase={phase} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate leading-tight">{name}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
            <span className={cn('font-semibold', chip.cls)}>{chip.label}</span>
            <span className="text-gray-300"> · </span>
            <span>{timeLabel}</span>
            <span className="text-gray-300"> · </span>
            <span>{shortDate(date)}</span>
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-gray-900 tabular-nums leading-tight">
            {counts.inside}
            <span className="text-gray-400">/{counts.total}</span>
          </p>
          {counts.total > 0 && (
            <p className="text-[10px] text-gray-500 tabular-nums">{pct}%</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pill components ─────────────────────────────────────────────────────────

function AggregatePill({
  active,
  total,
  inside,
  eventCount,
  onClick,
}: {
  active: boolean
  total: number
  inside: number
  eventCount: number
  onClick: () => void
}) {
  const pct = total > 0 ? Math.round((inside / total) * 100) : 0
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        'relative flex-shrink-0 snap-start w-[140px] p-3 rounded-xl text-left transition-all overflow-hidden border',
        active
          ? 'border-blue-500/60 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-soft'
          : 'border-gray-200 bg-white/80 hover:border-gray-300 hover:bg-white active:scale-[0.98]',
      )}
    >
      {/* Progress strip */}
      {total > 0 && (
        <div
          className={cn(
            'absolute left-0 bottom-0 h-0.5 transition-all duration-500',
            active ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gray-200',
          )}
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-center gap-1.5 mb-1.5">
        <div
          className={cn(
            'w-5 h-5 rounded-md flex items-center justify-center',
            active ? 'bg-blue-100' : 'bg-gray-100',
          )}
        >
          <Layers className={cn('w-3 h-3', active ? 'text-blue-600' : 'text-gray-500')} />
        </div>
        <p className={cn('text-[10px] uppercase tracking-widest font-semibold', active ? 'text-blue-700' : 'text-gray-500')}>Todos</p>
      </div>
      <p className={cn('text-sm font-bold truncate leading-tight', active ? 'text-gray-900' : 'text-gray-800')}>
        {eventCount} eventos
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
        {inside}
        <span className="text-gray-400">/{total}</span>
        {total > 0 && <span className="text-gray-400"> · {pct}%</span>}
      </p>
    </button>
  )
}

function EventPill({
  event,
  counts,
  active,
  onClick,
}: {
  event: ScannerEvent
  counts: { total: number; inside: number }
  active: boolean
  onClick: () => void
}) {
  const date = new Date(event.date)
  const phase = phaseFor(date)
  const chip = chipFor(phase)
  const name = event.group_name || event.title
  const timeLabel = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        'relative flex-shrink-0 snap-start w-[180px] p-3 rounded-xl text-left transition-all overflow-hidden border',
        active
          ? 'border-blue-500/60 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-soft'
          : 'border-gray-200 bg-white/80 hover:border-gray-300 hover:bg-white active:scale-[0.98]',
      )}
    >
      {/* Progress strip anchored at the bottom */}
      {counts.total > 0 && (
        <div
          className={cn(
            'absolute left-0 bottom-0 h-0.5 transition-all duration-500',
            active ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gray-200',
          )}
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-center gap-1.5 mb-1.5">
        <PhaseDot phase={phase} small />
        <p className={cn('text-[10px] uppercase tracking-widest font-semibold', chip.cls)}>
          {chip.label}
        </p>
        <span className="ml-auto text-[10px] text-gray-400 tabular-nums">{timeLabel}</span>
      </div>
      <p className={cn('text-sm font-bold truncate leading-tight', active ? 'text-gray-900' : 'text-gray-800')}>
        {name}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
        {counts.inside}
        <span className="text-gray-400">/{counts.total}</span>
        <span className="text-gray-400"> · {shortDate(date)}</span>
      </p>
    </button>
  )
}

// ── Phase dot (the small status indicator) ─────────────────────────────────

function PhaseDot({ phase, small }: { phase: Phase; small?: boolean }) {
  if (phase.kind === 'live') {
    return (
      <span className="relative inline-flex items-center justify-center">
        <span className={cn(small ? 'w-2 h-2' : 'w-2.5 h-2.5', 'rounded-full bg-red-500')} />
        <span
          className={cn(
            small ? 'w-2 h-2' : 'w-2.5 h-2.5',
            'absolute rounded-full bg-red-500 animate-ping opacity-75',
          )}
        />
        {!small && <Radio className="hidden" aria-hidden />}
      </span>
    )
  }
  const color =
    phase.kind === 'soon'
      ? 'bg-emerald-500'
      : phase.kind === 'upcoming'
        ? 'bg-gray-400'
        : 'bg-gray-300'
  return <span className={cn(small ? 'w-2 h-2' : 'w-2.5 h-2.5', 'rounded-full', color)} />
}
