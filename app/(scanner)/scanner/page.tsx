'use client'

import { useState } from 'react'
import { QrCode, DoorOpen, Users, Layers } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ScannerProvider, useScanner } from '@/components/scanner/scanner-provider'
import { StatsBar } from '@/components/scanner/stats-bar'
import { ScanTab } from '@/components/scanner/scan-tab'
import { DoorTab } from '@/components/scanner/door-tab'
import { ListTab } from '@/components/scanner/list-tab'
import type { ScannerEvent } from '@/components/scanner/scanner-types'

// ── Inner component (needs scanner context) ─────────────────────────────────

// ── Event scope selector ────────────────────────────────────────────────────
// Horizontal pill rail. "Todos" shows everything at the venue. Each event pill
// switches the scanner (stats, list, door recent entries) to that event only.

function EventScopeSelector() {
  const { serverEvents, selectedEventId, setSelectedEventId, attendees, eventNameMap } = useScanner()

  // Per-event quick stats for the pill subtitle: total / inside
  const perEventCounts = (() => {
    const totals: Record<string, { total: number; inside: number }> = {}
    for (const a of attendees) {
      const t = totals[a.event_id] || { total: 0, inside: 0 }
      t.total++
      if (a.status === 'used') t.inside++
      totals[a.event_id] = t
    }
    return totals
  })()

  const totalAcrossAll = attendees.length
  const insideAcrossAll = attendees.filter((a) => a.status === 'used').length

  // If only one event, hide the selector — nothing to switch between
  if (serverEvents.length <= 1) return null

  const sorted: ScannerEvent[] = [...serverEvents].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  return (
    <div className="-mx-4 px-4 overflow-x-auto scrollbar-hide">
      <div className="flex gap-2 pb-1 min-w-min">
        {/* "Todos" pill */}
        <button
          onClick={() => setSelectedEventId('all')}
          className={cn(
            'flex-shrink-0 flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-xl border transition-all',
            selectedEventId === 'all'
              ? 'bg-primary/15 border-primary/30 text-white shadow-[0_2px_12px_rgba(228,30,43,0.25)]'
              : 'bg-white/[0.03] border-white/[0.06] text-white/70',
          )}
        >
          <Layers className={cn('w-3.5 h-3.5', selectedEventId === 'all' ? 'text-primary' : 'text-white/40')} />
          <div className="text-left">
            <p className="text-[11px] font-bold leading-tight">Todos</p>
            <p className={cn('text-[9px] leading-tight', selectedEventId === 'all' ? 'text-white/60' : 'text-white/30')}>
              {insideAcrossAll}/{totalAcrossAll}
            </p>
          </div>
        </button>

        {sorted.map((ev) => {
          const active = selectedEventId === ev.id
          const name = ev.group_name || ev.title
          const counts = perEventCounts[ev.id] || { total: 0, inside: 0 }
          const time = new Date(ev.date).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
          const pct = counts.total > 0 ? Math.round((counts.inside / counts.total) * 100) : 0
          return (
            <button
              key={ev.id}
              onClick={() => setSelectedEventId(ev.id)}
              className={cn(
                'flex-shrink-0 relative flex items-center gap-2.5 pl-3 pr-3.5 py-2 rounded-xl border transition-all overflow-hidden',
                active
                  ? 'bg-gradient-to-br from-primary/20 to-primary/5 border-primary/40 text-white shadow-[0_2px_14px_rgba(228,30,43,0.3)]'
                  : 'bg-white/[0.03] border-white/[0.06] text-white/70',
              )}
            >
              {/* Subtle progress bar fill at bottom for active pill */}
              {active && counts.total > 0 && (
                <div
                  className="absolute left-0 bottom-0 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="text-left min-w-0">
                <p className="text-[11px] font-bold leading-tight truncate max-w-[140px]">{name}</p>
                <p className={cn('text-[9px] leading-tight tabular-nums', active ? 'text-white/70' : 'text-white/35')}>
                  {time} · {counts.inside}/{counts.total}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ScannerContent() {
  const { doorCount } = useScanner()
  const [tab, setTab] = useState<'scan' | 'door' | 'list'>('scan')

  return (
    <div className="space-y-4 animate-fade-in">
      <EventScopeSelector />
      <StatsBar />

      {/* Tab switcher — gradient on active, subtle shadow, icon pops */}
      <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06]">
        <button
          onClick={() => setTab('scan')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-200',
            tab === 'scan'
              ? 'bg-gradient-to-br from-primary to-red-700 text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/50 hover:text-white/70',
          )}
        >
          <QrCode className={cn('w-3.5 h-3.5', tab === 'scan' && 'drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]')} />
          Escanear
        </button>
        <button
          onClick={() => setTab('door')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-200',
            tab === 'door'
              ? 'bg-gradient-to-br from-primary to-red-700 text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/50 hover:text-white/70',
          )}
        >
          <DoorOpen className={cn('w-3.5 h-3.5', tab === 'door' && 'drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]')} />
          Puerta
          {doorCount > 0 && (
            <span className={cn(
              'text-[9px] px-1.5 py-0.5 rounded-full tabular-nums font-bold',
              tab === 'door' ? 'bg-white/25 text-white' : 'bg-amber-500/20 text-amber-300',
            )}>
              {doorCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('list')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-200',
            tab === 'list'
              ? 'bg-gradient-to-br from-primary to-red-700 text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/50 hover:text-white/70',
          )}
        >
          <Users className={cn('w-3.5 h-3.5', tab === 'list' && 'drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]')} />
          Lista
        </button>
      </div>

      {/* Active tab */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {tab === 'scan' && <ScanTab />}
          {tab === 'door' && <DoorTab />}
          {tab === 'list' && <ListTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  return (
    <ScannerProvider>
      <ScannerContent />
    </ScannerProvider>
  )
}
