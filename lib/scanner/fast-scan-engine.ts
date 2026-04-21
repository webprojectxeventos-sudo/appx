/**
 * Fast QR scanning engine.
 *
 * Replaces the old `html5-qrcode` integration. The previous library ran jsQR
 * on the main thread and took 200–400ms per parse attempt on mid-range
 * Android devices, which (combined with a blocking backend round-trip) made
 * the scanner feel laggy at busy venues.
 *
 * Strategy:
 *   1. **Native `BarcodeDetector`** when available (Chrome 83+, Android,
 *      Safari iOS/macOS 17+). Runs in the UA and typically returns a
 *      decoded QR in <30 ms per frame.
 *   2. **`@zxing/browser`** fallback (Firefox, older Safari). ZXing's wasm
 *      decoder lands around ~100 ms per frame — still clearly faster than
 *      jsQR and produces identical dedupe keys.
 *
 * Dedupe lives here (not in the caller) so both engines share the same
 * 10 s window without leaking the internal `processedQRs` detail.
 */

import type { IScannerControls } from '@zxing/browser'

/** Public handle returned to callers. */
export interface FastScannerHandle {
  /** Stop decoding and release the camera. Safe to call multiple times. */
  stop: () => Promise<void>
  /**
   * Underlying MediaStreamTrack — exposed so the caller can check for torch
   * support (`getCapabilities().torch`) and toggle it. May be `null` if the
   * ZXing path hasn't resolved the stream yet.
   */
  getTrack: () => MediaStreamTrack | null
  /** Which decoder is currently running. Useful for telemetry. */
  engine: 'native' | 'zxing'
}

/** Params for {@link startFastScanner}. */
export interface FastScannerOptions {
  /** <video> element that will display the camera preview. */
  videoEl: HTMLVideoElement
  /** Called with the decoded QR string whenever a new code is detected. */
  onDetect: (qr: string) => void
  /**
   * Ignore re-detections of the same QR for this many ms (default 10 000).
   * Prevents the scanner from firing 50 callbacks per second while the
   * same ticket sits under the lens.
   */
  dedupeMs?: number
  /** Force a specific engine — mostly for tests. */
  forceEngine?: 'native' | 'zxing'
}

/**
 * Start the fastest scanner available on this device.
 *
 * Resolves once the camera stream is attached and decoding has begun.
 * Throws if camera permission is denied or no decoder is available.
 */
export async function startFastScanner(
  opts: FastScannerOptions,
): Promise<FastScannerHandle> {
  const { videoEl, onDetect, dedupeMs = 10_000, forceEngine } = opts

  // Internal dedupe — shared across engines.
  const seen = new Map<string, number>()
  const emit = (qr: string) => {
    const now = Date.now()
    const last = seen.get(qr)
    if (last !== undefined && now - last < dedupeMs) return
    seen.set(qr, now)
    // Keep the dedupe map bounded so a long session doesn't leak memory.
    if (seen.size > 200) {
      const cutoff = now - dedupeMs
      for (const [k, t] of seen) if (t < cutoff) seen.delete(k)
    }
    onDetect(qr)
  }

  const preferNative =
    forceEngine !== 'zxing' &&
    typeof window !== 'undefined' &&
    'BarcodeDetector' in window

  if (preferNative) {
    try {
      return await startNativeEngine(videoEl, emit)
    } catch (err) {
      // Fall through to ZXing if native init failed (e.g. no QR format
      // support). Other errors (NotAllowed, NotFound) we let propagate
      // by re-throwing after ZXing also fails.
      console.warn('[scanner] native BarcodeDetector unavailable, falling back to ZXing', err)
    }
  }

  return startZxingEngine(videoEl, emit)
}

// ── Native BarcodeDetector ───────────────────────────────────────────────

