'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  Camera,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  Clock,
  Wifi,
  WifiOff,
  CloudUpload,
  Loader2,
  Flashlight,
  FlashlightOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScanner } from './scanner-provider'
import { playBeep, hapticLevel, formatTime } from './scanner-utils'
import { useToast } from '@/components/ui/toast'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import {
  startFastScanner,
  humanizeCameraError,
  type FastScannerHandle,
} from '@/lib/scanner/fast-scan-engine'
import { validateScanLocal } from '@/lib/scanner/scan-validator'
import { syncScanInBackground } from '@/lib/scanner/scan-sync-queue'

type ScanKind = 'pending' | 'success' | 'duplicate' | 'error' | 'queued'

interface RecentScan {
  /** stable id used for updating log entry after server responds */
  key: string
  qr: string
  kind: ScanKind
  name: string
  subtitle: string
  at: number
}

const RECENT_LIMIT = 5
const VELOCITY_WINDOW_MS = 60_000
const HERO_MS = 3_500 // how long the most recent scan stays in "hero" mode

export function ScanTab() {
  const {
    patchAttendee,
    soundEnabled,
    setSoundEnabled,
    attendeesByQrRef,
    eventNameMapRef,
    soundEnabledRef,
    loadAttendeesRef,
  } = useScanner()

  const toast = useToast()
  const online = useOnlineStatus()

  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recent, setRecent] = useState<RecentScan[]>([])
  const [sessionValid, setSessionValid] = useState(0)
  const [flash, setFlash] = useState<'none' | 'pending' | 'success' | 'duplicate' | 'error'>('none')
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tick state purely to re-render the hero card as it expires
  const [, setTick] = useState(0)

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Handle returned by the fast scanner engine. Null while idle. */
  const engineRef = useRef<FastScannerHandle | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const toggleTorch = useCallback(async () => {
    const track = engineRef.current?.getTrack() ?? null
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch (err) {
      console.warn('Torch not supported on this device', err)
      setTorchSupported(false)
    }
  }, [torchOn])

  const triggerFlash = useCallback(
    (kind: 'pending' | 'success' | 'duplicate' | 'error') => {
      setFlash(kind)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlash('none'), 600)
    },
    [],
  )

  // Re-render hero card every 500ms while it's active to animate fade
  useEffect(() => {
    if (recent.length === 0) return
    const first = recent[0]
    const elapsed = Date.now() - first.at
    if (elapsed >= HERO_MS) return
    const t = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [recent])

  // ── Recent log helpers ──────────────────────────────────────────────────

  const addPending = useCallback((qr: string, name: string, subtitle: string): string => {
    const key = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setRecent((prev) =>
      [
        { key, qr, kind: 'pending' as const, name, subtitle, at: Date.now() },
        ...prev,
      ].slice(0, RECENT_LIMIT),
    )
    return key
  }, [])

  const finalizeRecent = useCallback(
    (key: string, patch: Partial<RecentScan>) => {
      setRecent((prev) =>
        prev.map((r) => (r.key === key ? { ...r, ...patch, at: Date.now() } : r)),
      )
    },
    [],
  )

  // Velocity: scans per minute based on confirmed entries in last 60s
  const velocity = useMemo(() => {
    const now = Date.now()
    return recent.filter(
      (r) => (r.kind === 'success' || r.kind === 'queued') && now - r.at < VELOCITY_WINDOW_MS,
    ).length
  }, [recent])

  // ── Scan logic ────────────────────────────────────────────────────────────
  //
  // The hot path is local-first: we look up the QR in the in-memory index
  // built by the scanner provider, decide success / duplicate / cancelled
  // / unknown, and flash the UI in <5 ms. The backend call happens in the
  // background via `syncScanInBackground` — it's no longer a gate on visible
  // feedback. If the server later contradicts our optimistic decision (rare,
  // e.g. remotely cancelled ticket) the conflict callback reverts the
  // patched row and surfaces a toast.
  //
  // This replaces the old path where each scan awaited an HTTP round-trip
  // before painting anything — ~800 ms → ~50 ms end-to-end on mid-range
  // Android phones at a busy venue.

  const processScan = useCallback(
    (qrCode: string) => {
      const local = validateScanLocal(qrCode, {
        attendeesByQr: attendeesByQrRef.current,
        eventNameMap: eventNameMapRef.current,
      })

      if (local.kind === 'success') {
        const name = local.attendee.user_name || 'Sin nombre'
        const subtitle = local.eventTitle || 'Validado'
        const recentKey = addPending(qrCode, name, subtitle)
        triggerFlash('success')
        if (soundEnabledRef.current) playBeep(true)
        hapticLevel('success')
        setSessionValid((v) => v + 1)
        const prevStatus = local.attendee.status
        const prevScannedAt = local.attendee.scanned_at
        patchAttendee({
          id: local.attendee.id,
          status: 'used',
          scanned_at: new Date().toISOString(),
        })
        finalizeRecent(recentKey, { kind: 'success', name, subtitle })
        syncScanInBackground({
          qr: qrCode,
          label: name,
          onConflict: (conflict) => {
            if (conflict.reason === 'already_scanned') {
              // Another scanner got there first — keep the row marked used
              // (that's still the correct final state) but downgrade our
              // optimistic "this operator admitted them" to a duplicate.
              setSessionValid((v) => Math.max(0, v - 1))
              const when = conflict.scannedAt
                ? ` a las ${formatTime(conflict.scannedAt)}`
                : ''
              toast.warning(`${conflict.userName || name} · ya habia entrado`)
              finalizeRecent(recentKey, {
                kind: 'duplicate',
                name: conflict.userName || name,
                subtitle: `Ya entro${when}`,
              })
              return
            }
            if (conflict.reason === 'cancelled' || conflict.reason === 'not_found') {
              // Revert the optimism — ticket shouldn't have been let in.
              patchAttendee({
                id: local.attendee.id,
                status: prevStatus,
                scanned_at: prevScannedAt,
              })
              setSessionValid((v) => Math.max(0, v - 1))
              if (soundEnabledRef.current) playBeep(false)
              hapticLevel('error')
              triggerFlash('error')
              toast.error(conflict.message)
              finalizeRecent(recentKey, {
                kind: 'error',
                name: 'Ticket no valido',
                subtitle: conflict.message,
              })
              return
            }
            // auth / forbidden — surface to the operator but don't touch
            // the local row (the scan might still succeed on retry).
            toast.error(conflict.message)
          },
          onQueued: () => {
            // Stayed offline: downgrade the recent row so the operator
            // sees this scan still needs server-side confirmation.
            finalizeRecent(recentKey, {
              kind: 'queued',
              name,
              subtitle: 'Sin red — se enviara al reconectar',
            })
          },
        })
        return
      }

      if (local.kind === 'duplicate') {
        const name = local.attendee.user_name || 'Sin nombre'
        const when = local.scannedAt ? ` a las ${formatTime(local.scannedAt)}` : ''
        const recentKey = addPending(qrCode, name, `Ya entro${when}`)
        triggerFlash('duplicate')
        if (soundEnabledRef.current) playBeep(false)
        hapticLevel('duplicate')
        finalizeRecent(recentKey, {
          kind: 'duplicate',
          name,
          subtitle: `Ya entro${when}`,
        })
        return
      }

      if (local.kind === 'cancelled') {
        const name = local.attendee.user_name || 'Ticket anulado'
        const recentKey = addPending(qrCode, name, 'Ticket cancelado')
        triggerFlash('error')
        if (soundEnabledRef.current) playBeep(false)
        hapticLevel('error')
        toast.error('Ticket cancelado — no dejar entrar')
        finalizeRecent(recentKey, {
          kind: 'error',
          name,
          subtitle: 'Ticket cancelado',
        })
        return
      }

      // Unknown QR: not in the local cache. This is rare (new tickets arrive
      // via realtime) but happens when a ticket was created server-side
      // after the scanner booted. Defer to the backend — still shows an
      // immediate pending flash so the operator knows we saw the scan.
      const recentKey = addPending(qrCode, 'Validando…', 'QR no reconocido localmente')
      triggerFlash('pending')
      hapticLevel('duplicate')
      syncScanInBackground({
        qr: qrCode,
        onConfirmed: (info) => {
          triggerFlash('success')
          if (soundEnabledRef.current) playBeep(true)
          hapticLevel('success')
          setSessionValid((v) => v + 1)
          finalizeRecent(recentKey, {
            kind: 'success',
            name: info.userName || 'Validado',
            subtitle: info.eventTitle || 'Entrada aceptada',
          })
          // Refresh to pick up the newly-known ticket for future scans.
          loadAttendeesRef.current()
        },
        onConflict: (conflict) => {
          if (conflict.reason === 'already_scanned') {
            triggerFlash('duplicate')
            if (soundEnabledRef.current) playBeep(false)
            hapticLevel('duplicate')
            const when = conflict.scannedAt
              ? ` a las ${formatTime(conflict.scannedAt)}`
              : ''
            finalizeRecent(recentKey, {
              kind: 'duplicate',
              name: conflict.userName || 'Ticket conocido',
              subtitle: `Ya entro${when}`,
            })
            return
          }
          triggerFlash('error')
          if (soundEnabledRef.current) playBeep(false)
          hapticLevel('error')
          toast.error(conflict.message)
          finalizeRecent(recentKey, {
            kind: 'error',
            name: 'QR no valido',
            subtitle: conflict.message,
          })
        },
        onQueued: () => {
          finalizeRecent(recentKey, {
            kind: 'queued',
            name: 'QR desconocido',
            subtitle: 'Sin red — pendiente de validar',
          })
        },
      })
    },
    [
      toast,
      patchAttendee,
      addPending,
      finalizeRecent,
      triggerFlash,
      attendeesByQrRef,
      eventNameMapRef,
      soundEnabledRef,
      loadAttendeesRef,
    ],
  )

  // Ref keeps processScan current across scanner callback lifetime
  const processScanRef = useRef(processScan)
  useEffect(() => {
    processScanRef.current = processScan
  }, [processScan])

  const startScanner = useCallback(async () => {
    if (!videoRef.current || scanning || engineRef.current) return
    setCameraError(null)
    setScanning(true)

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setScanning(false)
      setCameraError('Tu dispositivo no soporta el escaner de camara.')
      return
    }

    try {
      const handle = await startFastScanner({
        videoEl: videoRef.current,
        onDetect: (qr) => processScanRef.current(qr),
      })
      engineRef.current = handle

      // Torch capability check — BarcodeDetector hands us the stream
      // directly; ZXing exposes it via videoEl.srcObject. Either way,
      // `getTrack()` works once the first frame paints.
      try {
        const track = handle.getTrack()
        if (track) {
          const caps = track.getCapabilities?.() as
            | (MediaTrackCapabilities & { torch?: boolean })
            | undefined
          setTorchSupported(!!caps?.torch)
        }
      } catch {
        /* torch detection is best-effort */
      }
    } catch (err) {
      console.error('Scanner error:', err)
      setScanning(false)
      setCameraError(humanizeCameraError(err))
    }
  }, [scanning])

  const stopScanner = useCallback(async () => {
    const handle = engineRef.current
    engineRef.current = null
    if (handle) {
      try {
        await handle.stop()
      } catch {
        /* ignore — stop races with the decode loop */
      }
    }
    setTorchOn(false)
    setTorchSupported(false)
    setScanning(false)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setFlash('none')
  }, [])

  // Stop scanner on unmount
  useEffect(() => () => { stopScanner() }, [stopScanner])

  // ── Hero card: the most recent scan, shown prominently for HERO_MS ─────

  const hero = useMemo(() => {
    if (recent.length === 0) return null
    const r = recent[0]
    if (Date.now() - r.at > HERO_MS) return null
    return r
  }, [recent])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Camera + overlays.
          - Scanning: dark bg (the video feed needs translucent overlays
            that read well over arbitrary camera content).
          - Idle: light glass-strong strip — matches the rest of the
            light-theme UI and telegraphs "sensor standby". */}
      <div
        className={cn(
          'relative rounded-2xl overflow-hidden border transition-colors duration-300 shadow-soft',
          scanning ? 'bg-gray-900' : 'glass-strong',
          flash === 'success' && 'border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.30)]',
          flash === 'duplicate' && 'border-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]',
          flash === 'error' && 'border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.30)]',
          flash === 'pending' && 'border-blue-500/60',
          flash === 'none' && !scanning && 'border-gray-200',
          flash === 'none' && scanning && 'border-gray-800',
        )}
        style={scanning ? { minHeight: '320px' } : undefined}
      >
        {/* The <video> element is owned by us (not injected by a library) so
            the camera preview stays predictable across re-renders. The
            engine attaches the MediaStream; we just style the element. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn(
            'w-full h-full object-cover',
            scanning ? 'block' : 'hidden',
          )}
          style={scanning ? { minHeight: '320px' } : undefined}
        />

        {/* Radial pulse on scan — overlaid under the corners for a satisfying "hit" feel.
            Keyed by flash state so it restarts on every scan. */}
        {scanning && (flash === 'success' || flash === 'duplicate' || flash === 'error') && (
          <div
            key={`pulse-${flash}-${Date.now()}`}
            className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
          >
            <div
              className={cn(
                'absolute top-1/2 left-1/2 w-[180px] h-[180px] rounded-full',
                flash === 'success' && 'bg-emerald-400',
                flash === 'duplicate' && 'bg-amber-400',
                flash === 'error' && 'bg-red-500',
              )}
              style={{
                animation:
                  flash === 'success'
                    ? 'scan-pulse-success 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
                    : 'scan-pulse-error 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            />
          </div>
        )}

        {/* Viewfinder corners (visible when scanning).
            Chunkier strokes + breathing glow make the capture area feel
            deliberate. The scan-line sweep telegraphs "I'm actively watching"
            even when no flash is firing — good for operator confidence. */}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={cn(
                'relative w-[280px] h-[280px] transition-transform duration-200',
                flash === 'success' && 'scale-[1.02]',
                flash === 'error' && 'scale-[0.98]',
              )}
            >
              {/* Ambient scan line — pauses when a flash is active to avoid
                  visual noise on top of the pulse animation. */}
              {flash === 'none' && (
                <div
                  className="absolute left-1 right-1 top-1 h-px bg-gradient-to-r from-transparent via-blue-400/80 to-transparent pointer-events-none"
                  style={{
                    animation: 'scan-line-sweep 2.4s ease-in-out infinite',
                    boxShadow: '0 0 8px rgba(59,130,246,0.7)',
                  }}
                />
              )}
              <div
                className={cn(
                  'absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] rounded-tl transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] rounded-tr transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] rounded-bl transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] rounded-br transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
            </div>
          </div>
        )}

        {/* Idle state — compact horizontal strip en tema claro.
            Se colapsa a ~80px vs los 320px que forzaba la cámara, devolviendo
            espacio para el event picker + stats arriba y el log de scans abajo. */}
        {!scanning && (
          <div className="relative py-5 px-5 flex items-center gap-3 overflow-hidden">
            {/* Ambient radial gradient (azul muy sutil) */}
            <div
              className="absolute inset-0 opacity-60 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 30% 50%, rgba(59,130,246,0.10) 0%, transparent 65%)',
              }}
            />
            {/* Decorative scan line pulse — "sensor ready" */}
            <div
              className="absolute left-6 right-6 top-1/2 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent pointer-events-none"
              style={{ animation: 'glow-pulse 2.5s ease-in-out infinite' }}
            />
            <div className="relative w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <Camera className="w-5 h-5 text-blue-600" />
            </div>
            <div className="relative min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 leading-tight">
                Escáner listo
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Pulsa para abrir la cámara · QR · EAN · Code128
              </p>
            </div>
          </div>
        )}

        {/* Floating counter (session) — dark translucent pill sobre video */}
        {scanning && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-white shadow-soft">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] font-bold text-gray-900 tabular-nums">{sessionValid}</span>
            <span className="text-[10px] text-gray-500">validados</span>
            {velocity > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-[11px] font-bold text-blue-600 tabular-nums">{velocity}</span>
                <span className="text-[10px] text-gray-500">/min</span>
              </>
            )}
          </div>
        )}

        {/* Online/offline indicator */}
        {scanning && (
          <div
            className={cn(
              'absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-sm border text-[10px] font-semibold shadow-soft',
              online
                ? 'bg-white/90 border-white text-gray-600'
                : 'bg-amber-100 border-amber-200 text-amber-700',
            )}
          >
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? 'En linea' : 'Offline'}
          </div>
        )}

        {/* Torch / flashlight button — only rendered if camera supports it.
            Placed bottom-right over the viewfinder where the thumb naturally rests. */}
        {scanning && torchSupported && (
          <button
            onClick={toggleTorch}
            aria-pressed={torchOn}
            aria-label={torchOn ? 'Apagar linterna' : 'Encender linterna'}
            className={cn(
              'absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all active:scale-95 shadow-soft',
              torchOn
                ? 'bg-amber-400 border-amber-300 text-amber-950 shadow-[0_0_20px_rgba(251,191,36,0.7)]'
                : 'bg-white/90 border-white text-gray-700',
            )}
          >
            {torchOn ? (
              <Flashlight className="w-5 h-5" />
            ) : (
              <FlashlightOff className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Hero card overlay — prominent feedback over the bottom of the camera */}
        {scanning && hero && (
          <HeroCard scan={hero} />
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!scanning ? (
          <button
            onClick={startScanner}
            className="relative flex-1 py-4 rounded-xl text-sm font-bold text-white overflow-hidden
                       bg-gradient-to-br from-blue-600 to-indigo-600
                       shadow-[0_6px_20px_rgba(59,130,246,0.35)]
                       hover:shadow-[0_8px_28px_rgba(59,130,246,0.45)]
                       active:scale-[0.98] transition-all duration-200
                       flex items-center justify-center gap-2"
          >
            {/* Subtle shimmer on top */}
            <span
              className="absolute inset-x-0 top-0 h-1/2 opacity-40 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
              }}
            />
            <Camera className="w-5 h-5 relative" />
            <span className="relative tracking-wide">Iniciar escaner</span>
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="flex-1 py-4 rounded-xl text-sm font-semibold text-gray-700
                       bg-white border border-gray-200 shadow-soft
                       hover:bg-gray-50 active:scale-[0.98] transition-all duration-200"
          >
            Detener escaner
          </button>
        )}
        <button
          onClick={() => setSoundEnabled((s) => !s)}
          className={cn(
            'w-12 h-auto flex items-center justify-center rounded-xl border transition-all active:scale-95 shadow-soft',
            soundEnabled
              ? 'border-blue-200 bg-blue-50 text-blue-600'
              : 'border-gray-200 bg-white text-gray-400',
          )}
          aria-label={soundEnabled ? 'Silenciar' : 'Activar sonido'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* Recent scans log */}
      {recent.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Ultimos escaneos
            </p>
            <button
              onClick={() => setRecent([])}
              className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar
            </button>
          </div>
          <div className="space-y-1.5">
            {recent.map((r) => (
              <RecentRow key={r.key} scan={r} />
            ))}
          </div>
        </div>
      )}

      {/* Camera error banner */}
      {cameraError && (
        <div className="glass-strong rounded-2xl shadow-soft p-4 border-red-200 bg-red-50/70">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-700">Camara no disponible</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">{cameraError}</p>
              <p className="text-[11px] text-gray-500 mt-2">
                Mientras tanto puedes validar entradas a mano en la pestana{' '}
                <span className="text-gray-700 font-medium">Lista</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hero card ──────────────────────────────────────────────────────────────
// Se muestra sobre el feed de cámara → fondo translúcido oscuro para legibilidad
// sobre cualquier contenido de vídeo. No seguimos el tema claro aquí a propósito.

function HeroCard({ scan }: { scan: RecentScan }) {
  const style = STYLE_BY_KIND[scan.kind]
  const Icon = style.icon
  return (
    <div
      className={cn(
        'absolute left-3 right-3 bottom-3 p-3 rounded-xl border backdrop-blur-xl flex items-center gap-3 transition-all shadow-elevated',
        style.heroBg,
        style.heroBorder,
      )}
      style={{ animation: 'slideUp 0.18s ease-out' }}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
          style.heroIconBg,
        )}
      >
        {scan.kind === 'pending' ? (
          <Loader2 className={cn('w-5 h-5 animate-spin', style.heroIconColor)} />
        ) : (
          <Icon className={cn('w-6 h-6', style.heroIconColor)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-white truncate leading-tight">
          {scan.name}
        </p>
        <p className="text-[11px] text-white/75 truncate">{scan.subtitle}</p>
      </div>
    </div>
  )
}

// ── Recent row ─────────────────────────────────────────────────────────────

function RecentRow({ scan }: { scan: RecentScan }) {
  const style = STYLE_BY_KIND[scan.kind]
  const Icon = style.icon
  return (
    <div
      className={cn(
        'glass-strong rounded-xl shadow-soft p-2.5 flex items-center gap-2.5 transition-colors',
        style.border,
      )}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          style.iconBg,
        )}
      >
        {scan.kind === 'pending' ? (
          <Loader2 className={cn('w-3.5 h-3.5 animate-spin', style.iconColor)} />
        ) : (
          <Icon className={cn('w-3.5 h-3.5', style.iconColor)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-900 truncate">{scan.name}</p>
        <p className="text-[10px] text-gray-500 truncate">{scan.subtitle}</p>
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />
        {new Date(scan.at).toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  )
}

// ── Style map ─────────────────────────────────────────────────────────────

function flashCorner(flash: 'none' | 'pending' | 'success' | 'duplicate' | 'error'): string {
  if (flash === 'success') return 'border-emerald-400'
  if (flash === 'duplicate') return 'border-amber-400'
  if (flash === 'error') return 'border-red-400'
  if (flash === 'pending') return 'border-blue-400'
  return 'border-blue-400'
}

const STYLE_BY_KIND: Record<
  ScanKind,
  {
    icon: typeof CheckCircle2
    // Recent-row styling (light theme, sobre glass-strong)
    iconColor: string
    iconBg: string
    border: string
    // Hero overlay styling (sobre video de cámara — se queda oscuro)
    heroBg: string
    heroBorder: string
    heroIconColor: string
    heroIconBg: string
  }
> = {
  pending: {
    icon: Loader2,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    border: 'border-blue-200',
    heroBg: 'bg-black/75',
    heroBorder: 'border-blue-400/50',
    heroIconColor: 'text-blue-300',
    heroIconBg: 'bg-blue-500/25',
  },
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
    border: 'border-emerald-200',
    heroBg: 'bg-emerald-900/85',
    heroBorder: 'border-emerald-400/70',
    heroIconColor: 'text-emerald-300',
    heroIconBg: 'bg-emerald-500/25',
  },
  duplicate: {
    icon: Clock,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    border: 'border-amber-200',
    heroBg: 'bg-amber-900/85',
    heroBorder: 'border-amber-400/70',
    heroIconColor: 'text-amber-300',
    heroIconBg: 'bg-amber-500/25',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    border: 'border-red-200',
    heroBg: 'bg-red-900/85',
    heroBorder: 'border-red-400/70',
    heroIconColor: 'text-red-300',
    heroIconBg: 'bg-red-500/25',
  },
  queued: {
    icon: CloudUpload,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-100',
    border: 'border-amber-200',
    heroBg: 'bg-amber-900/85',
    heroBorder: 'border-amber-400/70',
    heroIconColor: 'text-amber-300',
    heroIconBg: 'bg-amber-500/25',
  },
}
