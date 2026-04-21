'use client'

import { DoorOpen, XCircle, Clock, TrendingUp, Flame } from 'lucide-react'
import { useScanner } from './scanner-provider'
import { PendingSyncBadge } from './pending-sync-badge'

/**
 * StatsBar — resumen de asistencia del scope seleccionado.
 *
 * Diseño claro inspirado en entradas.projectxeventos.es:
 *   - glass-strong rounded-2xl shadow-soft como panel principal
 *   - Barra de progreso con gradient emerald (conserva la semántica)
 *   - Números grandes en text-gray-900, labels uppercase en text-gray-500
 *   - Metric chips neutros (gray-100) con icono de color para codificar
 *     la métrica (azul = velocidad, emerald = ETA, amber = hora pico)
 *   - Sparkline emerald sobre pista gris clara
 */
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
        <div className="glass-strong rounded-2xl shadow-soft p-3 border-red-200 bg-red-50/70 flex items-center gap-2.5">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-[11px] text-red-700 flex-1">
            No se pudieron cargar los eventos: {bootstrapError}
          </p>
          <button
            onClick={loadAttendees}
            className="text-[10px] text-red-700 font-semibold px-2 py-1 rounded-lg bg-white border border-red-200 hover:bg-red-50 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* No events */}
      {!loadingAttendees && !bootstrapError && eventIds.length === 0 && (
        <div className="glass-strong rounded-2xl shadow-soft p-4 border-amber-200 bg-amber-50/70 flex items-start gap-3">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-900 font-semibold">No hay eventos asignados</p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Pide al admin que te asigne a un evento en este venue para empezar a escanear.
            </p>
          </div>
        </div>
      )}

      {/* Stats card with progress bar */}
      {eventIds.length > 0 && (
        <div className="glass-strong rounded-2xl shadow-soft p-4 space-y-3">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                Asistencia
              </span>
              <span className="text-xs font-bold text-gray-900 tabular-nums">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200/80 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Numbers grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div data-scanner-stat className="text-xl font-bold text-gray-900 tabular-nums">{animTotal}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Total</div>
            </div>
            <div className="text-center">
              <div data-scanner-stat className="text-xl font-bold text-emerald-600 tabular-nums">{animScanned}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Dentro</div>
            </div>
            <div className="text-center">
              <div data-scanner-stat className="text-xl font-bold text-amber-600 tabular-nums">{animPending}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
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
              <div className="flex items-center gap-1.5 pt-1 border-t border-gray-200">
                {showVelocity && (
                  <MetricChip
                    icon={<TrendingUp className="w-3 h-3 text-blue-600" />}
                    value={metrics.velocityPerMin.toFixed(1)}
                    unit="/min"
                  />
                )}
                {showEta && (
                  <MetricChip
                    icon={<Clock className="w-3 h-3 text-emerald-600" />}
                    value={formatEta(metrics.etaMs!)}
                    unit="ETA"
                  />
                )}
                {showPeak && (
                  <MetricChip
                    icon={<Flame className="w-3 h-3 text-amber-600" />}
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
            <div className="flex items-center justify-center gap-1.5 pt-1 border-t border-gray-200">
              <DoorOpen className="w-3 h-3 text-amber-600" />
              <span className="text-[10px] text-amber-700 font-semibold tabular-nums">
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
  // color-coding the semantic (blue = velocity, emerald = ETA, amber = peak).
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded-lg border bg-white/70 border-gray-200 text-[10px] font-semibold text-gray-700 tabular-nums">
      {icon}
      <span>{value}</span>
      <span className="text-gray-400">{unit}</span>
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
      <p className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold">
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
              className={v > 0 ? 'fill-emerald-500' : 'fill-gray-200'}
            />
          )
        })}
      </svg>
    </div>
  )
}
