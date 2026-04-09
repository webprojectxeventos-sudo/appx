'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  Image as ImageIcon,
  MessageCircle,
  GlassWater,
  BarChart3,
  Music2,
  Shield,
  LogOut,
  User,
  Sun,
  Moon,
  Megaphone,
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { ThemeProvider, useTheme } from '@/lib/theme-context'
import { ToastProvider } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { ReactNode, useState, useEffect } from 'react'

function BottomNav() {
  const pathname = usePathname()
  const { profile, isAdmin, isPromoter, initialized, event } = useAuth()
  const [hasSurveys, setHasSurveys] = useState(false)

  useEffect(() => {
    if (!event?.id) return
    const checkSurveys = async () => {
      const { count } = await supabase
        .from('polls')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('poll_type', 'survey')
        .eq('is_active', true)
      setHasSurveys((count || 0) > 0)
    }
    checkSurveys()
    const channel = supabase.channel('polls-nav')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls', filter: `event_id=eq.${event.id}` }, () => {
        checkSurveys()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id])

  if (!initialized) return null

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/')

  const navItems = [
    { href: '/home', label: 'Home', icon: Home },
    { href: '/gallery', label: 'Galeria', icon: ImageIcon },
    { href: '/chat', label: 'Chat', icon: MessageCircle },
    { href: '/polls', label: 'Bebidas', icon: GlassWater },
    ...(hasSurveys ? [{ href: '/surveys', label: 'Encuestas', icon: BarChart3 }] : []),
    { href: '/playlist', label: 'Playlist', icon: Music2 },
  ]

  if (isPromoter || isAdmin) {
    navItems.push({ href: '/promoter', label: 'Promotor', icon: Megaphone })
  }

  if (isAdmin) {
    navItems.push({ href: '/admin/dashboard', label: 'Admin', icon: Shield })
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] glass-panel safe-area-bottom">
      <div className="flex items-center h-16 max-w-lg mx-auto overflow-x-auto scrollbar-none">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-all duration-300',
                active ? 'text-primary' : 'text-white-muted hover:text-gray-300'
              )}
            >
              <Icon
                className="w-5 h-5"
                strokeWidth={active ? 2.5 : 1.5}
              />
              <span className="text-[10px] font-medium">{label}</span>
              {active && (
                <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_6px_rgba(228,30,43,0.6)]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function AppHeader() {
  const { signOut, event, profile } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [avatarError, setAvatarError] = useState(false)

  const avatarUrl = profile?.avatar_url
  const showAvatar = avatarUrl && !avatarError

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] glass-panel px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="Project X" width={32} height={32} className="rounded-lg" />
        <div>
          <h1 className="text-gradient-primary font-bold text-base leading-tight">
            Project X
          </h1>
          {event && (
            <p className="text-white-muted text-[11px] leading-tight truncate max-w-[180px]">
              {event.title} <span className="text-gold">&middot;</span> TuGraduacion
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="text-white-muted hover:text-white p-2 rounded-lg transition-colors duration-200 hover:bg-primary/5"
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          {theme === 'dark' ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
        </button>
        <Link
          href="/profile"
          className="relative flex items-center justify-center w-8 h-8 rounded-full transition-colors duration-200 hover:ring-2 hover:ring-primary/30 overflow-hidden"
          title="Mi perfil"
        >
          {showAvatar ? (
            <img
              src={avatarUrl}
              alt="Perfil"
              className="w-full h-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white-muted hover:text-white">
              <User className="w-4.5 h-4.5" />
            </div>
          )}
        </Link>
        <button
          onClick={signOut}
          className="text-white-muted hover:text-white p-2 rounded-lg transition-colors duration-200 hover:bg-primary/5"
          title="Cerrar sesion"
        >
          <LogOut className="w-4.5 h-4.5" />
        </button>
      </div>
    </header>
  )
}

// Pages that handle their own layout (full-screen, no header/padding)
const FULL_SCREEN_PAGES = ['/chat']

// Pages allowed before completing drink order
const ALLOWED_BEFORE_SURVEY = ['/polls', '/profile', '/promoter']

function AppLayoutContent({ children }: { children: ReactNode }) {
  const { loading, initialized, user, event, isStaff } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [needsSurvey, setNeedsSurvey] = useState(false)

  // Check if user has completed drink order — runs in background, does NOT block render
  useEffect(() => {
    if (!initialized || !user?.id || !event?.id || isStaff) return
    let cancelled = false

    // Check sessionStorage cache first to avoid repeated queries
    const cacheKey = `drink_order_${event.id}_${user.id}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached === 'done') return // Already completed, no redirect needed

    const check = async () => {
      const { count } = await supabase
        .from('drink_orders')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('user_id', user.id)
      if (cancelled) return
      const hasOrder = (count || 0) > 0
      if (hasOrder) {
        sessionStorage.setItem(cacheKey, 'done')
      } else {
        setNeedsSurvey(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [initialized, user?.id, event?.id, isStaff])

  // Redirect to polls if survey not completed (non-blocking — page already visible)
  useEffect(() => {
    if (!needsSurvey) return
    const isAllowed = ALLOWED_BEFORE_SURVEY.some(p => pathname === p || pathname.startsWith(p + '/'))
    if (!isAllowed) {
      router.replace('/polls')
    }
  }, [needsSurvey, pathname, router])

  const isFullScreen = FULL_SCREEN_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )

  // Only show loading on first initialization
  if (!initialized) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center animate-fade-in">
          <Image src="/logo.png" alt="Project X" width={48} height={48} className="rounded-xl mx-auto mb-4" priority />
          <div className="flex items-center gap-1.5 justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    )
  }

  if (isFullScreen) {
    return (
      <>
        <main className="flex-1 pb-16 flex flex-col overflow-hidden">
          {children}
        </main>
        <BottomNav />
      </>
    )
  }

  return (
    <>
      <AppHeader />
      <main className="flex-1 pb-20">
        <div className="p-4 max-w-lg mx-auto">{children}</div>
      </main>
      <BottomNav />
    </>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <div className="flex flex-col min-h-screen bg-background text-foreground">
            <AppLayoutContent>{children}</AppLayoutContent>
          </div>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
