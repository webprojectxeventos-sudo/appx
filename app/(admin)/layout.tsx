'use client'

import React, { ReactNode, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowLeft, Calendar, MessageCircle, LayoutDashboard, Building2, AlertTriangle } from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { AdminSelectionProvider } from '@/lib/admin-context'
import { ToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

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
    { href: '/admin/dashboard', label: 'Resumen', icon: LayoutDashboard },
    { href: '/admin/events', label: 'Eventos', icon: Calendar },
    { href: '/admin/comms', label: 'Comunicacion', icon: MessageCircle },
    { href: '/admin/incidents', label: 'Incidencias', icon: AlertTriangle },
  ]

  const superAdminItems = [
    { href: '/admin/org', label: 'Organizacion', icon: Building2 },
  ]

  const navItems = isSuperAdmin ? [...baseNavItems, ...superAdminItems] : baseNavItems

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

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {children}
      </main>
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
