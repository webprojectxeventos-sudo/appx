'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

interface Options {
  /** Endpoint to probe. Must return any 2xx/3xx quickly. Default: /api/health (falls back to origin). */
  probeUrl?: string
  /** Probe interval when navigator reports offline. Default: 4000ms */
  offlineInterval?: number
  /** Probe interval when navigator reports online (background revalidation). Default: 30000ms */
  onlineInterval?: number
}

/**
 * Tracks real network reachability, not just `navigator.onLine` (which lies,
 * especially on Capacitor Android where it can stay `true` after wifi drops).
 *
 * Strategy:
 *   - Start from `navigator.onLine` flag.
 *   - Listen to `online` / `offline` events for fast transitions.
 *   - Periodically probe with a lightweight HEAD request to confirm.
 */
export function useOnlineStatus(opts: Options = {}) {
  const probeUrl = opts.probeUrl ?? '/favicon.png'
  const offlineInterval = opts.offlineInterval ?? 4000
  const onlineInterval = opts.onlineInterval ?? 30000

  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const probe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(probeUrl, {
        method: 'GET',
        cache: 'no-store',
        // cache-bust so intermediate proxies don't lie to us
        headers: { 'cache-control': 'no-cache' },
      })
      return res.ok || res.status < 500
    } catch {
      return false
    }
  }, [probeUrl])

  const schedule = useCallback(
    (delay: number) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        const ok = await probe()
        setOnline((prev) => (prev === ok ? prev : ok))
        schedule(ok ? onlineInterval : offlineInterval)
      }, delay)
    },
    [probe, onlineInterval, offlineInterval],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      setOnline(true)
      schedule(500) // confirm quickly
    }
    const handleOffline = () => {
      setOnline(false)
      schedule(offlineInterval)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    schedule(onlineInterval)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [schedule, offlineInterval, onlineInterval])

  return online
}
