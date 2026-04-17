'use client'

import { useEffect, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Layers, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import type { ScannerEvent } from './scanner-types'

interface Props {
  open: boolean
  onClose: () => void
}

// Timing buckets. Identical logic to EventHero — kept here to avoid a shared
// helper file; if we grow a third consumer we'll extract to scanner-utils.
type Phase =
  | { kind: 'live' }
  | { kind: 'soon'; label: string }
  | { kind: 'upcoming'; label: string }
  | { kind: 'ended' }

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

function chipFor(phase: Phase) {
  if (phase.kind === 'live') return { label: 'En curso', cls: 'bg-primary/15 text-primary border-primary/30' }
  if (phase.kind === 'soon') return { label: phase.label, cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' }
  if (phase.kind === 'upcoming') return { label: phase.label, cls: 'bg-white/5 text-white/60 border-white/10' }
  return { label: 'Acabó', cls: 'bg-white/[0.04] text-white/40 border-white/10' }
}

/**
 * Bottom-sheet modal for picking which event scope the scanner is focused on.
 * Opened from EventHero. Renders:
 *  - "Todos los eventos" aggregate row at the top
 *  - Each event as a row grouped by day (Hoy / Mañana / other)
 *  - Color-coded state chips
 *
 * Closes when the user selects an option or taps the backdrop.
 */
export function EventSwitcherSheet({ open, onClose }: Props) {
  const { serverEvents, selectedEventId, setSelectedEventId, attendees, eventsByDay } = useScanner()

  // Per-event inside/total counts for the right-side stat readout.
  const perEventCounts = useMemo(() => {
    const totals: Record<string, { total: number; inside: number }> = {}
    for (const a of attendees) {
      const t = totals[a.event_id] || { total: 0, inside: 0 }
      t.total++
      if (a.status === 'used') t.inside++
      totals[a.event_id] = t
    }
    return totals
  }, [attendees])

  const allStats = useMemo(() => {
    let inside = 0
    for (const a of attendees) if (a.status === 'used') inside++
    return { total: attendees.length, inside }
  }, [attendees])

  // Close on Escape for accessibility
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent background scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleSelect = (id: string | 'all') => {
    setSelectedEventId(id)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[#0e0e0e] border-t border-white/[0.08] shadow-[0_-12px_40px_rgba(0,0,0,0.5)]"
            role="dialog"
            aria-modal="true"
            aria-label="Selector de evento"
          >
            {/* Drag handle */}
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="px-4 pb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-medium">Escanear</p>
                <h2 className="text-base font-bold text-white mt-0.5">Elegir evento</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/10 transition-colors flex items-center justify-center"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Scrollable content — capped at 70vh so it never covers the full
                screen on short devices, but still gives plenty of room. */}
            <div className="px-3 pb-4 max-h-[70vh] overflow-y-auto">
              {/* "Todos" aggregate row */}
              <SheetRow
                active={selectedEventId === 'all'}
                onClick={() => handleSelect('all')}
                leading={
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-primary" />
                  </div>
                }
                title="Todos los eventos"
                subtitle={`${serverEvents.length} evento${serverEvents.length !== 1 ? 's' : ''}`}
                rightTop={`${allStats.inside}/${allStats.total}`}
                rightBottom={null}
              />

              {/* Events grouped by day. "Hoy" appears first when present. */}
              {eventsByDay.map((group) => (
                <div key={group.key} className="mt-3">
                  <p className="px-1 pb-1.5 text-[10px] uppercase tracking-widest text-white/30 font-medium">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.events.map((ev) => (
                      <EventRow
                        key={ev.id}
                        event={ev}
                        counts={perEventCounts[ev.id] || { total: 0, inside: 0 }}
                        active={selectedEventId === ev.id}
                        onSelect={() => handleSelect(ev.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Safe-area padding for iPhones with home indicator */}
              <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Row components ────────────────────────────────────────────────────────

function EventRow({
  event,
  counts,
  active,
  onSelect,
}: {
  event: ScannerEvent
  counts: { total: number; inside: number }
  active: boolean
  onSelect: () => void
}) {
  const date = new Date(event.date)
  const phase = phaseFor(date)
  const chip = chipFor(phase)
  const timeLabel = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const name = event.group_name || event.title
  const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative w-full text-left p-3 rounded-xl border transition-all overflow-hidden',
        active
          ? 'border-primary/40 bg-gradient-to-br from-primary/15 to-primary/[0.03] shadow-[0_2px_14px_rgba(228,30,43,0.18)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10',
      )}
    >
      {/* Subtle progress strip for events with tickets */}
      {counts.total > 0 && (
        <div
          className={cn(
            'absolute left-0 bottom-0 h-0.5 transition-all duration-500',
            active
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-white/20',
          )}
          style={{ width: `${pct}%` }}
        />
      )}

      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={cn(
                'text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider tabular-nums',
                chip.cls,
              )}
            >
              {chip.label}
            </span>
            <span className="text-[10px] text-white/40 tabular-nums">{timeLabel}</span>
          </div>
          <p className={cn('text-sm font-bold truncate leading-tight', active ? 'text-white' : 'text-white/90')}>
            {name}
          </p>
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-white tabular-nums leading-tight">
              {counts.inside}
              <span className="text-white/30">/{counts.total}</span>
            </p>
            {counts.total > 0 && (
              <p className="text-[10px] text-white/40 tabular-nums">{pct}%</p>
            )}
          </div>
          {active && (
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-[0_2px_8px_rgba(228,30,43,0.4)]">
              <Check className="w-3.5 h-3.5 text-white" />
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function SheetRow({
  active,
  onClick,
  leading,
  title,
  subtitle,
  rightTop,
  rightBottom,
}: {
  active: boolean
  onClick: () => void
  leading: React.ReactNode
  title: string
  subtitle: string
  rightTop: string
  rightBottom: string | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3',
        active
          ? 'border-primary/40 bg-gradient-to-br from-primary/15 to-primary/[0.03] shadow-[0_2px_14px_rgba(228,30,43,0.18)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10',
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate leading-tight">{title}</p>
        <p className="text-[11px] text-white/50 truncate mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <p className="text-sm font-bold text-white tabular-nums leading-tight">{rightTop}</p>
          {rightBottom && <p className="text-[10px] text-white/40 tabular-nums">{rightBottom}</p>}
        </div>
        {active && (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-[0_2px_8px_rgba(228,30,43,0.4)]">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>
    </button>
  )
}
