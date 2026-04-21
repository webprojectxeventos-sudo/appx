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
          Replaces the old EventHero card + bottom-sheet switcher combo —
          operators see all scopes at a glance and can tap to change focus
          without opening a modal. */}
      <EventPicker />

      {/* Aggregate stats for the currently-selected scope */}
      <StatsBar />

      {/* Tab switcher — gradient azul-índigo on active, glass-soft container.
          Misma estética que entradas.projectxeventos.es: el tab activo pesa
          más visualmente gracias al gradiente + shadow-soft, el resto se
          quedan como texto gris claro. */}
      <div
        role="tablist"
        aria-label="Modo del scanner"
        className="flex gap-1 p-1 bg-white/70 backdrop-blur-sm border border-gray-200/70 rounded-xl shadow-soft"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'scan'}
          onClick={() => setTab('scan')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200',
            tab === 'scan'
              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-soft'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60',
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
              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-soft'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60',
          )}
        >
          <DoorOpen className="w-3.5 h-3.5" />
          Puerta
          {doorCount > 0 && (
            <span className={cn(
              'text-[9px] px-1.5 py-0.5 rounded-full tabular-nums font-bold',
              tab === 'door' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700',
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
              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-soft'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60',
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
