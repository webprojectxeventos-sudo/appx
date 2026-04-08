'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    // Skip SW in development — it caches stale assets and causes issues
    if (process.env.NODE_ENV === 'development') {
      // Unregister any existing SW in dev mode
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
      return
    }

    // Production: register after page load to not block initial render
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })
        console.log('[SW] Registered:', registration.scope)

        // Check for updates periodically (every 5 min)
        const interval = setInterval(() => {
          registration.update().catch(() => {})
        }, 5 * 60 * 1000)

        return () => clearInterval(interval)
      } catch (err) {
        console.warn('[SW] Registration failed:', err)
      }
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register, { once: true })
    }
  }, [])

  return null
}
