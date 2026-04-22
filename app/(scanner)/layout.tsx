'use client'

import React, { ReactNode, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { ErrorBoundary } from '@/components/error-boundary'
import { useScannerHiVis } from '@/lib/hooks/use-scanner-hi-vis'

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

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/**
 * Scanner layout — panel operativo oscuro dentro del tema global de la app.
 *
 * Paleta: fondo `bg-dots` dark + `glass-strong` paneles + acento rojo primary
 * (mismo `#E41E2B` que el resto de la app). La identidad visual del scanner
 * ya no compite con el admin — es consistente y legible en situaciones de
 * baja luz típicas de un evento nocturno.
 *
 * Preserva todo el set de features del scanner original:
 *   - Tap-to-confirm logout
 *   - Hi-vis mode (se aplica a `.scanner-root` en globals.css)
 *   - Venue badge con día + contador de eventos activos
 *   - Back-to-admin para usuarios con rol admin / group_admin
 *   - Safe-area top para iPhone con notch / Dynamic Island
 *   - Safe-area bottom en <main> para que el home indicator no tape contenido
 */
function ScannerLayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading, initialized, isStaff, isAdmin, isGroupAdmin, venue, signOut, events } = useAuth()
  const canGoBackToAdmin = isAdmin || isGroupAdmin
  const isCloakroomPage = pathname.startsWith('/cloakroom')
  const pageTitle = isCloakroomPage ? 'Ropero' : 'Scanner'

  // Tap-to-confirm logout
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [hiVis, toggleHiVis] = useScannerHiVis()

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
    return <LoadingScreen />
  }

  if (!user || !profile || !isStaff) {
    return <LoadingScreen />
  }

  const activeEventCount = events?.length || 0
  // Human-friendly date for the header context line, e.g. "Vie 17 abr"
  const todayLabel = new Date().toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="scanner-root min-h-screen bg-dots text-white">
      {/* Header — glass dark sticky con safe-area top para iPhone con notch */}
      <header className="sticky top-0 z-40 glass-strong border-b border-white/[0.06] shadow-soft pt-safe-sm">
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {canGoBackToAdmin && (
              <button
                onClick={() => router.push('/admin/dashboard')}
                className="p-1.5 -ml-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors shrink-0"
                title="Volver al panel"
                aria-label="Volver al panel"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
            )}
            <Image src="/logo.png" alt="Project X" width={28} height={28} className="rounded-lg shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-sm text-white leading-tight truncate">{pageTitle}</h1>
              <p className="text-[10px] text-white/50 leading-tight truncate">{profile.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => toggleHiVis()}
              className={`p-2 rounded-lg transition-all ${
                hiVis
                  ? 'bg-primary/15 text-primary'
                  : 'text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10'
              }`}
              title={hiVis ? 'Modo alta visibilidad activado' : 'Activar alta visibilidad'}
              aria-label="Alternar modo alta visibilidad"
              aria-pressed={hiVis}
            >
              <EyeIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className={`p-2 rounded-lg transition-all ${
                logoutConfirm
                  ? 'bg-red-500/15 text-red-400'
                  : 'text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10'
              }`}
              title={logoutConfirm ? 'Pulsa de nuevo para cerrar sesion' : 'Cerrar sesion'}
              aria-label="Cerrar sesion"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Venue badge — contexto operativo (sala + día + eventos activos) */}
        {venue?.name && (
          <div className="max-w-3xl mx-auto px-4 pb-2.5 flex items-center gap-1.5">
            <MapPinIcon className="w-3 h-3 text-primary shrink-0" />
            <span className="text-[11px] text-white/55 truncate">
              <span className="text-white/70 font-medium">{venue.name}</span>
              <span className="text-white/35"> · {todayLabel}</span>
              {activeEventCount > 0 && (
                <span className="text-white/35"> · {activeEventCount} evento{activeEventCount !== 1 ? 's' : ''}</span>
              )}
            </span>
          </div>
        )}
      </header>

      {/* Main — padding-bottom con safe-area para que el home indicator iOS
         no cubra el último elemento */}
      <main className="max-w-3xl mx-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center bg-dots min-h-screen">
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

export default function ScannerLayout({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ScannerLayoutContent>{children}</ScannerLayoutContent>
    </ErrorBoundary>
  )
}
