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
import { EventHero } from '@/components/scanner/event-hero'
import { EventSwitcherSheet } from '@/components/scanner/event-switcher-sheet'

// ── Inner component (needs scanner context) ─────────────────────────────────

function ScannerContent() {
  const { doorCount } = useScanner()
  const [tab, setTab] = useState<'scan' | 'door' | 'list'>('scan')
  const [switcherOpen, setSwitcherOpen] = useState(false)

  return (
    <div className="space-y-4 animate-fade-in">
      <EventHero onOpenSwitcher={() => setSwitcherOpen(true)} />
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

      {/* Bottom-sheet for changing which event is in focus */}
      <EventSwitcherSheet open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
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
