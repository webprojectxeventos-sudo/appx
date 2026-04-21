'use client'

import { useState } from 'react'
import { CloudUpload, RefreshCw, Trash2, X, AlertCircle, WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import type { OutboxItem } from '@/lib/scanner-outbox'

/**
 * PendingSyncBadge — indicador de outbox offline + drawer con detalle.
 *
 * Diseño claro inspirado en entradas.projectxeventos.es:
 *   - Pill compacta en estados aireados (amber/red/blue) que se asoma a la
 *     derecha del StatsBar solo si hay algo que mostrar
 *   - Drawer en glass-strong con backdrop oscuro (modal, separación visual)
 *   - Filas de pendientes con icono circular + meta-text de intentos/estado
 *   - Botón sync primario con gradient blue→indigo, limpiar errores en red-50
 */
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
          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all',
          !online
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : failedCount > 0
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-blue-50 border-blue-200 text-blue-700',
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
          <span className="text-red-600/80">· {failedCount} con error</span>
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
      className="fixed inset-0 z-[90] flex items-end md:items-center md:justify-center bg-gray-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md glass-strong shadow-elevated border-t md:border md:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-hidden flex flex-col animate-drawer-up md:animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {online ? (
              <Wifi className="w-4 h-4 text-emerald-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-600" />
            )}
            <h3 className="text-sm font-bold text-gray-900">Pendientes de sincronizar</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
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
                ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] hover:brightness-110 active:scale-[0.98]'
                : 'bg-gray-100 text-gray-500 opacity-70',
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
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpiar errores
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
          {items.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-8">
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
        'rounded-xl border p-3 flex items-center gap-2.5 shadow-soft',
        isFailed
          ? 'border-red-200 bg-red-50/80'
          : 'border-amber-200 bg-amber-50/80',
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border',
          isFailed
            ? 'bg-red-100 border-red-200'
            : 'bg-amber-100 border-amber-200',
        )}
      >
        {isFailed ? (
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
        ) : (
          <CloudUpload className="w-3.5 h-3.5 text-amber-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate">
          {kindLabel(item.kind)} · {label}
        </p>
        <p
          className={cn(
            'text-[10px] truncate',
            isFailed ? 'text-red-700/80' : 'text-gray-500',
          )}
        >
          {subtitle}
        </p>
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums">
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
