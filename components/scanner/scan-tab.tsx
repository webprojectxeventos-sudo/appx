'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Camera,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useScanner } from './scanner-provider'
import { playBeep, haptic, formatTime } from './scanner-utils'
import type { ScanResult } from './scanner-types'

export function ScanTab() {
  const {
    loadAttendees,
    soundEnabled,
    setSoundEnabled,
    attendeesRef,
    eventNameMapRef,
    soundEnabledRef,
    loadAttendeesRef,
  } = useScanner()

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // Refs
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)
  const processedQRs = useRef<Set<string>>(new Set())
  const processingRef = useRef(false)
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Scan logic ────────────────────────────────────────────────────────────

  const processScan = useCallback(async (qrCode: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setScanResult({ success: false, error: 'Sesion expirada' })
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

      // Enrich duplicate scan with local data
      if (!result.success && result.error?.includes('escaneado')) {
        const att = attendeesRef.current.find((a) => a.qr_code === qrCode)
        if (att) {
          result.user_name = att.user_name || undefined
          result.event_title = eventNameMapRef.current[att.event_id]
          result.scanned_at = att.scanned_at || undefined
        }
      }

      if (soundEnabledRef.current) playBeep(result.success)
      haptic(result.success)

      setScanResult(result)
      if (result.success) loadAttendeesRef.current()

      // Auto-dismiss overlay (continuous mode)
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
      resultTimeoutRef.current = setTimeout(() => {
        setScanResult(null)
        processingRef.current = false
      }, 2500)
    } catch {
      if (soundEnabledRef.current) playBeep(false)
      haptic(false)
      setScanResult({ success: false, error: 'Error de conexion' })
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
      resultTimeoutRef.current = setTimeout(() => {
        setScanResult(null)
        processingRef.current = false
      }, 2500)
    }
  }, [attendeesRef, eventNameMapRef, soundEnabledRef, loadAttendeesRef])

  // Keep ref for scanner callback
  const processScanRef = useRef(processScan)
  useEffect(() => {
    processScanRef.current = processScan
  }, [processScan])

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || scanning) return
    setScanResult(null)
    setCameraError(null)
    setScanning(true)
    processedQRs.current.clear()
    processingRef.current = false

    // Guard: browsers / webviews that don't expose getUserMedia
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
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processedQRs.current.has(decodedText)) return
          if (processingRef.current) return
          processingRef.current = true
          processedQRs.current.add(decodedText)
          processScanRef.current(decodedText)
          // Allow re-scan of same QR after 10s
          setTimeout(() => processedQRs.current.delete(decodedText), 10_000)
        },
        () => {},
      )
    } catch (err) {
      console.error('Scanner error:', err)
      setScanning(false)
      const raw = err instanceof Error ? err.message : String(err ?? '')
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || /denied|permiso|permission/i.test(raw)) {
        setCameraError(
          'Permite el acceso a la camara en Ajustes > Project X para usar el escaner.',
        )
      } else if (name === 'NotFoundError' || /no camera|device not found/i.test(raw)) {
        setCameraError('No se detecto ninguna camara en este dispositivo.')
      } else if (name === 'NotReadableError' || /in use|hardware/i.test(raw)) {
        setCameraError(
          'La camara esta siendo usada por otra aplicacion. Cierrala e intentalo de nuevo.',
        )
      } else {
        setCameraError(
          'No se pudo iniciar el escaner. Cierra y vuelve a abrir la app, o revisa los permisos de camara.',
        )
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
    setScanning(false)
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
  }, [])

  // Stop scanner on unmount
  useEffect(() => () => { stopScanner() }, [stopScanner])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Camera + overlay */}
      <div
        ref={scannerRef}
        className="relative rounded-2xl overflow-hidden bg-black-card border border-black-border"
        style={{ minHeight: '300px' }}
      >
        <div id="qr-reader" className="w-full" />

        {/* Viewfinder corners (visible when scanning) */}
        {scanning && !scanResult && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-[250px] h-[250px]">
              {/* Top-left */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl" />
              {/* Top-right */}
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr" />
              {/* Bottom-left */}
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl" />
              {/* Bottom-right */}
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br" />
            </div>
          </div>
        )}

        {/* Idle state */}
        {!scanning && !scanResult && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Camera className="w-12 h-12 text-white-muted mb-3" />
            <p className="text-white-muted text-sm">Pulsa para escanear</p>
          </div>
        )}

        {/* Continuous scan result overlay */}
        {scanning && scanResult && (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 p-3.5 flex items-center gap-3 backdrop-blur-xl',
              scanResult.success ? 'bg-emerald-600/90' : 'bg-red-600/90',
            )}
            style={{ animation: 'slideUp 0.2s ease-out' }}
          >
            {scanResult.success ? (
              <CheckCircle2 className="w-8 h-8 text-white flex-shrink-0" />
            ) : (
              <XCircle className="w-8 h-8 text-white flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white text-sm truncate">
                {scanResult.success
                  ? scanResult.user_name || 'Entrada OK'
                  : scanResult.error?.includes('escaneado')
                    ? scanResult.user_name || 'Ya escaneado'
                    : 'Error'}
              </p>
              <p className="text-white/80 text-xs truncate">
                {scanResult.success
                  ? scanResult.event_title || 'Validado'
                  : scanResult.error?.includes('escaneado')
                    ? `Ya entro${scanResult.scanned_at ? ' a las ' + formatTime(scanResult.scanned_at) : ''}`
                    : scanResult.error}
              </p>
            </div>
          </div>
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
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
        </button>
      </div>

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

      {/* Non-continuous scan result (when scanner is stopped) */}
      {!scanning && scanResult && (
        <div
          className={cn(
            'card p-5 text-center',
            scanResult.success ? 'border-emerald-500/30' : 'border-red-500/30',
          )}
        >
          <div
            className={cn(
              'w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center',
              scanResult.success ? 'bg-emerald-500/15' : 'bg-red-500/15',
            )}
          >
            {scanResult.success ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            ) : (
              <XCircle className="w-7 h-7 text-red-400" />
            )}
          </div>
          {scanResult.success ? (
            <>
              <h3 className="text-lg font-bold text-white">{scanResult.user_name}</h3>
              <p className="text-white-muted text-sm mt-1">Entrada validada</p>
              {scanResult.event_title && (
                <p className="text-[11px] text-white/30 mt-0.5">{scanResult.event_title}</p>
              )}
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-red-400">
                {scanResult.error?.includes('escaneado') ? 'Ya escaneado' : 'Error'}
              </h3>
              <p className="text-white-muted text-sm mt-1">
                {scanResult.error?.includes('escaneado') && scanResult.user_name
                  ? `${scanResult.user_name} ya entro${scanResult.scanned_at ? ' a las ' + formatTime(scanResult.scanned_at) : ''}`
                  : scanResult.error}
              </p>
              {scanResult.event_title && (
                <p className="text-[11px] text-white/30 mt-0.5">{scanResult.event_title}</p>
              )}
            </>
          )}
          <button
            onClick={() => {
              setScanResult(null)
              startScanner()
            }}
            className="btn-primary w-full mt-4 py-3"
          >
            Escanear otro
          </button>
        </div>
      )}

    </div>
  )
}
