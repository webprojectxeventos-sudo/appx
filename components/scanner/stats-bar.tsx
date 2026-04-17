'use client'

import { DoorOpen, XCircle, Clock, TrendingUp, Flame } from 'lucide-react'
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
    metrics,
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
              <div data-scanner-stat className="text-xl font-bold text-white tabular-nums">{animTotal}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">Total</div>
            </div>
            <div className="text-center">
              <div data-scanner-stat className="text-xl font-bold text-emerald-400 tabular-nums">{animScanned}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">Dentro</div>
            </div>
            <div className="text-center">
              <div data-scanner-stat className="text-xl font-bold text-amber-400 tabular-nums">{animPending}</div>
              <div className="text-[10px] uppercase tracking-widest text-white-muted">
                Pendiente
              </div>
            </div>
          </div>

          {/* Live metrics row.
              - Velocity: always if >0 (tells you the line is moving)
              - ETA: when velocity + pending both >0 and reachable
              - Peak hour: gated behind ≥20 scans so it's statistically
                meaningful — otherwise you just see "11h pico" after 2 scans
                at the same hour, which is noise.
              - Unified neutral chip background + colored icon reads as a
                single instrument cluster instead of 3 competing pills. */}
          {(() => {
            const showVelocity = metrics.velocityPerMin > 0
            const showEta = metrics.etaMs !== null && metrics.etaMs < 24 * 60 * 60_000
            const showPeak = metrics.peakHour !== null && stats.scanned >= 20
            const anyMetric = showVelocity || showEta || showPeak
            if (!anyMetric) return null
            return (
              <div className="flex items-center gap-1.5 pt-1 border-t border-black-border">
                {showVelocity && (
                  <MetricChip
                    icon={<TrendingUp className="w-3 h-3 text-primary" />}
                    value={metrics.velocityPerMin.toFixed(1)}
                    unit="/min"
                  />
                )}
                {showEta && (
                  <MetricChip
                    icon={<Clock className="w-3 h-3 text-emerald-400" />}
                    value={formatEta(metrics.etaMs!)}
                    unit="ETA"
                  />
                )}
                {showPeak && (
                  <MetricChip
                    icon={<Flame className="w-3 h-3 text-amber-400" />}
                    value={`${String(metrics.peakHour).padStart(2, '0')}h`}
                    unit="pico"
                  />
                )}
              </div>
            )
          })()}

          {/* Sparkline of last 2h (15-min buckets) — only when there's enough
              history to be informative (≥3 non-empty buckets). */}
          {metrics.sparkline.filter((v) => v > 0).length >= 3 && (
            <Sparkline values={metrics.sparkline} />
          )}

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

// ── Helpers ────────────────────────────────────────────────────────────────

function MetricChip({
  icon,
  value,
  unit,
}: {
  icon: React.ReactNode
  value: string
  unit: string
}) {
  // Unified neutral chip — the accent color lives on the icon. Keeps the row
  // visually cohesive (all chips look like they belong together) while still
  // color-coding the semantic (primary = velocity, emerald = ETA, amber = peak).
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white/[0.03] border-white/[0.08] text-[10px] font-medium text-white/80 tabular-nums">
      {icon}
      <span>{value}</span>
      <span className="text-white/35">{unit}</span>
    </div>
  )
}

function formatEta(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `${h}h`
  return `${h}h${m}m`
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  const w = 200
  const h = 28
  const barGap = 2
  const barW = (w - barGap * (values.length - 1)) / values.length
  return (
    <div className="space-y-1">
      <p className="text-[9px] uppercase tracking-widest text-white/30 font-medium">
        Entradas ultimas 2h
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
        {values.map((v, i) => {
          const barH = Math.max(1, (v / max) * (h - 2))
          const x = i * (barW + barGap)
          const y = h - barH
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={1.5}
              className={v > 0 ? 'fill-emerald-400/80' : 'fill-white/10'}
            />
          )
        })}
      </svg>
    </div>
  )
}
