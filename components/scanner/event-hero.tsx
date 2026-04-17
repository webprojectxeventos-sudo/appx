'use client'

import { useMemo } from 'react'
import { ChevronRight, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'

interface Props {
  onOpenSwitcher: () => void
}

// Event timing buckets — drives the colored status chip.
type Phase =
  | { kind: 'live' } // started within last 6h
  | { kind: 'soon'; label: string } // starts within 4h (emerald)
  | { kind: 'upcoming'; label: string } // more than 4h away (neutral)
  | { kind: 'ended' } // ended >6h ago

function phaseFor(date: Date, now: Date = new Date()): Phase {
  const diffMs = date.getTime() - now.getTime()
  const hourMs = 3_600_000
  if (diffMs <= 0) {
    if (-diffMs < 6 * hourMs) return { kind: 'live' }
    return { kind: 'ended' }
  }
  const hours = Math.floor(diffMs / hourMs)
  const minutes = Math.floor((diffMs % hourMs) / 60_000)
  const label = hours >= 1 ? `En ${hours}h${minutes > 0 ? ` ${minutes}m` : ''}` : `En ${minutes}m`
  return diffMs < 4 * hourMs ? { kind: 'soon', label } : { kind: 'upcoming', label }
}

/**
 * Wide card that anchors the scanner screen — replaces the horizontal pill
 * rail. Shows:
 *  - Which scope is active (all-venue aggregate OR a specific event)
 *  - State chip (En curso / En 2h / Acabó)
 *  - Progress of that scope
 *  - Tap target to open the bottom-sheet switcher
 *
 * Kept entirely presentational aside from `useScanner` — the parent owns the
 * "open switcher" state so the sheet can be mounted at the page level.
 */
export function EventHero({ onOpenSwitcher }: Props) {
  const { serverEvents, selectedEventId, stats } = useScanner()

  const hasMultiple = serverEvents.length > 1
  // When a user only has 1 event, selectedEventId might still be 'all' in
  // storage — treat that as implicit focus on the single event.
  const effectiveId =
    serverEvents.length === 1 ? serverEvents[0].id : selectedEventId

  const activeEvent = useMemo(() => {
    if (effectiveId === 'all') return null
    return serverEvents.find((e) => e.id === effectiveId) || null
  }, [serverEvents, effectiveId])

  // Nothing to show yet — StatsBar renders the empty state elsewhere.
  if (serverEvents.length === 0) return null

  const pct = stats.total > 0 ? Math.round((stats.scanned / stats.total) * 100) : 0
  const clickable = hasMultiple

  // Aggregate ("Todos los eventos") variant — only surfaced when >1 event AND
  // the user hasn't narrowed scope.
  if (effectiveId === 'all') {
    return (
      <button
        type="button"
        onClick={clickable ? onOpenSwitcher : undefined}
        disabled={!clickable}
        className={cn(
          'w-full card p-3.5 flex items-center gap-3 text-left transition-all',
          clickable && 'hover:border-primary/30 active:scale-[0.995]',
        )}
      >
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">
            Escaneando
          </p>
          <p className="text-sm font-bold text-white truncate leading-tight mt-0.5">
            Todos los eventos
          </p>
          <p className="text-[11px] text-white-muted mt-0.5 tabular-nums">
            {serverEvents.length} eventos · {stats.total} personas
          </p>
        </div>
        {clickable && <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />}
      </button>
    )
  }

  if (!activeEvent) return null

  const eventDate = new Date(activeEvent.date)
  const phase = phaseFor(eventDate)
  const timeLabel = eventDate.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const eventName = activeEvent.group_name || activeEvent.title

  let chipClass = ''
  let chipLabel = ''
  if (phase.kind === 'live') {
    chipClass = 'bg-primary/15 text-primary border-primary/30'
    chipLabel = 'En curso'
  } else if (phase.kind === 'soon') {
    chipClass = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    chipLabel = phase.label
  } else if (phase.kind === 'upcoming') {
    chipClass = 'bg-white/5 text-white/60 border-white/10'
    chipLabel = phase.label
  } else {
    chipClass = 'bg-white/[0.04] text-white/40 border-white/10'
    chipLabel = 'Acabó'
  }

  return (
    <button
      type="button"
      onClick={clickable ? onOpenSwitcher : undefined}
      disabled={!clickable}
      className={cn(
        'w-full card p-3.5 flex flex-col gap-2 relative overflow-hidden text-left transition-all',
        clickable && 'hover:border-primary/30 active:scale-[0.995]',
      )}
    >
      {/* Progress strip anchored at the bottom of the card — mirrors stats-bar
          percentage so you can glance-read how full the event is. */}
      {stats.total > 0 && (
        <div
          className="absolute left-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider tabular-nums',
            chipClass,
          )}
        >
          {chipLabel}
        </span>
        <span className="text-[10px] text-white/40 tabular-nums">{timeLabel}</span>
        {clickable && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-white/40">
            Cambiar
            <ChevronRight className="w-3 h-3" />
          </span>
        )}
      </div>

      <div>
        <p className="text-[15px] font-bold text-white truncate leading-tight">{eventName}</p>
        <p className="text-[11px] text-white-muted mt-0.5 tabular-nums">
          {stats.scanned} de {stats.total} dentro
          {stats.total > 0 && <span className="text-white/30"> · {pct}%</span>}
        </p>
      </div>
    </button>
  )
}
