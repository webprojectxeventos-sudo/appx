'use client'

import React, { ReactNode, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { ErrorBoundary } from '@/components/error-boundary'

// Inline SVG icons to avoid lucide-react barrel import issues in dev mode
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  )
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ScannerLayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading, initialized, isStaff, isAdmin, isGroupAdmin, venue, signOut, events } = useAuth()
  const canGoBackToAdmin = isAdmin || isGroupAdmin
  const isCloakroomPage = pathname.startsWith('/cloakroom')
  const pageTitle = isCloakroomPage ? 'Ropero' : 'Scanner'

  // Tap-to-confirm logout
  const [logoutConfirm, setLogoutConfirm] = useState(false)

  const handleLogout = () => {
    if (!logoutConfirm) {
      setLogoutConfirm(true)
      setTimeout(() => setLogoutConfirm(false), 3000)
      return
    }
    signOut()
  }

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    if (!loading && (!profile || !isStaff)) { router.push('/home') }
  }, [user, profile, initialized, loading, isStaff, router])

  if (!initialized || !user || loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <div className="text-center animate-fade-in">
          <Image src="/logo.png" alt="Project X" width={48} height={48} className="rounded-xl mx-auto mb-4" priority />
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    )
  }

  if (!user || !profile || !isStaff) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <div className="text-center animate-fade-in">
          <Image src="/logo.png" alt="Project X" width={48} height={48} className="rounded-xl mx-auto mb-4" priority />
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    )
  }

  const activeEventCount = events?.length || 0

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black-border bg-[#0e0e0e]/90 backdrop-blur-xl">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {canGoBackToAdmin && (
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="p-1.5 -ml-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
                title="Volver al panel"
                aria-label="Volver al panel"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}
            <Image src="/logo.png" alt="Project X" width={28} height={28} className="rounded-lg" />
            <h1 className="font-bold text-sm text-white">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white-muted">{profile.full_name}</span>
            <button
              onClick={handleLogout}
              className={`p-1.5 rounded-lg transition-all ${
                logoutConfirm
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-white-muted hover:text-white hover:bg-white/5'
              }`}
              title={logoutConfirm ? 'Pulsa de nuevo para cerrar sesion' : 'Cerrar sesion'}
              aria-label="Cerrar sesion"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Venue badge */}
        {venue?.name && (
          <div className="px-4 pb-2.5 flex items-center gap-1.5">
            <MapPinIcon className="w-3 h-3 text-primary/70" />
            <span className="text-[11px] text-white-muted">
              {venue.name}
              {activeEventCount > 0 && (
                <span className="text-white/30"> · {activeEventCount} evento{activeEventCount !== 1 ? 's' : ''}</span>
              )}
            </span>
          </div>
        )}
      </header>

      <main className="p-4">
        {children}
      </main>
    </div>
  )
}

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ScannerLayoutContent>{children}</ScannerLayoutContent>
    </ErrorBoundary>
  )
}
