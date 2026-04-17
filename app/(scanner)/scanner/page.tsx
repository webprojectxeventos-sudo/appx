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

// ── Inner component (needs scanner context) ─────────────────────────────────

function ScannerContent() {
  const { doorCount } = useScanner()
  const [tab, setTab] = useState<'scan' | 'door' | 'list'>('scan')

  return (
    <div className="space-y-4 animate-fade-in">
      <StatsBar />

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
        <button
          onClick={() => setTab('scan')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'scan' ? 'bg-primary text-white' : 'text-white-muted',
          )}
        >
          <QrCode className="w-3.5 h-3.5" />
          Escanear
        </button>
        <button
          onClick={() => setTab('door')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'door' ? 'bg-primary text-white' : 'text-white-muted',
          )}
        >
          <DoorOpen className="w-3.5 h-3.5" />
          Puerta
          {doorCount > 0 && (
            <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full">
              {doorCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('list')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'list' ? 'bg-primary text-white' : 'text-white-muted',
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
