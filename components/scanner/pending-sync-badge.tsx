'use client'

import { useState } from 'react'
import { CloudUpload, RefreshCw, Trash2, X, AlertCircle, WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import type { OutboxItem } from '@/lib/scanner-outbox'

export function PendingSyncBadge() {
  const {
    online,
    pendingSyncCount,
    pendingItems,
    flushOutbox,
    clearFailedOutbox,
  } = useScanner()
  const [open, setOpen] = useState(false)
  const [flushing, setFlushing] = useState(false)

  const failedCount = pendingItems.filter((i) => i.status === 'failed').length
  const hasAny = pendingItems.length > 0

  if (!hasAny && online) return null

  const handleFlush = async () => {
    setFlushing(true)
    try {
      await flushOutbox()
    } finally {
      setFlushing(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all',
          !online
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            : failedCount > 0
              ? 'bg-red-500/15 border-red-500/30 text-red-400'
              : 'bg-primary/10 border-primary/25 text-primary',
        )}
      >
        {!online ? (
          <WifiOff className="w-3 h-3" />
        ) : failedCount > 0 ? (
          <AlertCircle className="w-3 h-3" />
        ) : (
          <CloudUpload className="w-3 h-3" />
        )}
        {!online && pendingSyncCount === 0
          ? 'Offline'
          : `${pendingSyncCount} pendiente${pendingSyncCount === 1 ? '' : 's'}`}
        {failedCount > 0 && (
          <span className="text-red-400/80">· {failedCount} con error</span>
        )}
      </button>

      {open && (
        <PendingSyncDrawer
          items={pendingItems}
          online={online}
          flushing={flushing}
          onFlush={handleFlush}
          onClearFailed={clearFailedOutbox}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function PendingSyncDrawer({
  items,
  online,
  flushing,
  onFlush,
  onClearFailed,
  onClose,
}: {
  items: OutboxItem[]
  online: boolean
  flushing: boolean
  onFlush: () => void
  onClearFailed: () => void
  onClose: () => void
}) {
  const failedCount = items.filter((i) => i.status === 'failed').length

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md bg-[#141414] border-t md:border md:rounded-2xl border-black-border rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col animate-drawer-up md:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-black-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {online ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-400" />
            )}
            <h3 className="text-sm font-bold text-white">Pendientes de sincronizar</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex items-center gap-2">
          <button
            onClick={onFlush}
            disabled={flushing || !online}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-all',
              online && !flushing
                ? 'bg-primary text-white hover:brightness-110'
                : 'bg-white/5 text-white-muted opacity-60',
            )}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', flushing && 'animate-spin')} />
            {flushing
              ? 'Sincronizando...'
              : online
                ? 'Sincronizar ahora'
                : 'Esperando conexion'}
          </button>
          {failedCount > 0 && (
            <button
              onClick={onClearFailed}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar errores
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {items.length === 0 ? (
            <p className="text-center text-xs text-white/40 py-8">
              No hay acciones pendientes
            </p>
          ) : (
            items.map((item) => <PendingRow key={item.id} item={item} />)
          )}
        </div>
      </div>
    </div>
  )
}

function PendingRow({ item }: { item: OutboxItem }) {
  const label = item.label || kindLabel(item.kind)
  const subtitle = getSubtitle(item)
  const isFailed = item.status === 'failed'
  return (
    <div
      className={cn(
        'card p-3 flex items-center gap-2.5',
        isFailed ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5',
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isFailed ? 'bg-red-500/15' : 'bg-amber-500/15',
        )}
      >
        {isFailed ? (
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        ) : (
          <CloudUpload className="w-3.5 h-3.5 text-amber-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white truncate">
          {kindLabel(item.kind)} · {label}
        </p>
        <p
          className={cn(
            'text-[10px] truncate',
            isFailed ? 'text-red-300/80' : 'text-white/40',
          )}
        >
          {subtitle}
        </p>
      </div>
      <span className="text-[10px] text-white/30 tabular-nums">
        {new Date(item.createdAt).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  )
}

function kindLabel(kind: OutboxItem['kind']): string {
  switch (kind) {
    case 'scan':
      return 'Scan'
    case 'undo':
      return 'Deshacer'
    case 'door-register':
      return 'Puerta'
    case 'cloakroom-action':
      return 'Ropero'
    case 'cloakroom-checkin':
      return 'Ropero entrada'
    case 'cloakroom-checkout':
      return 'Ropero salida'
  }
}

function getSubtitle(item: OutboxItem): string {
  if (item.status === 'failed') {
    return `Fallo: ${item.lastError || 'desconocido'}`
  }
  if (item.attempts === 0) return 'A la espera'
  return `Intento ${item.attempts} · ${item.lastError ? item.lastError : 'reintentando'}`
}
