'use client'

import React, { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, Calendar, MessageCircle, LayoutDashboard, Building2, AlertTriangle, UsersRound, ScanLine, User } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { ErrorBoundary } from '@/components/error-boundary'
import { AdminSelectionProvider } from '@/lib/admin-context'
import { ToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading, initialized, isSuperAdmin, isAdmin, isGroupAdmin, signOut } = useAuth()
  const canAccessAdmin = isAdmin || isGroupAdmin

  useEffect(() => {
    if (!initialized) return
    if (!user) { router.push('/login'); return }
    // Wait for profile to determine role (loading=false means profile is ready)
    if (!loading && !canAccessAdmin) { router.push('/home') }
  }, [user, canAccessAdmin, initialized, loading, router])

  // Only block on session check — NOT on profile load.
  // Once session exists, render the layout shell immediately.
  // Profile/role loads in background — individual pages handle their own loading.
  if (!initialized || !user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background min-h-screen">
        <div className="text-center animate-fade-in">
          <Image src="/logo.png" alt="Logo" width={48} height={48} className="rounded-xl mx-auto mb-4" priority />
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    )
  }

  // Profile loaded but not admin — useEffect handles redirect
  if (!loading && !canAccessAdmin) return null

  // group_admin: Dashboard + Comms + Incidents + Attendees (scoped to their events)
  // admin: Dashboard + Events + Scanner + Comms + Incidents
  // super_admin: all of the above + Users + Organization
  const groupAdminNavItems = [
    { href: '/admin/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/admin/comms', label: 'Comunicacion', icon: MessageCircle },
    { href: '/admin/incidents', label: 'Incidencias', icon: AlertTriangle },
    { href: '/admin/attendees', label: 'Asistentes', icon: UsersRound },
  ]

  const adminNavItems = [
    { href: '/admin/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/admin/events', label: 'Eventos', icon: Calendar },
    { href: '/scanner', label: 'Scanner', icon: ScanLine },
    { href: '/admin/comms', label: 'Comunicacion', icon: MessageCircle },
    { href: '/admin/incidents', label: 'Incidencias', icon: AlertTriangle },
    { href: '/admin/attendees', label: 'Asistentes', icon: UsersRound },
  ]

  const superAdminNavItems = [
    ...adminNavItems,
    { href: '/admin/users', label: 'Usuarios', icon: UsersRound },
    { href: '/admin/org', label: 'Organizacion', icon: Building2 },
  ]

  const navItems = isSuperAdmin
    ? superAdminNavItems
    : isAdmin
      ? adminNavItems
      : groupAdminNavItems

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

  return (
    <div className="flex flex-col md:flex-row min-h-screen text-white bg-background">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 border-b border-white/[0.06] glass-panel safe-area-top px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded-lg" />
          <div>
            <h1 className="font-bold text-sm text-gradient-primary leading-tight">Panel Admin</h1>
            <p className="text-[10px] text-white-muted leading-tight">TuGraduacion</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile && (
            <Link
              href="/profile"
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-primary/30 transition-all"
              title="Mi perfil"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-white-muted" />
              )}
            </Link>
          )}
          <button onClick={signOut} className="p-2.5 -mr-1 rounded-xl text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors" title="Cerrar sesion">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 border-r border-white/[0.06] glass-panel">
        <div className="p-5 flex items-center gap-3 border-b border-black-border">
          <Image src="/logo.png" alt="Logo" width={28} height={28} className="rounded-lg" />
          <div>
            <h1 className="font-bold text-sm text-gradient-primary leading-tight">Panel Admin</h1>
            <p className="text-[10px] text-white-muted leading-tight">TuGraduacion</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                  active
                    ? 'bg-gradient-to-r from-primary/20 to-transparent border-l-2 border-l-primary text-white'
                    : 'text-white-muted hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        {/* Sidebar footer — user info + sign out */}
        <div className="p-3 border-t border-black-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-white-muted" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium truncate">{profile?.full_name || 'Admin'}</p>
              <p className="text-[10px] text-white-muted truncate capitalize">{profile?.role?.replace('_', ' ') || 'admin'}</p>
            </div>
            <button onClick={signOut} className="p-1.5 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0" title="Cerrar sesion">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation — app-native feel with large touch targets */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] glass-panel safe-area-bottom">
        <div className="flex items-center h-16 overflow-x-auto scrollbar-none">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 grow shrink-0 basis-[64px] h-full transition-all duration-200',
                  active ? 'text-primary' : 'text-white-muted active:text-white'
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium leading-tight">{label}</span>
                {active && (
                  <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_rgba(228,30,43,0.6)]" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Main Content — extra bottom padding on mobile for bottom nav */}
      <main className="flex-1 p-4 pb-20 md:p-8 md:pb-8 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AdminSelectionProvider>
        <ToastProvider>
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </ToastProvider>
      </AdminSelectionProvider>
    </ErrorBoundary>
  )
}
