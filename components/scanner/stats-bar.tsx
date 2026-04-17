'use client'

import { DoorOpen, XCircle, Clock } from 'lucide-react'
import { useScanner } from './scanner-provider'
import { PendingSyncBadge } from './pending-sync-badge'

export function StatsBar() {
  const {
    animTotal,
    animScanned,
    animPending,
    doorCount,
    stats,
    loadingAttendees,
    bootstrapError,
    loadAttendees,
    eventIds,
  } = useScanner()

  const pct = stats.total > 0 ? Math.round((stats.scanned / stats.total) * 100) : 0

  return (
    <div className="space-y-3">
      {/* Sync status strip — only renders when there is something to show */}
      <div className="flex justify-end -mt-1">
        <PendingSyncBadge />
      </div>
      {/* Bootstrap error banner */}
      {bootstrapError && (
        <div className="card p-3 border-red-500/30 bg-red-500/5 flex items-center gap-2.5">
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-[11px] text-red-300 flex-1">
            No se pudieron cargar los eventos: {bootstrapError}
          </p>
          <button
            onClick={loadAttendees}
            className="text-[10px] text-red-300 font-medium px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* No events */}
      {!loadingAttendees && !bootstrapError && eventIds.length === 0 && (
        <div className="card p-4 border-amber-500/20 bg-amber-500/[0.02] flex items-start gap-3">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">No hay eventos asignados</p>
            <p className="text-[11px] text-white-muted mt-0.5">
              Pide al admin que te asigne a un evento en este venue para empezar a escanear.
            </p>
          </div>
        </div>
      )}

      {/* Stats card with progress bar */}
      {eventIds.length > 0 && (
        <div className="card p-4 space-y-3">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-white-muted font-medium">
                Asistencia
              </span>
              <span className="text-xs font-bold text-white tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Numbers grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-xl font-bold text-white tabular-nums">{animTotal}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">Total</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-emerald-400 tabular-nums">{animScanned}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">Dentro</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-amber-400 tabular-nums">{animPending}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">
                Pendiente
              </div>
            </div>
          </div>

          {/* Door badge */}
          {doorCount > 0 && (
            <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-black-border">
              <DoorOpen className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-medium tabular-nums">
                {doorCount} en puerta
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
