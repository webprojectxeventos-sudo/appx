'use client'

import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'scanner-hi-vis'
const BODY_ATTR = 'data-scanner-hi-vis'

/**
 * High-visibility mode for the scanner — bumps up contrast and number sizes
 * for use in low-light venues. Persisted per device via localStorage; the
 * attribute on <body> is consumed by globals.css.
 */
export function useScannerHiVis(): [boolean, (next?: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (enabled) {
      document.body.setAttribute(BODY_ATTR, 'true')
    } else {
      document.body.removeAttribute(BODY_ATTR)
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.removeAttribute(BODY_ATTR)
      }
    }
  }, [enabled])

  const toggle = useCallback((next?: boolean) => {
    setEnabled((prev) => {
      const value = typeof next === 'boolean' ? next : !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
      } catch {
        /* storage disabled */
      }
      return value
    })
  }, [])

  return [enabled, toggle]
}
