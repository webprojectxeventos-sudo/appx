'use client'

import React, { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowLeft, Calendar, Image as ImageIcon, BarChart3, MessageCircle, KeyRound, Users, LayoutDashboard, ClipboardList, Building2, Activity, Radio, AlertTriangle, UsersRound, CalendarClock, Music } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { AdminSelectionProvider, useAdminSelection } from '@/lib/admin-context'
import { ToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

function AdminSelectionBar() {
  const { selectedDate, selectedVenueId, selectedEventId, dates, venues, events, setDate, setVenue, setEvent } = useAdminSelection()
  const pathname = usePathname()

  // Pages that need event selection (per-institute features)
  const needsEvent = ['/admin/codes', '/admin/polls', '/admin/surveys', '/admin/staff', '/admin/incidents', '/admin/schedule', '/admin/playlist'].some(p => pathname.startsWith(p))
  // Pages that work at venue level
  const needsVenue = needsEvent || ['/admin/photos', '/admin/chat', '/admin/dashboard'].some(p => pathname.startsWith(p))

  if (dates.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-black-border bg-black-card/30">
      {/* Date selector */}
      <select
        value={selectedDate || ''}
        onChange={(e) => setDate(e.target.value || null)}
        className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
      >
        <option value="" className="bg-[#1a1a1a]">Fecha...</option>
        {dates.map(d => (
          <option key={d} value={d} className="bg-[#1a1a1a]">{formatDateLabel(d)}</option>
        ))}
      </select>

      {/* Venue selector */}
      {needsVenue && selectedDate && venues.length > 0 && (
        <>
          <span className="text-white-muted text-xs">&rsaquo;</span>
          <select
            value={selectedVenueId || ''}
            onChange={(e) => setVenue(e.target.value || null)}
            className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
          >
            <option value="" className="bg-[#1a1a1a]">Venue...</option>
            {venues.map(v => (
              <option key={v.id} value={v.id} className="bg-[#1a1a1a]">{v.name}</option>
            ))}
          </select>
        </>
      )}

      {/* Event/Instituto selector */}
      {needsEvent && selectedVenueId && events.length > 0 && (
        <>
          <span className="text-white-muted text-xs">&rsaquo;</span>
          <select
            value={selectedEventId || ''}
            onChange={(e) => setEvent(e.target.value || null)}
            className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
          >
            <option value="" className="bg-[#1a1a1a]">Instituto...</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id} className="bg-[#1a1a1a]">{ev.group_name || ev.title}</option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, profile, loading, initialized, isSuperAdmin, isAdmin } = useAuth()

  useEffect(() => {
    if (initialized && (!user || !isAdmin)) {
      router.push('/home')
    }
  }, [user, isAdmin, initialized, router])

  if (!initialized) {
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

  if (!user || !isAdmin) return null

  const baseNavItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/events', label: 'Eventos', icon: Calendar },
    { href: '/admin/photos', label: 'Fotos', icon: ImageIcon },
    { href: '/admin/polls', label: 'Bebidas', icon: BarChart3 },
    { href: '/admin/surveys', label: 'Encuestas', icon: ClipboardList },
    { href: '/admin/chat', label: 'Chat', icon: MessageCircle },
    { href: '/admin/codes', label: 'Codigos', icon: KeyRound },
    { href: '/admin/staff', label: 'Staff', icon: Users },
    { href: '/admin/schedule', label: 'Programa', icon: CalendarClock },
    { href: '/admin/playlist', label: 'Playlist', icon: Music },
  ]

  const superAdminItems = [
    { href: '/admin/org', label: 'Organizacion', icon: Building2 },
    { href: '/admin/live', label: 'En Vivo', icon: Activity },
    { href: '/admin/comms', label: 'Comunicados', icon: Radio },
    { href: '/admin/incidents', label: 'Incidencias', icon: AlertTriangle },
    { href: '/admin/users', label: 'Usuarios', icon: UsersRound },
  ]

  const navItems = isSuperAdmin ? [...superAdminItems, ...baseNavItems] : baseNavItems

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')

  return (
    <div className="flex flex-col md:flex-row min-h-screen text-white bg-background">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 border-b border-white/[0.06] glass-panel px-4 py-3 flex items-center gap-3">
        <Link href="/home" className="text-primary hover:text-primary-light transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="font-bold text-base text-gradient-primary">Panel Admin</h1>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 border-r border-white/[0.06] glass-panel">
        <div className="p-5 flex items-center gap-3 border-b border-black-border">
          <Link href="/home" className="text-primary hover:text-primary-light transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-bold text-base text-gradient-primary">Panel Admin</h1>
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
      </aside>

      {/* Mobile Tab Navigation */}
      <nav className="md:hidden sticky top-[53px] z-30 border-b border-white/[0.06] glass-panel overflow-x-auto">
        <div className="flex px-2 py-2 gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap rounded-lg font-medium transition-all',
                  active
                    ? 'bg-primary text-white'
                    : 'text-white-muted hover:text-white'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Selection Bar */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <AdminSelectionBar />

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminSelectionProvider>
        <ToastProvider>
          <AdminLayoutContent>{children}</AdminLayoutContent>
        </ToastProvider>
      </AdminSelectionProvider>
    </AuthProvider>
  )
}
