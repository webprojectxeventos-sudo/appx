'use client'

import { useState } from 'react'
import { QrCode, DoorOpen, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ScannerProvider, useScanner } from '@/components/scanner/scanner-provider'
import { StatsBar } from '@/components/scanner/stats-bar'
import { ScanTab } from '@/components/scanner/scan-tab'
import { DoorTab } from '@/components/scanner/door-tab'
import { ListTab } from '@/components/scanner/list-tab'
import { EventPicker } from '@/components/scanner/event-picker'

// ── Inner component (needs scanner context) ─────────────────────────────────

function ScannerContent() {
  const { doorCount } = useScanner()
  const [tab, setTab] = useState<'scan' | 'door' | 'list'>('scan')

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Primary navigation: horizontal rail of all events at the venue.
          Operators see all scopes at a glance and can tap to change focus
          without opening a modal. */}
      <EventPicker />

      {/* Aggregate stats for the currently-selected scope */}
      <StatsBar />

      {/* Tab switcher — segmented control oscuro con el tab activo en gradient
          primary (rojo) para coherencia con el resto de la app. */}
      <div
        role="tablist"
        aria-label="Modo del scanner"
        className="flex gap-1 p-1 bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-xl shadow-soft"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'scan'}
          onClick={() => setTab('scan')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200',
            tab === 'scan'
              ? 'bg-gradient-to-br from-primary-light via-primary to-primary-dark text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/65 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <QrCode className="w-3.5 h-3.5" />
          Escanear
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'door'}
          onClick={() => setTab('door')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200',
            tab === 'door'
              ? 'bg-gradient-to-br from-primary-light via-primary to-primary-dark text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/65 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <DoorOpen className="w-3.5 h-3.5" />
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
          type="button"
          role="tab"
          aria-selected={tab === 'list'}
          onClick={() => setTab('list')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200',
            tab === 'list'
              ? 'bg-gradient-to-br from-primary-light via-primary to-primary-dark text-white shadow-[0_4px_14px_rgba(228,30,43,0.35)]'
              : 'text-white/65 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <Users className="w-3.5 h-3.5" />
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
