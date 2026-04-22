'use client'

import { useMemo, useRef, useEffect } from 'react'
import { Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import type { DayGroup } from './scanner-types'

// ── Timing buckets for the day as a whole ───────────────────────────────────
type DayPhase =
  | { kind: 'live' } // some event started within the last 6h — RED
  | { kind: 'soon'; label: string } // first event starts within 4h — EMERALD
  | { kind: 'upcoming'; label: string } // all events >4h away — NEUTRAL
  | { kind: 'ended' } // last event ended >6h ago — GRAY

function dayPhase(day: DayGroup, now = new Date()): DayPhase {
  const hourMs = 3_600_000
  let anyLive = false
  let earliestFuture = Infinity
  let latestPast = -Infinity
  for (const ev of day.events) {
    const t = new Date(ev.date).getTime()
    const delta = t - now.getTime()
    if (delta <= 0 && -delta < 6 * hourMs) anyLive = true
    if (delta > 0 && delta < earliestFuture) earliestFuture = delta
    if (delta <= 0 && -delta > latestPast) latestPast = -delta
  }
  if (anyLive) return { kind: 'live' }
  if (earliestFuture !== Infinity) {
    const hours = Math.floor(earliestFuture / hourMs)
    const minutes = Math.floor((earliestFuture % hourMs) / 60_000)
    const label =
      hours >= 1 ? `En ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}` : `En ${minutes}m`
    return earliestFuture < 4 * hourMs
      ? { kind: 'soon', label }
      : { kind: 'upcoming', label }
  }
  return { kind: 'ended' }
}

function chipFor(phase: DayPhase): { label: string; cls: string } {
  if (phase.kind === 'live') return { label: 'En curso', cls: 'text-red-400' }
  if (phase.kind === 'soon') return { label: phase.label, cls: 'text-emerald-400' }
  if (phase.kind === 'upcoming') return { label: phase.label, cls: 'text-white/55' }
  return { label: 'Acabó', cls: 'text-white/35' }
}

/**
 * EventPicker — selector por DÍA del scanner.
 *
 * El venue queda implícito por el login del operador; esta pill rail sólo
 * sirve para cambiar el día en foco. Dentro de un día, todos los eventos/
 * grupos se agregan automáticamente — no hay scope por grupo (eso causaba
 * mareo al tener que saltar entre pills para ver números combinados).
 *
 * Reglas de render:
 *   - 0 días → nada (StatsBar ya muestra el empty-state).
 *   - 1 día → tarjeta compacta con resumen del día, sin rail.
 *   - ≥2 días → rail horizontal con una pill por día (sin "Todos").
 */
export function EventPicker() {
  const {
    eventsByDay,
    selectedDayKey,
    setSelectedDayKey,
    attendees,
    multipleDays,
  } = useScanner()
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Aggregated inside/total counts per day.
  const perDay = useMemo(() => {
    const map: Record<string, { total: number; inside: number }> = {}
    for (const day of eventsByDay) {
      const ids = new Set(day.events.map((e) => e.id))
      let total = 0
      let inside = 0
      for (const a of attendees) {
        if (!ids.has(a.event_id)) continue
        total++
        if (a.status === 'used') inside++
      }
      map[day.key] = { total, inside }
    }
    return map
  }, [eventsByDay, attendees])

  // When there's only one day, snap the effective selection to it so inner
  // tabs that key off selectedDayKey still work regardless of persisted state.
  const effectiveKey = !multipleDays && eventsByDay[0]
    ? eventsByDay[0].key
    : selectedDayKey

  // Keep the active pill centered after selection changes or mount.
  useEffect(() => {
    if (!scrollerRef.current) return
    const sel = scrollerRef.current.querySelector<HTMLButtonElement>('[data-active="true"]')
    if (!sel) return
    sel.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [effectiveKey])

  if (eventsByDay.length === 0) return null

  // Single-day mode — just show a status card, no picker.
  if (!multipleDays) {
    const day = eventsByDay[0]
    const counts = perDay[day.key] || { total: 0, inside: 0 }
    return <SingleDayCard day={day} counts={counts} />
  }

  return (
    <div className="-mx-4">
      <div
        ref={scrollerRef}
        className="flex gap-2 overflow-x-auto px-4 pb-1 snap-x snap-mandatory scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {eventsByDay.map((day) => {
          const counts = perDay[day.key] || { total: 0, inside: 0 }
          return (
            <DayPill
              key={day.key}
              day={day}
              counts={counts}
              active={effectiveKey === day.key}
              onClick={() => setSelectedDayKey(day.key)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── Single-day variant ──────────────────────────────────────────────────────

function SingleDayCard({
  day,
  counts,
}: {
  day: DayGroup
  counts: { total: number; inside: number }
}) {
  const phase = dayPhase(day)
  const chip = chipFor(phase)
  const eventCount = day.events.length
  const earliest = day.events[0]?.date
  const latest = day.events[day.events.length - 1]?.date
  const timeRange = formatTimeRange(earliest, latest)
  const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0

  return (
    <div className="glass-strong rounded-2xl shadow-soft p-3.5 relative overflow-hidden">
      {phase.kind === 'live' && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 0% 50%, rgba(228, 30, 43, 0.18) 0%, transparent 55%)',
          }}
        />
      )}

      <div className="relative flex items-center gap-3">
        <PhaseDot phase={phase} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white truncate leading-tight">
            {day.label}
          </p>
          <p className="text-[11px] text-white/55 mt-0.5 tabular-nums">
            <span className={cn('font-semibold', chip.cls)}>{chip.label}</span>
            <span className="text-white/20"> · </span>
            <span>
              {eventCount} {eventCount === 1 ? 'grupo' : 'grupos'}
            </span>
            {timeRange && (
              <>
                <span className="text-white/20"> · </span>
                <span>{timeRange}</span>
              </>
            )}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-white tabular-nums leading-tight">
            {counts.inside}
            <span className="text-white/35">/{counts.total}</span>
          </p>
          {counts.total > 0 && (
            <p className="text-[10px] text-white/50 tabular-nums">{pct}%</p>
          )}
        </div>
      </div>

      {counts.total > 0 && (
        <div className="relative mt-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Day pill ────────────────────────────────────────────────────────────────

function DayPill({
  day,
  counts,
  active,
  onClick,
}: {
  day: DayGroup
  counts: { total: number; inside: number }
  active: boolean
  onClick: () => void
}) {
  const phase = dayPhase(day)
  const chip = chipFor(phase)
  const eventCount = day.events.length
  const earliest = day.events[0]?.date
  const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0
  const time = earliest
    ? new Date(earliest).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : ''

  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className={cn(
        'relative flex-shrink-0 snap-start w-[170px] p-3 rounded-xl text-left transition-all overflow-hidden border',
        active
          ? 'border-primary/50 bg-gradient-to-br from-primary/15 to-primary/5 shadow-soft'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04] active:scale-[0.98]',
      )}
    >
      {counts.total > 0 && (
        <div
          className={cn(
            'absolute left-0 bottom-0 h-0.5 transition-all duration-500',
            active ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-white/15',
          )}
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-center gap-1.5 mb-1.5">
        <PhaseDot phase={phase} small />
        <p className={cn('text-[10px] uppercase tracking-widest font-semibold', chip.cls)}>
          {chip.label}
        </p>
        {time && (
          <span className="ml-auto text-[10px] text-white/40 tabular-nums">{time}</span>
        )}
      </div>
      <p
        className={cn(
          'text-sm font-bold truncate leading-tight',
          active ? 'text-white' : 'text-white/85',
        )}
      >
        {day.label}
      </p>
      <p className="text-[11px] text-white/55 mt-0.5 tabular-nums">
        {counts.inside}
        <span className="text-white/35">/{counts.total}</span>
        <span className="text-white/35">
          {' '}
          · {eventCount} {eventCount === 1 ? 'grupo' : 'grupos'}
        </span>
      </p>
    </button>
  )
}

// ── Phase dot ───────────────────────────────────────────────────────────────

function PhaseDot({ phase, small }: { phase: DayPhase; small?: boolean }) {
  if (phase.kind === 'live') {
    return (
      <span className="relative inline-flex items-center justify-center">
        <span
          className={cn(
            small ? 'w-2 h-2' : 'w-2.5 h-2.5',
            'rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
          )}
        />
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
      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
      : phase.kind === 'upcoming'
        ? 'bg-white/40'
        : 'bg-white/20'
  return (
    <span className={cn(small ? 'w-2 h-2' : 'w-2.5 h-2.5', 'rounded-full', color)} />
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeRange(earliest?: string, latest?: string): string | null {
  if (!earliest) return null
  const e = new Date(earliest).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  if (!latest || latest === earliest) return e
  const l = new Date(latest).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${e} – ${l}`
}