async function startNativeEngine(
  videoEl: HTMLVideoElement,
  emit: (qr: string) => void,
): Promise<FastScannerHandle> {
  // BarcodeDetector typings are experimental and not in lib.dom.d.ts yet.
  type Detector = {
    detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>
  }
  type DetectorCtor = new (opts: { formats: string[] }) => Detector

  const DetectorClass = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector
  const detector = new DetectorClass({ formats: ['qr_code'] })

  // Request the back camera at a reasonable resolution. Higher res = more
  // pixels to decode per frame = slower; 1280×720 is the sweet spot for QR.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  })

  videoEl.srcObject = stream
  videoEl.setAttribute('playsinline', 'true')
  videoEl.muted = true
  await videoEl.play().catch(() => {
    /* Autoplay can be blocked on first mount; operators always interact
       before scanning so this resolves on next user gesture. */
  })

  let stopped = false
  const tick = async () => {
    if (stopped) return
    if (videoEl.readyState >= 2 && !videoEl.paused) {
      try {
        const codes = await detector.detect(videoEl)
        if (codes.length > 0) {
          for (const c of codes) if (c.rawValue) emit(c.rawValue)
        }
      } catch {
        /* Transient detector errors happen on device rotation etc. —
           safe to ignore, the next frame usually works. */
      }
    }
    scheduleNext()
  }

  // Prefer `requestVideoFrameCallback` when available — it fires exactly
  // when the browser paints a new video frame, so we don't waste CPU on
  // duplicate frames or run while the tab is backgrounded.
  type RVFC = (cb: () => void) => number
  const rvfc = (videoEl as unknown as { requestVideoFrameCallback?: RVFC })
    .requestVideoFrameCallback
  const scheduleNext = rvfc
    ? () => rvfc.call(videoEl, tick)
    : () => {
        // Fallback: rAF is also throttled when the tab is hidden, which
        // is what we want.
        requestAnimationFrame(() => tick())
      }
  scheduleNext()

  return {
    stop: async () => {
      stopped = true
      for (const t of stream.getTracks()) t.stop()
      if (videoEl.srcObject === stream) videoEl.srcObject = null
    },
    getTrack: () => stream.getVideoTracks()[0] ?? null,
    engine: 'native',
  }
}

// ── ZXing fallback ───────────────────────────────────────────────────────

async function startZxingEngine(
  videoEl: HTMLVideoElement,
  emit: (qr: string) => void,
): Promise<FastScannerHandle> {
  // Dynamic import so the ~200 KB ZXing bundle stays out of the initial
  // route chunk — it only loads on Firefox / old Safari.
  const { BrowserQRCodeReader } = await import('@zxing/browser')
  const reader = new BrowserQRCodeReader()

  let controls: IScannerControls | null = null
  controls = await reader.decodeFromVideoDevice(
    undefined,
    videoEl,
    (result) => {
      if (result) emit(result.getText())
    },
  )

  return {
    stop: async () => {
      try {
        controls?.stop()
      } catch {
        /* stop() can race with pending decode loop — ignore. */
      }
    },
    getTrack: () => {
      // ZXing attaches the MediaStream to videoEl.srcObject.
      const stream = videoEl.srcObject as MediaStream | null
      return stream?.getVideoTracks()?.[0] ?? null
    },
    engine: 'zxing',
  }
}

/**
 * Human-friendly error message for a rejected `getUserMedia()` promise.
 * Exported for the UI layer so the copy stays consistent.
 */
export function humanizeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err ?? '')
  if (name === 'NotAllowedError' || /denied|permiso|permission/i.test(raw)) {
    return 'Permite el acceso a la camara en Ajustes > Project X para usar el escaner.'
  }
  if (name === 'NotFoundError' || /no camera|device not found/i.test(raw)) {
    return 'No se detecto ninguna camara en este dispositivo.'
  }
  if (name === 'NotReadableError' || /in use|hardware/i.test(raw)) {
    return 'La camara esta siendo usada por otra aplicacion. Cierrala e intentalo de nuevo.'
  }
  if (name === 'OverconstrainedError') {
    return 'Tu camara no soporta la resolucion pedida. Prueba en otro dispositivo.'
  }
  return 'No se pudo iniciar el escaner. Cierra y vuelve a abrir la app, o revisa los permisos de camara.'
}
