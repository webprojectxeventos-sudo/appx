'use client'

import { useEffect } from 'react'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import { initNativePlugins } from '@/lib/capacitor'

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize native plugins once on mount (no-op on web)
  useEffect(() => {
    initNativePlugins()
  }, [])

  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  )
}
