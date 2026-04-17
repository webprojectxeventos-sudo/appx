'use client'

import { useState, useEffect, useRef } from 'react'

/** Play a short beep via Web Audio API — 880 Hz sine on success, 280 Hz square on error */
export function playBeep(success: boolean) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = success ? 880 : 280
    osc.type = success ? 'sine' : 'square'
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.15 : 0.3))
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (success ? 0.15 : 0.3))
  } catch {
    /* AudioContext not available */
  }
}

/**
 * Trigger device vibration — short pulse on success, double tap on error.
 * Uses @capacitor/haptics when on native (iOS/Android), navigator.vibrate on web.
 */
export function haptic(success: boolean) {
  // Fire and forget — don't block the scanner on haptic completion.
  runHaptic(success).catch(() => {
    /* ignore */
  })
}

async function runHaptic(success: boolean) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import(
        '@capacitor/haptics'
      )
      if (success) {
        await Haptics.impact({ style: ImpactStyle.Medium })
      } else {
        await Haptics.notification({ type: NotificationType.Error })
      }
      return
    }
  } catch {
    /* fall through to web vibrate */
  }
  try {
    navigator.vibrate?.(success ? [80] : [60, 40, 60])
  } catch {
    /* ignore */
  }
}

/** Richer 3-level haptic used by inline scanner: ok / duplicate / error */
export type HapticKind = 'success' | 'duplicate' | 'error'
export function hapticLevel(kind: HapticKind) {
  runHapticLevel(kind).catch(() => {
    /* ignore */
  })
}

async function runHapticLevel(kind: HapticKind) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import(
        '@capacitor/haptics'
      )
      if (kind === 'success') await Haptics.impact({ style: ImpactStyle.Medium })
      else if (kind === 'duplicate') await Haptics.impact({ style: ImpactStyle.Light })
      else await Haptics.notification({ type: NotificationType.Error })
      return
    }
  } catch {
    /* fall through */
  }
  try {
    if (kind === 'success') navigator.vibrate?.([80])
    else if (kind === 'duplicate') navigator.vibrate?.([40, 30, 40])
    else navigator.vibrate?.([60, 40, 60, 40, 60])
  } catch {
    /* ignore */
  }
}

/** Animate a number with ease-out cubic easing */
export function useAnimatedNumber(value: number, duration = 400) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) {
      setDisplay(value)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value, duration])

  return display
}

/** Format an ISO timestamp to "HH:MM" in Spanish locale */
export function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
