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

// Keep a generous scroll-back of scanned attendees so the operator can check
// who has already entered during a long session. Old requirement was 5 which
// erased the history the moment you scanned a 6th ticket.
const RECENT_LIMIT = 30
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
      // O(1) lookup — the provider keeps a QR→attendee Map in sync.
      const localMatch = attendeesByQrRef.current.get(qrCode)
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
      attendeesByQrRef,
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

  // Prefetch html5-qrcode so the first click → camera feed is instant.
  // Without this, the dynamic import runs on click and the operator waits
  // ~100-300ms before the viewfinder appears.
  useEffect(() => {
    void import('html5-qrcode').catch(() => { /* best-effort */ })
  }, [])

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
      {/* Camera feed — siempre montado en el DOM (el `#qr-reader` es el mount
          point de html5-qrcode), pero se colapsa a 0px cuando está idle para
          que el CTA de abajo sea la única superficie visible. Esto elimina la
          duplicación visual "Escáner listo" + "Iniciar escaner" del diseño
          original, y conserva la ref estable para arrancar la librería. */}
      <div
        ref={scannerRef}
        className={cn(
          'relative rounded-2xl overflow-hidden border transition-all duration-300 shadow-elevated',
          scanning ? 'bg-black' : 'h-0 border-transparent shadow-none',
          scanning && flash === 'success' && 'border-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.30)]',
          scanning && flash === 'duplicate' && 'border-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]',
          scanning && flash === 'error' && 'border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.30)]',
          scanning && flash === 'pending' && 'border-primary/60',
          scanning && flash === 'none' && 'border-white/[0.08]',
        )}
        style={scanning ? { minHeight: '320px' } : undefined}
        aria-hidden={!scanning}
      >
        <div id="qr-reader" className="w-full" />

        {scanning && (<>
          {/* Radial pulse on scan — overlaid under the corners for a satisfying "hit" feel.
              Keyed by flash state so it restarts on every scan. */}
          {(flash === 'success' || flash === 'duplicate' || flash === 'error') && (
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

          {/* Viewfinder corners.
              Chunkier strokes + breathing glow make the capture area feel
              deliberate. The scan-line sweep telegraphs "I'm actively watching"
              even when no flash is firing — good for operator confidence. */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className={cn(
                'relative w-[280px] h-[280px] transition-transform duration-200',
                flash === 'success' && 'scale-[1.02]',
                flash === 'error' && 'scale-[0.98]',
              )}
            >
              {/* Ambient scan line — pauses when a flash is active to avoid
                  visual noise on top of the pulse animation. Usa el rojo
                  primary para alinearse con la identidad de la app. */}
              {flash === 'none' && (
                <div
                  className="absolute left-1 right-1 top-1 h-px bg-gradient-to-r from-transparent via-primary-light/85 to-transparent pointer-events-none"
                  style={{
                    animation: 'scan-line-sweep 2.4s ease-in-out infinite',
                    boxShadow: '0 0 10px rgba(228,30,43,0.7)',
                  }}
                />
              )}
              <div className={cn('absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] rounded-tl transition-colors duration-200', flashCorner(flash))} />
              <div className={cn('absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] rounded-tr transition-colors duration-200', flashCorner(flash))} />
              <div className={cn('absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] rounded-bl transition-colors duration-200', flashCorner(flash))} />
              <div className={cn('absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] rounded-br transition-colors duration-200', flashCorner(flash))} />
            </div>
          </div>

          {/* Floating counter (session) — dark translucent pill sobre video */}
          <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/15 shadow-soft">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-bold text-white tabular-nums">{sessionValid}</span>
            <span className="text-[10px] text-white/60">validados</span>
            {velocity > 0 && (
              <>
                <span className="text-white/30">·</span>
                <span className="text-[11px] font-bold text-sky-300 tabular-nums">{velocity}</span>
                <span className="text-[10px] text-white/60">/min</span>
              </>
            )}
          </div>

          {/* Online/offline indicator */}
          <div
            className={cn(
              'absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-md border text-[10px] font-semibold shadow-soft',
              online
                ? 'bg-black/70 border-white/15 text-white/80'
                : 'bg-amber-500/20 border-amber-400/40 text-amber-200',
            )}
          >
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {online ? 'En linea' : 'Offline'}
          </div>

          {/* Torch / flashlight button — only rendered if camera supports it.
              Placed bottom-right over the viewfinder where the thumb naturally rests. */}
          {torchSupported && (
            <button
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label={torchOn ? 'Apagar linterna' : 'Encender linterna'}
              className={cn(
                'absolute bottom-3 right-3 w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-all active:scale-95 shadow-soft',
                torchOn
                  ? 'bg-amber-400 border-amber-300 text-amber-950 shadow-[0_0_20px_rgba(251,191,36,0.7)]'
                  : 'bg-black/70 border-white/15 text-white/80',
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
          {hero && <HeroCard scan={hero} />}
        </>)}
      </div>

      {/* Controls — CTA único, sin estado intermedio. En idle: botón grande
          "Iniciar escaner" + mute toggle. En scanning: "Detener" + mute. */}
      <div className="flex gap-2">
        {!scanning ? (
          <button
            onClick={startScanner}
            className="relative flex-1 py-5 rounded-2xl text-sm font-bold text-white overflow-hidden
                       bg-gradient-to-br from-primary-light via-primary to-primary-dark
                       shadow-[0_6px_24px_rgba(228,30,43,0.35)]
                       hover:shadow-[0_10px_32px_rgba(228,30,43,0.50)]
                       active:scale-[0.98] transition-all duration-200
                       flex items-center justify-center gap-2.5"
          >
            {/* Subtle top sheen */}
            <span
              className="absolute inset-x-0 top-0 h-1/2 opacity-35 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, transparent 100%)',
              }}
            />
            <Camera className="w-5 h-5 relative" />
            <span className="relative tracking-wide text-[15px]">Iniciar escáner</span>
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold text-white/85
                       bg-white/[0.04] border border-white/10 shadow-soft
                       hover:bg-white/[0.07] hover:text-white active:scale-[0.98] transition-all duration-200"
          >
            Detener escaner
          </button>
        )}
        <button
          onClick={() => setSoundEnabled((s) => !s)}
          className={cn(
            'w-14 flex items-center justify-center rounded-2xl border transition-all active:scale-95 shadow-soft',
            soundEnabled
              ? 'border-primary/35 bg-primary/15 text-primary-light'
              : 'border-white/10 bg-white/[0.04] text-white/45',
          )}
          aria-label={soundEnabled ? 'Silenciar' : 'Activar sonido'}
          title={soundEnabled ? 'Sonido activado — toca para silenciar' : 'Sonido silenciado — toca para activar'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      {/* Hint strip cuando está idle — una línea de texto sutil en lugar de
          una tarjeta duplicada con el mismo mensaje del botón. */}
      {!scanning && !cameraError && recent.length === 0 && (
        <p className="text-[11px] text-white/40 text-center px-6">
          Pulsa para abrir la cámara. Admite QR, EAN y Code128.
        </p>
      )}

      {/* Recent scans log — keeps up to RECENT_LIMIT in-session so the
          operator can scroll back through who has already entered. Scrollable
          panel with a fixed max height so the page doesn't grow unbounded. */}
      {recent.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">
              Historial{' '}
              <span className="text-white/70 tabular-nums">({recent.length})</span>
            </p>
            <button
              onClick={() => setRecent([])}
              className="text-[10px] text-white/45 hover:text-white/80 transition-colors"
            >
              Limpiar
            </button>
          </div>
          <div className="space-y-1.5 max-h-[340px] overflow-y-auto overflow-x-hidden -mx-1 px-1 scrollbar-thin">
            {recent.map((r) => (
              <RecentRow key={r.key} scan={r} />
            ))}
          </div>
        </div>
      )}

      {/* Camera error banner */}
      {cameraError && (
        <div className="rounded-2xl shadow-soft p-4 border border-red-500/30 bg-red-500/10 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-300">Cámara no disponible</p>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">{cameraError}</p>
              <p className="text-[11px] text-white/50 mt-2">
                Mientras tanto puedes validar entradas a mano en la pestaña{' '}
                <span className="text-white/85 font-medium">Lista</span>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Hero card ──────────────────────────────────────────────────────────────
// Se muestra sobre el feed de cámara → fondo translúcido de color intenso
// para legibilidad sobre cualquier contenido de vídeo.

function HeroCard({ scan }: { scan: RecentScan }) {
  const style = STYLE_BY_KIND[scan.kind]
  const Icon = style.icon
  // Big, bold, unmissable: operator on a busy door glances at phone and
  // reads the name from across a table without squinting. The icon is
  // oversized so peripheral vision catches the color code (green/amber/red)
  // before the eyes focus on the text.
  return (
    <div
      className={cn(
        'absolute left-2 right-2 bottom-2 p-4 rounded-2xl border-2 backdrop-blur-xl flex items-center gap-4 shadow-[0_10px_40px_rgba(0,0,0,0.55)]',
        style.heroBg,
        style.heroBorder,
      )}
      style={{ animation: 'slideUp 0.14s ease-out' }}
      data-testid="scan-hero"
    >
      <div
        className={cn(
          'w-[72px] h-[72px] rounded-full flex items-center justify-center flex-shrink-0',
          style.heroIconBg,
        )}
      >
        {scan.kind === 'pending' ? (
          <Loader2 className={cn('w-9 h-9 animate-spin', style.heroIconColor)} />
        ) : (
          <Icon className={cn('w-10 h-10', style.heroIconColor)} strokeWidth={2.5} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-2xl font-black text-white leading-[1.05] tracking-tight line-clamp-2"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}
        >
          {scan.name}
        </p>
        <p className="text-sm text-white/85 truncate mt-1 font-medium">
          {scan.subtitle}
        </p>
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
        'glass-strong rounded-xl shadow-soft p-2.5 flex items-center gap-2.5 transition-colors border',
        style.rowBorder,
      )}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          style.rowIconBg,
        )}
      >
        {scan.kind === 'pending' ? (
          <Loader2 className={cn('w-3.5 h-3.5 animate-spin', style.rowIconColor)} />
        ) : (
          <Icon className={cn('w-3.5 h-3.5', style.rowIconColor)} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-white truncate">{scan.name}</p>
        <p className="text-[10px] text-white/55 truncate">{scan.subtitle}</p>
      </div>
      <span className="text-[10px] text-white/40 tabular-nums flex items-center gap-1">
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
  if (flash === 'pending') return 'border-primary-light'
  return 'border-primary-light'
}

const STYLE_BY_KIND: Record<
  ScanKind,
  {
    icon: typeof CheckCircle2
    // Recent-row styling (dark glass-strong)
    rowIconColor: string
    rowIconBg: string
    rowBorder: string
    // Hero overlay styling (sobre video de cámara — fondos saturados de color)
    heroBg: string
    heroBorder: string
    heroIconColor: string
    heroIconBg: string
  }
> = {
  pending: {
    icon: Loader2,
    rowIconColor: 'text-sky-400',
    rowIconBg: 'bg-sky-500/15',
    rowBorder: 'border-sky-500/25',
    heroBg: 'bg-black/75',
    heroBorder: 'border-sky-400/50',
    heroIconColor: 'text-sky-300',
    heroIconBg: 'bg-sky-500/25',
  },
  success: {
    icon: CheckCircle2,
    rowIconColor: 'text-emerald-400',
    rowIconBg: 'bg-emerald-500/15',
    rowBorder: 'border-emerald-500/25',
    heroBg: 'bg-emerald-900/85',
    heroBorder: 'border-emerald-400/70',
    heroIconColor: 'text-emerald-300',
    heroIconBg: 'bg-emerald-500/25',
  },
  duplicate: {
    icon: Clock,
    rowIconColor: 'text-amber-400',
    rowIconBg: 'bg-amber-500/15',
    rowBorder: 'border-amber-500/25',
    heroBg: 'bg-amber-900/85',
    heroBorder: 'border-amber-400/70',
    heroIconColor: 'text-amber-300',
    heroIconBg: 'bg-amber-500/25',
  },
  error: {
    icon: XCircle,
    rowIconColor: 'text-red-400',
    rowIconBg: 'bg-red-500/15',
    rowBorder: 'border-red-500/25',
    heroBg: 'bg-red-900/85',
    heroBorder: 'border-red-400/70',
    heroIconColor: 'text-red-300',
    heroIconBg: 'bg-red-500/25',
  },
  queued: {
    icon: CloudUpload,
    rowIconColor: 'text-amber-400',
    rowIconBg: 'bg-amber-500/15',
    rowBorder: 'border-amber-500/25',
    heroBg: 'bg-amber-900/85',
    heroBorder: 'border-amber-400/70',
    heroIconColor: 'text-amber-300',
    heroIconBg: 'bg-amber-500/25',
  },
}
