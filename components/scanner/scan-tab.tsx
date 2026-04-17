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
import { supabase } from '@/lib/supabase'
import { useScanner } from './scanner-provider'
import { playBeep, hapticLevel, formatTime } from './scanner-utils'
import type { ScanResult } from './scanner-types'
import { useToast } from '@/components/ui/toast'
import { useOnlineStatus } from '@/lib/hooks/use-online-status'
import * as outbox from '@/lib/scanner-outbox'

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
    attendeesRef,
    eventNameMapRef,
    soundEnabledRef,
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
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)
  const processedQRs = useRef<Set<string>>(new Set())
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)

  const toggleTorch = useCallback(async () => {
    const track = videoTrackRef.current
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

  const processScan = useCallback(
    async (qrCode: string) => {
      const localMatch = attendeesRef.current.find((a) => a.qr_code === qrCode)
      const displayName = localMatch?.user_name || 'Procesando...'
      const displayEvent =
        (localMatch && eventNameMapRef.current[localMatch.event_id]) || ''

      // ── Instant optimistic feedback (< 20ms) ────────────────────────────
      const recentKey = addPending(qrCode, displayName, displayEvent || 'Validando...')
      triggerFlash('pending')
      hapticLevel('duplicate') // light haptic on detection — confirms QR was seen

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          triggerFlash('error')
          if (soundEnabledRef.current) playBeep(false)
          hapticLevel('error')
          toast.error('Sesion expirada — vuelve a iniciar sesion')
          finalizeRecent(recentKey, { kind: 'error', name: 'Sesion expirada', subtitle: '' })
          return
        }

        if (!online) {
          await outbox.enqueue({
            kind: 'scan',
            endpoint: '/api/scanner/scan',
            payload: { ticket_qr: qrCode },
            label: displayName,
          })
          if (localMatch) {
            patchAttendee({
              id: localMatch.id,
              status: 'used',
              scanned_at: new Date().toISOString(),
            })
          }
          triggerFlash('success')
          if (soundEnabledRef.current) playBeep(true)
          hapticLevel('success')
          setSessionValid((v) => v + 1)
          finalizeRecent(recentKey, {
            kind: 'queued',
            name: displayName,
            subtitle: displayEvent || 'Offline · se enviara luego',
          })
          return
        }

        const res = await fetch('/api/scanner/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ticket_qr: qrCode }),
        })

        let result: ScanResult
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          result = { success: false, error: errBody.error || `HTTP ${res.status}` }
        } else {
          result = await res.json()
        }

        // Enrich duplicate scan with local data for nicer feedback
        if (!result.success && result.error?.includes('escaneado') && localMatch) {
          result.user_name = localMatch.user_name || undefined
          result.event_title = eventNameMapRef.current[localMatch.event_id]
          result.scanned_at = localMatch.scanned_at || undefined
        }

        if (result.success) {
          triggerFlash('success')
          if (soundEnabledRef.current) playBeep(true)
          hapticLevel('success')
          setSessionValid((v) => v + 1)
          const name = result.user_name || displayName
          finalizeRecent(recentKey, {
            kind: 'success',
            name,
            subtitle: result.event_title || displayEvent || 'Validado',
          })
          // Patch local state so UI updates before realtime arrives
          if (localMatch) {
            patchAttendee({
              id: localMatch.id,
              status: 'used',
              scanned_at: new Date().toISOString(),
            })
          }
        } else if (result.error?.includes('escaneado')) {
          // Duplicate — softer feedback
          triggerFlash('duplicate')
          if (soundEnabledRef.current) playBeep(false)
          hapticLevel('duplicate')
          const name = result.user_name || displayName
          const when = result.scanned_at ? ` a las ${formatTime(result.scanned_at)}` : ''
          finalizeRecent(recentKey, {
            kind: 'duplicate',
            name,
            subtitle: `Ya entro${when}`,
          })
        } else {
          triggerFlash('error')
          if (soundEnabledRef.current) playBeep(false)
          hapticLevel('error')
          toast.error(result.error || 'Error al validar')
          finalizeRecent(recentKey, {
            kind: 'error',
            name: 'Error',
            subtitle: result.error || '',
          })
        }
      } catch {
        // Network error mid-request — queue for later
        if (soundEnabledRef.current) playBeep(true)
        hapticLevel('success')
        triggerFlash('success')
        await outbox.enqueue({
          kind: 'scan',
          endpoint: '/api/scanner/scan',
          payload: { ticket_qr: qrCode },
          label: displayName,
        })
        if (localMatch) {
          patchAttendee({
            id: localMatch.id,
            status: 'used',
            scanned_at: new Date().toISOString(),
          })
        }
        setSessionValid((v) => v + 1)
        finalizeRecent(recentKey, {
          kind: 'queued',
          name: displayName,
          subtitle: 'Sin red — encolado',
        })
      }
    },
    [
      online,
      toast,
      patchAttendee,
      addPending,
      finalizeRecent,
      triggerFlash,
      attendeesRef,
      eventNameMapRef,
      soundEnabledRef,
    ],
  )

  // Ref keeps processScan current across scanner callback lifetime
  const processScanRef = useRef(processScan)
  useEffect(() => {
    processScanRef.current = processScan
  }, [processScan])

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || scanning) return
    setCameraError(null)
    setScanning(true)
    processedQRs.current.clear()

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setScanning(false)
      setCameraError('Tu dispositivo no soporta el escaner de camara.')
      return
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        // fps 20 (was 10): faster detection of fast-swiped QRs
        // qrbox slightly larger: more forgiving aim
        { fps: 20, qrbox: { width: 280, height: 280 } },
        async (decodedText) => {
          // Skip only if this same QR was just processed — different QRs go
          // through concurrently to keep the line moving.
          if (processedQRs.current.has(decodedText)) return
          processedQRs.current.add(decodedText)
          // Allow re-scan of same QR after 10s
          setTimeout(() => processedQRs.current.delete(decodedText), 10_000)
          processScanRef.current(decodedText)
        },
        () => {},
      )

      // Detect torch capability on the active video track (crucial for dark venues)
      // html5-qrcode mounts a <video> inside #qr-reader; we read the stream from there
      try {
        const videoEl = document.querySelector<HTMLVideoElement>('#qr-reader video')
        const stream = videoEl?.srcObject as MediaStream | null
        const track = stream?.getVideoTracks()?.[0] || null
        if (track) {
          videoTrackRef.current = track
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
      const raw = err instanceof Error ? err.message : String(err ?? '')
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || /denied|permiso|permission/i.test(raw)) {
        setCameraError('Permite el acceso a la camara en Ajustes > Project X para usar el escaner.')
      } else if (name === 'NotFoundError' || /no camera|device not found/i.test(raw)) {
        setCameraError('No se detecto ninguna camara en este dispositivo.')
      } else if (name === 'NotReadableError' || /in use|hardware/i.test(raw)) {
        setCameraError('La camara esta siendo usada por otra aplicacion. Cierrala e intentalo de nuevo.')
      } else {
        setCameraError('No se pudo iniciar el escaner. Cierra y vuelve a abrir la app, o revisa los permisos de camara.')
      }
    }
  }, [scanning])

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await (html5QrRef.current as { stop: () => Promise<void> }).stop()
      } catch {
        /* */
      }
      html5QrRef.current = null
    }
    videoTrackRef.current = null
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
      {/* Camera + overlays */}
      <div
        ref={scannerRef}
        className={cn(
          'relative rounded-2xl overflow-hidden bg-black-card border transition-colors duration-300',
          flash === 'success' && 'border-emerald-400/70 shadow-[0_0_0_3px_rgba(52,211,153,0.35)]',
          flash === 'duplicate' && 'border-amber-400/70 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]',
          flash === 'error' && 'border-red-400/70 shadow-[0_0_0_3px_rgba(248,113,113,0.3)]',
          flash === 'pending' && 'border-primary/60',
          flash === 'none' && 'border-black-border',
        )}
        style={{ minHeight: '320px' }}
      >
        <div id="qr-reader" className="w-full" />

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

        {/* Viewfinder corners (visible when scanning) */}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={cn(
                'relative w-[280px] h-[280px] transition-transform duration-200',
                flash === 'success' && 'scale-[1.02]',
                flash === 'error' && 'scale-[0.98]',
              )}
            >
              <div
                className={cn(
                  'absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 rounded-tl transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 rounded-tr transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 rounded-bl transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
              <div
                className={cn(
                  'absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 rounded-br transition-colors duration-200',
                  flashCorner(flash),
                )}
              />
            </div>
          </div>
        )}

        {/* Idle state */}
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Camera className="w-12 h-12 text-white-muted mb-3" />
            <p className="text-white-muted text-sm">Pulsa para escanear</p>
          </div>
        )}

        {/* Floating counter (session) */}
        {scanning && (
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-bold text-white tabular-nums">{sessionValid}</span>
            <span className="text-[10px] text-white/40">validados</span>
            {velocity > 0 && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-[11px] font-bold text-primary tabular-nums">{velocity}</span>
                <span className="text-[10px] text-white/40">/min</span>
              </>
            )}
          </div>
        )}

        {/* Online/offline indicator */}
        {scanning && (
          <div
            className={cn(
              'absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-sm border text-[10px] font-medium',
              online
                ? 'bg-black/60 border-white/10 text-white/50'
                : 'bg-amber-500/20 border-amber-500/30 text-amber-300',
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
              'absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all active:scale-95',
              torchOn
                ? 'bg-amber-400 border-amber-300 text-black shadow-[0_0_20px_rgba(251,191,36,0.6)]'
                : 'bg-black/60 border-white/15 text-white/70',
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
          <button onClick={startScanner} className="btn-primary flex-1 py-3.5 text-sm font-semibold">
            <Camera className="w-5 h-5" />
            Iniciar escaner
          </button>
        ) : (
          <button onClick={stopScanner} className="btn-ghost flex-1 py-3">
            Detener escaner
          </button>
        )}
        <button
          onClick={() => setSoundEnabled((s) => !s)}
          className={cn(
            'w-12 flex items-center justify-center rounded-xl border transition-all',
            soundEnabled
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-black-border bg-white/5 text-white-muted',
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
            <p className="text-[10px] uppercase tracking-wider text-white/30 font-medium">
              Ultimos escaneos
            </p>
            <button
              onClick={() => setRecent([])}
              className="text-[10px] text-white/30 hover:text-white/50 transition-colors"
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
        <div className="card p-4 border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-400">Camara no disponible</p>
              <p className="text-xs text-white-muted mt-1 leading-relaxed">{cameraError}</p>
              <p className="text-[11px] text-white/30 mt-2">
                Mientras tanto puedes validar entradas a mano en la pestana{' '}
                <span className="text-white-muted">Lista</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hero card ──────────────────────────────────────────────────────────────

function HeroCard({ scan }: { scan: RecentScan }) {
  const style = STYLE_BY_KIND[scan.kind]
  const Icon = style.icon
  return (
    <div
      className={cn(
        'absolute left-3 right-3 bottom-3 p-3 rounded-xl border backdrop-blur-xl flex items-center gap-3 transition-all',
        style.heroBg,
        style.heroBorder,
      )}
      style={{ animation: 'slideUp 0.18s ease-out' }}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
          style.iconBg,
        )}
      >
        {scan.kind === 'pending' ? (
          <Loader2 className={cn('w-5 h-5 animate-spin', style.iconColor)} />
        ) : (
          <Icon className={cn('w-6 h-6', style.iconColor)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-white truncate leading-tight">
          {scan.name}
        </p>
        <p className="text-[11px] text-white/70 truncate">{scan.subtitle}</p>
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
        'card p-2.5 flex items-center gap-2.5 transition-colors',
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
        <p className="text-xs font-medium text-white truncate">{scan.name}</p>
        <p className="text-[10px] text-white/40 truncate">{scan.subtitle}</p>
      </div>
      <span className="text-[10px] text-white/30 tabular-nums flex items-center gap-1">
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
  if (flash === 'pending') return 'border-primary'
  return 'border-primary'
}

const STYLE_BY_KIND: Record<
  ScanKind,
  {
    icon: typeof CheckCircle2
    iconColor: string
    iconBg: string
    border: string
    heroBg: string
    heroBorder: string
  }
> = {
  pending: {
    icon: Loader2,
    iconColor: 'text-primary',
    iconBg: 'bg-primary/15',
    border: 'border-primary/20',
    heroBg: 'bg-black/70',
    heroBorder: 'border-primary/40',
  },
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
    border: 'border-emerald-500/25',
    heroBg: 'bg-emerald-900/70',
    heroBorder: 'border-emerald-400/60',
  },
  duplicate: {
    icon: Clock,
    iconColor: 'text-amber-300',
    iconBg: 'bg-amber-500/20',
    border: 'border-amber-500/25',
    heroBg: 'bg-amber-900/70',
    heroBorder: 'border-amber-400/50',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-300',
    iconBg: 'bg-red-500/20',
    border: 'border-red-500/25',
    heroBg: 'bg-red-900/70',
    heroBorder: 'border-red-400/60',
  },
  queued: {
    icon: CloudUpload,
    iconColor: 'text-amber-300',
    iconBg: 'bg-amber-500/20',
    border: 'border-amber-500/25',
    heroBg: 'bg-amber-900/70',
    heroBorder: 'border-amber-400/50',
  },
}
