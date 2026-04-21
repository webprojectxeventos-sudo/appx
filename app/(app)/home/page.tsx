'use client'

import { useEffect, useMemo, useState, useRef, memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  MapPin,
  Calendar,
  GlassWater,
  ImageIcon,
  MessageCircle,
  Megaphone,
  Music2,
  Clock,
  Sparkles,
  ChevronRight,
  Check,
  Users,
  Share2,
  ShieldCheck,
  ListChecks,
  FileDown,
  Play,
  Film,
  Ticket,
  Plus,
} from 'lucide-react'

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function UberIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
      <path d="M0 0h24v24H0z" fill="none"/>
      <path d="M3 6.5V14c0 3.87 3.13 7 7 7h4c3.87 0 7-3.13 7-7V6.5h-3.5V14c0 1.93-1.57 3.5-3.5 3.5h-4C8.57 17.5 7 15.93 7 14V6.5H3z"/>
    </svg>
  )
}

function CabifyIcon() {
  return (
    <svg viewBox="0 0 800 800" className="w-6 h-6" fill="white">
      <path d="M400 90C229 90 90 229 90 400s139 310 310 310 310-139 310-310S571 90 400 90zm120 370c0 66-54 120-120 120s-120-54-120-120V340c0-11 9-20 20-20h40c11 0 20 9 20 20v120c0 22 18 40 40 40s40-18 40-40V340c0-11 9-20 20-20h40c11 0 20 9 20 20v120z"/>
    </svg>
  )
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="black">
      <path d="M13 2L4.09 12.63c-.1.13-.16.28-.09.42.07.14.2.2.35.2H11l-2 8.75c-.04.18.04.34.18.42.14.08.3.04.42-.08L19.91 11.37c.1-.13.16-.28.09-.42-.07-.14-.2-.2-.35-.2H13l2-8.75c.04-.18-.04-.34-.18-.42-.14-.08-.3-.04-.42.08L13 2z"/>
    </svg>
  )
}
import { cn, toLocalDateKey } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { QRCarousel, type CarouselTicket } from '@/components/qr-carousel'
import dynamic from 'next/dynamic'

const EventMap = dynamic(() => import('@/components/event-map').then(m => ({ default: m.EventMap })), { ssr: false })

const SOCIAL_LINKS = {
  instagram: 'https://instagram.com/tugraduacionmadrid',
  tiktok: 'https://tiktok.com/@tugraduacionmadrid',
}

const WEATHER_INFO: Record<number, { emoji: string; label: string }> = {
  0: { emoji: '☀️', label: 'Despejado' },
  1: { emoji: '🌤️', label: 'Mayormente despejado' },
  2: { emoji: '⛅', label: 'Parcialmente nublado' },
  3: { emoji: '☁️', label: 'Nublado' },
  45: { emoji: '🌫️', label: 'Niebla' },
  48: { emoji: '🌫️', label: 'Niebla' },
  51: { emoji: '🌦️', label: 'Llovizna ligera' },
  53: { emoji: '🌦️', label: 'Llovizna' },
  55: { emoji: '🌧️', label: 'Llovizna fuerte' },
  61: { emoji: '🌧️', label: 'Lluvia ligera' },
  63: { emoji: '🌧️', label: 'Lluvia' },
  65: { emoji: '🌧️', label: 'Lluvia fuerte' },
  71: { emoji: '❄️', label: 'Nieve ligera' },
  73: { emoji: '❄️', label: 'Nieve' },
  75: { emoji: '❄️', label: 'Nieve fuerte' },
  80: { emoji: '🌦️', label: 'Chubascos' },
  81: { emoji: '🌧️', label: 'Chubascos fuertes' },
  82: { emoji: '⛈️', label: 'Chubascos intensos' },
  95: { emoji: '⛈️', label: 'Tormenta' },
  96: { emoji: '⛈️', label: 'Tormenta con granizo' },
  99: { emoji: '⛈️', label: 'Tormenta con granizo' },
}

interface Announcement {
  id: string
  content: string
  created_at: string
  user_name: string
  is_general?: boolean
}

// Zero-re-render countdown: uses refs + direct DOM updates instead of setState
const CountdownTimer = memo(function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [passed, setPassed] = useState(() => new Date(targetDate).getTime() <= Date.now())
  const daysRef = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLDivElement>(null)
  const minsRef = useRef<HTMLDivElement>(null)
  const secsRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const target = new Date(targetDate).getTime()
    if (target <= Date.now()) { setPassed(true); return }

    let intervalId: ReturnType<typeof setInterval>
    const update = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setPassed(true)
        clearInterval(intervalId)
        return
      }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff / 3600000) % 24)
      const m = Math.floor((diff / 60000) % 60)
      const s = Math.floor((diff / 1000) % 60)
      if (daysRef.current) daysRef.current.textContent = String(d).padStart(2, '0')
      if (hoursRef.current) hoursRef.current.textContent = String(h).padStart(2, '0')
      if (minsRef.current) minsRef.current.textContent = String(m).padStart(2, '0')
      if (secsRef.current) secsRef.current.textContent = String(s).padStart(2, '0')
      if (labelRef.current) labelRef.current.textContent = `Faltan ${d} dias`
    }
    update()
    intervalId = setInterval(update, 1000)
    return () => clearInterval(intervalId)
  }, [targetDate])

  if (passed) {
    return (
      <div className="card-glow p-5 text-center animate-glow-pulse">
        <Sparkles className="w-6 h-6 mx-auto mb-2 text-gold" />
        <p className="font-bold text-white text-lg">La fiesta ya ha empezado!</p>
      </div>
    )
  }

  return (
    <div className="card-glow p-4 animate-glow-pulse">
      <p ref={labelRef} className="text-accent-gradient text-sm font-semibold text-center mb-3">
        Cargando...
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[
          { ref: daysRef, label: 'Dias' },
          { ref: hoursRef, label: 'Horas' },
          { ref: minsRef, label: 'Min' },
          { ref: secsRef, label: 'Seg' },
        ].map((item, i) => (
          <div key={i} className="bg-white/[0.04] rounded-xl p-3 text-center">
            <div ref={item.ref} className="text-3xl font-bold tabular-nums text-gradient-primary">--</div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-gold mt-1 font-medium">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default function HomePage() {
  const { user, profile, event, venue, loading } = useAuth()
  const heroImageUrl = event?.cover_image_url || venue?.image_url || null
  const [heroFailed, setHeroFailed] = useState(false)
  const heroImage = heroImageUrl && !heroFailed ? heroImageUrl : null

  // Reset error state when the image URL changes (e.g. switching events)
  useEffect(() => { setHeroFailed(false) }, [heroImageUrl])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [hasDrinkOrder, setHasDrinkOrder] = useState(false)
  // Tickets across ALL of the user's events — drives the home QR carousel.
  // The checklist (that needs the active event's QR) derives `qrCode` from here
  // so we only pay for one fetch instead of two.
  const [tickets, setTickets] = useState<CarouselTicket[]>([])
  const qrCode = useMemo(
    () => tickets.find((t) => t.id === event?.id)?.qrCode ?? null,
    [tickets, event?.id],
  )
  const [schedule, setSchedule] = useState<{ id: string; title: string; start_time: string; end_time: string | null; icon: string }[]>([])
  const [attendeeCount, setAttendeeCount] = useState(0)
  const [weather, setWeather] = useState<{ max: number; min: number; code: number } | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})


  // Fetch announcements (event-scoped + venue general)
  useEffect(() => {
    if (!event?.id) return
    let cancelled = false
    const fetchAnnouncements = async () => {
      // Fetch event-scoped and venue general announcements in parallel
      const eventQuery = supabase
        .from('messages')
        .select('id, content, created_at, user_id, is_general')
        .eq('event_id', event.id)
        .eq('is_announcement', true)
        .order('created_at', { ascending: false })
        .limit(3)

      const venueQuery = venue?.id
        ? supabase
            .from('messages')
            .select('id, content, created_at, user_id, is_general')
            .eq('venue_id', venue.id)
            .eq('is_general', true)
            .eq('is_announcement', true)
            .order('created_at', { ascending: false })
            .limit(3)
        : null

      const [eventResult, venueResult] = await Promise.all([
        eventQuery,
        venueQuery || Promise.resolve({ data: null }),
      ])
      if (cancelled) return

      const eventMsgs = eventResult.data
      const venueMsgs = venueResult.data || []

      // Merge and sort by date, take top 3
      const allMsgs = [...(eventMsgs || []), ...(venueMsgs || [])]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3)

      const userIds = [...new Set(allMsgs.map((m) => m.user_id))]
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)
        if (cancelled) return
        const nameMap: Record<string, string> = {}
        users?.forEach((u) => (nameMap[u.id] = u.full_name || 'Admin'))
        setAnnouncements(allMsgs.map((m) => ({
          id: m.id, content: m.content, created_at: m.created_at,
          user_name: nameMap[m.user_id] || 'Admin',
          is_general: m.is_general ?? false,
        })))
      } else {
        setAnnouncements([])
      }
    }
    fetchAnnouncements()
    // Single channel for both event and venue announcements
    let channel = supabase.channel(`home-announcements-${event.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${event.id}` }, () => fetchAnnouncements())
    if (venue?.id) {
      channel = channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `venue_id=eq.${venue.id}` }, () => fetchAnnouncements())
    }
    channel.subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [event?.id, venue?.id])

  // Check drink order and schedule for the ACTIVE event (these are event-scoped
  // and change when the user switches events). Tickets across all events are
  // fetched in a separate effect so they survive event switches.
  useEffect(() => {
    if (!event?.id || !user?.id) return
    let cancelled = false
    Promise.all([
      supabase.from('drink_orders').select('id').eq('event_id', event.id).eq('user_id', user.id).single(),
      supabase.from('event_schedule').select('id, title, start_time, end_time, icon').eq('event_id', event.id).order('start_time', { ascending: true }),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    ]).then(([drinkRes, scheduleRes, countRes]) => {
      if (cancelled) return
      setHasDrinkOrder(!!drinkRes.data)
      if (scheduleRes.data) setSchedule(scheduleRes.data)
      setAttendeeCount(countRes.count ?? 0)
    })
    return () => { cancelled = true }
  }, [event?.id, user?.id])

  // Load ALL user tickets with joined event info. Powers the swipeable QR
  // carousel: un usuario puede tener N entradas (p.ej. dos graduaciones) y
  // queremos mostrar todas ordenadas por cercania sin obligarle a cambiar
  // de evento activo.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    supabase
      .from('tickets')
      .select('qr_code, event_id, events!inner(id, title, date, location)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled || !data) return
        const mapped: CarouselTicket[] = []
        for (const row of data as unknown as Array<{
          qr_code: string | null
          event_id: string
          events: { id: string; title: string; date: string; location: string | null } | null
        }>) {
          if (!row.qr_code || !row.events) continue
          mapped.push({
            id: row.events.id,
            eventName: row.events.title,
            eventDate: row.events.date,
            eventLocation: row.events.location,
            qrCode: row.qr_code,
          })
        }
        setTickets(mapped)
      })
    return () => { cancelled = true }
  }, [user?.id])

  // Fetch weather forecast for event day (OpenMeteo — free, no API key)
  useEffect(() => {
    if (!venue?.latitude || !venue?.longitude || !event?.date) return
    const daysUntil = (new Date(event.date).getTime() - Date.now()) / 86400000
    if (daysUntil < 0 || daysUntil > 14) return // forecast limit 14 days
    const dateStr = toLocalDateKey(event.date)
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${venue.latitude}&longitude=${venue.longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Madrid&start_date=${dateStr}&end_date=${dateStr}`)
      .then(r => r.json())
      .then(data => {
        if (data.daily) {
          setWeather({
            max: Math.round(data.daily.temperature_2m_max[0]),
            min: Math.round(data.daily.temperature_2m_min[0]),
            code: data.daily.weathercode[0],
          })
        }
      })
      .catch(() => {})
  }, [venue?.latitude, venue?.longitude, event?.date])

  // Checklist — load from localStorage
  useEffect(() => {
    if (!event?.id) return
    try {
      const saved = localStorage.getItem(`px-checklist-${event.id}`)
      if (saved) setChecks(JSON.parse(saved))
    } catch {}
  }, [event?.id])

  const toggleCheck = (id: string) => {
    if (!event?.id) return
    setChecks(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem(`px-checklist-${event.id}`, JSON.stringify(next))
      return next
    })
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  // Authorization download (for minors) — ESO or Bachillerato based on group_name
  const isESO = (event?.group_name || '').toLowerCase().includes('eso')
  const authPdf = isESO ? '/autorizacion-eso.pdf' : '/autorizacion-bachillerato.pdf'
  const authLabel = isESO ? 'Autorizacion fiesta ESO' : 'Autorizacion fiesta Bachillerato'

  // Download handler that works inside iOS WKWebView (Capacitor).
  // Uses navigator.share() with File to trigger the native share sheet
  // (so user can save to Files, send via WhatsApp, etc.) and falls back
  // to a blob-URL download on the web.
  const handleDownloadAuth = async () => {
    try {
      const res = await fetch(authPdf)
      const blob = await res.blob()
      const fileName = `${authLabel}.pdf`
      const file = new File([blob], fileName, { type: 'application/pdf' })

      // Prefer native share sheet when available (iOS/Android)
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: authLabel })
          return
        } catch (err: unknown) {
          // User cancelled — don't fall through to blob download
          if (err instanceof Error && err.name === 'AbortError') return
        }
      }

      // Fallback: blob-URL download (web browsers)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      // Last-resort fallback: open in new tab
      window.open(authPdf, '_blank', 'noopener,noreferrer')
    }
  }
  // Stable timestamp (initialized once via state, avoids impure render)
  const [now] = useState(() => Date.now())
  const timeAgo = (d: string) => {
    const mins = Math.floor((now - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'Ahora'
    if (mins < 60) return `${mins}min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  // Show skeleton while auth loads OR event data is still arriving from background
  const eventStillLoading = !loading && !event && !!profile?.event_id
  if (loading || eventStillLoading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="rounded-2xl bg-black-card animate-pulse" style={{ height: '200px' }} />
        <div className="grid grid-cols-4 gap-2">
          {[0,1,2,3].map(i => <div key={i} className="card p-3 h-[72px] animate-pulse" />)}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[0,1,2].map(i => <div key={i} className="card p-4 h-[80px] animate-pulse" />)}
        </div>
      </div>
    )
  }
  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Bienvenido</h1>
          <p className="text-white mb-1">No tienes un evento asignado</p>
          <p className="text-sm text-white-muted">Pidele a un administrador que te asigne</p>
        </div>
      </div>
    )
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'amigo'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero */}
      <div className="relative rounded-2xl overflow-hidden" style={{ height: '240px' }}>
        {heroImage ? (
          <>
            <img src={heroImage} alt={event.title} className="absolute inset-0 w-full h-full object-cover" onError={() => setHeroFailed(true)} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-[#0a0a0a]/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-[#0a0a0a] to-gold/5" />
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-5 animate-blur-in">
          <p className="text-white-muted text-sm">
            Hola, <span className="text-accent-gradient font-semibold">{firstName}</span> 👋
          </p>
          <h1 className="text-3xl font-bold text-white leading-tight mt-0.5 tracking-tight">
            {event.title}
          </h1>
        </div>
        {/* Decorative gradient line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      {/* Aftermovie — shows when admin sets video_url */}
      {(event as any).video_url && (() => {
        const url = (event as any).video_url as string
        // Extract YouTube embed ID
        const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/)
        const ytId = ytMatch?.[1]
        return (
          <div className="card-glow overflow-hidden animate-slide-up">
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center">
                <Film className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Aftermovie</h2>
                <p className="text-[10px] text-white-muted">Revive los mejores momentos</p>
              </div>
            </div>
            {ytId ? (
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1`}
                  title="Aftermovie"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            ) : (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block mx-4 mb-4 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] group"
              >
                <div className="flex items-center justify-center py-10">
                  <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 text-primary ml-0.5" />
                  </div>
                </div>
                <p className="text-center text-xs text-white-muted pb-4">Toca para ver el aftermovie</p>
              </a>
            )}
          </div>
        )
      })()}

      {/* Countdown — zero re-render component */}
      {event.date && <CountdownTimer targetDate={event.date} />}

      {/* Checklist — 24h before event */}
      {(() => {
        const hoursUntil = event.date ? (new Date(event.date).getTime() - Date.now()) / 3600000 : Infinity
        if (hoursUntil <= 0 || hoursUntil > 24) return null
        const items = [
          { id: 'dni', label: 'DNI / Documento de identidad', sub: 'Imprescindible para entrar' },
          { id: 'entrada', label: 'Entrada', sub: qrCode ? 'Ya tienes tu QR listo' : 'Asegurate de tener tu entrada', auto: !!qrCode },
          { id: 'autorizacion', label: `${authLabel} (menores)`, sub: 'Impresa y firmada por padre/madre/tutor' },
          { id: 'fotocopia', label: 'Fotocopia DNI del padre/madre/tutor', sub: 'Del que firme la autorizacion' },
        ]
        const completed = items.filter(it => it.auto || checks[it.id]).length
        return (
          <div className="card-glow p-5 space-y-4 animate-slide-up animate-glow-pulse">
            {/* Warm message */}
            <div className="text-center pb-2 border-b border-white/5">
              <p className="text-2xl mb-2">🎉</p>
              <p className="text-sm font-bold text-white mb-1">¡Vuestra fiesta es mañana!</p>
              <p className="text-[12px] text-white-muted leading-relaxed max-w-[280px] mx-auto">
                Disfrutad mucho de la ceremonia, es un dia muy especial. Para que todo salga perfecto, asegurate de llevar todo preparado.
              </p>
            </div>

            {/* Checklist header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary" />
                <p className="text-sm font-bold text-white">¿Lo tienes todo?</p>
              </div>
              <span className={cn(
                'text-xs font-bold px-2.5 py-1 rounded-full',
                completed === items.length ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white-muted'
              )}>
                {completed}/{items.length}
              </span>
            </div>

            {/* Checklist items */}
            <div className="space-y-1">
              {items.map(item => {
                const done = item.auto || checks[item.id]
                return (
                  <button
                    key={item.id}
                    onClick={() => !item.auto && toggleCheck(item.id)}
                    className="flex items-center gap-3 w-full text-left p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors active:scale-[0.98]"
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                      done ? 'bg-emerald-500 border-emerald-500 scale-100' : 'border-white/20 scale-100'
                    )}>
                      {done && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className={cn('text-sm transition-all', done ? 'text-white-muted line-through' : 'text-white font-medium')}>
                        {item.label}
                      </p>
                      <p className="text-[10px] text-white-muted">{item.sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Physical documents warning */}
            <div className="p-3 rounded-xl bg-yellow-500/[0.07] border border-yellow-500/20">
              <p className="text-[11px] font-bold text-yellow-400 mb-1">⚠️ TODO EN FISICO</p>
              <p className="text-[11px] text-white-muted leading-relaxed">
                El DNI, la autorizacion y la fotocopia tienen que estar <span className="text-white font-medium">impresos en papel</span>. No se aceptan fotos ni documentos en el movil.
              </p>
            </div>

            {/* Download authorization */}
            <button
              onClick={handleDownloadAuth}
              className="flex items-center gap-3 w-full p-3 rounded-xl bg-primary/10 border border-primary/20 active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <FileDown className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Descargar autorizacion</p>
                <p className="text-[10px] text-white-muted">{authLabel} — PDF</p>
              </div>
            </button>
          </div>
        )
      })()}

      {/* Ticket carousel / Complete Order Banner.
          - Si el usuario tiene entradas, mostramos TODAS en un carousel
            deslizable ordenadas por cercania (la mas proxima primero).
          - Si no tiene ninguna y aun no ha hecho el pedido, le invitamos a
            completarlo.
          - Si ya ha pedido bebidas pero el ticket esta generandose, no
            mostramos nada (se hidrata cuando termine la generacion). */}
      {tickets.length > 0 ? (
        <QRCarousel tickets={tickets} userName={profile?.full_name || ''} />
      ) : !hasDrinkOrder ? (
        <Link href="/polls" className="card-glow p-4 flex items-center gap-3 active:scale-[0.98] transition-transform animate-glow-pulse">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
            <GlassWater className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Completa tu pedido</p>
            <p className="text-xs text-white-muted">Elige tus bebidas para obtener tu entrada</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white-muted" />
        </Link>
      ) : null}

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2">
        <Link href="/polls" className="card-glow p-3.5 text-center active:scale-[0.92] transition-transform animate-scale-in">
          <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${hasDrinkOrder ? 'bg-emerald-500/15' : 'bg-gradient-to-br from-primary/15 to-primary/5'}`}>
            {hasDrinkOrder ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <GlassWater className="w-5 h-5 text-primary" />
            )}
          </div>
          <p className="text-[11px] font-medium text-white">{hasDrinkOrder ? 'Pedido' : 'Bebidas'}</p>
        </Link>
        <Link href="/gallery" className="card-glow p-3.5 text-center active:scale-[0.92] transition-transform animate-scale-in delay-100">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5">
            <ImageIcon className="w-5 h-5 text-gold" />
          </div>
          <p className="text-[11px] font-medium text-white">Galeria</p>
        </Link>
        <Link href="/chat" className="card-glow p-3.5 text-center active:scale-[0.92] transition-transform animate-scale-in delay-200">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-violet-500/5">
            <MessageCircle className="w-5 h-5 text-violet-400" />
          </div>
          <p className="text-[11px] font-medium text-white">Chat</p>
        </Link>
        <Link href="/playlist" className="card-glow p-3.5 text-center active:scale-[0.92] transition-transform animate-scale-in delay-300">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-br from-cyan-500/15 to-cyan-500/5">
            <Music2 className="w-5 h-5 text-cyan-400" />
          </div>
          <p className="text-[11px] font-medium text-white">Playlist</p>
        </Link>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted">Anuncios</h2>
            </div>
            <Link href="/chat" className="text-[11px] text-white-muted flex items-center gap-0.5 hover:text-white transition-colors">
              Ver todo <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {announcements.map((a, i) => (
              <div key={a.id} className={cn('card p-4 animate-slide-right', a.is_general ? 'border-violet-400/15 border-l-2 border-l-violet-400/40' : 'border-primary/10 border-l-2 border-l-primary/30')} style={{ animationDelay: `${i * 80}ms` }}>
                <p className="text-white text-[13px] leading-relaxed">{a.content}</p>
                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white-muted">{a.user_name}</span>
                    {a.is_general && <span className="text-[9px] font-medium text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded-full">General</span>}
                  </div>
                  <span className="text-[11px] text-white-muted">{timeAgo(a.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Info */}
      <div className="card-gold divide-y divide-white/5">
        {(event.location || venue?.address) && (
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5 flex-shrink-0">
              <MapPin className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white-muted">Ubicacion</p>
              <p className="text-white text-sm font-medium truncate">{event.location || venue?.address}</p>
              {venue?.city && <p className="text-[11px] text-white-muted truncate">{venue.city}</p>}
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5 flex-shrink-0">
            <Calendar className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white-muted">Fecha</p>
            <p className="text-white text-sm font-medium capitalize">{formatDate(event.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5 flex-shrink-0">
            <Clock className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white-muted">Hora</p>
            <p className="text-white text-sm font-medium">{formatTime(event.date)}h</p>
          </div>
        </div>
      </div>

      {/* Authorization download — always visible (for minors) */}
      <button
        onClick={handleDownloadAuth}
        className="card p-4 flex items-center gap-3 w-full text-left active:scale-[0.98] transition-transform border-primary/15 hover:border-primary/30"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <FileDown className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Autorizacion para menores</p>
          <p className="text-[11px] text-white-muted leading-snug">
            {authLabel} — descarga, firma e imprime
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-white-muted flex-shrink-0" />
      </button>

      {/* Weather forecast */}
      {weather && (() => {
        const w = WEATHER_INFO[weather.code] || { emoji: '🌡️', label: 'Sin datos' }
        return (
          <div className="card p-4 flex items-center gap-4 animate-slide-up">
            <div className="text-4xl leading-none">{w.emoji}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">El tiempo para tu fiesta</p>
              <p className="text-[11px] text-white-muted">{w.label} · Max {weather.max}° / Min {weather.min}°</p>
            </div>
            <p className="text-2xl font-bold text-white tabular-nums">{weather.max}°</p>
          </div>
        )
      })()}

      {/* Map — Como llegar */}
      {venue?.latitude && venue?.longitude && (event.location || venue?.address) && (
        <EventMap latitude={venue.latitude} longitude={venue.longitude} location={event.location || venue.address || ''} />
      )}

      {/* Timeline */}
      {schedule.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted">Programa</h2>
          </div>
          <div className="space-y-0">
            {schedule.map((item, i) => {
              const time = new Date(item.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
              const now = new Date()
              const start = new Date(item.start_time)
              const end = item.end_time ? new Date(item.end_time) : null
              const isCurrent = now >= start && (!end || now <= end)
              const isPast = end ? now > end : (schedule[i + 1] ? now > new Date(schedule[i + 1].start_time) : false)

              return (
                <div key={item.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5',
                      isCurrent ? 'bg-primary ring-4 ring-primary/20' : isPast ? 'bg-white/20' : 'bg-white/10'
                    )} />
                    {i < schedule.length - 1 && <div className="w-px flex-1 bg-white/10 my-1" />}
                  </div>
                  <div className={cn('pb-4', isCurrent && 'pb-5')}>
                    <p className={cn('text-[11px] tabular-nums', isCurrent ? 'text-primary font-semibold' : 'text-white-muted')}>{time}</p>
                    <p className={cn('text-sm font-medium', isCurrent ? 'text-white' : isPast ? 'text-white-muted' : 'text-white')}>{item.title}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div className="card p-4">
          <p className="text-white-muted text-sm leading-relaxed">{event.description}</p>
        </div>
      )}

      {/* Volver a casa seguro */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted">Volver a casa seguro</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a
            href={`https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${venue?.latitude || ''}&pickup[longitude]=${venue?.longitude || ''}&pickup[nickname]=${encodeURIComponent(venue?.name || 'Venue')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="card p-3 flex flex-col items-center gap-2 active:scale-95 transition-all hover:border-white/15 text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center flex-shrink-0 border border-white/10">
              <UberIcon />
            </div>
            <p className="text-white text-xs font-medium">Uber</p>
          </a>
          <a
            href="https://cabify.com/app"
            target="_blank"
            rel="noopener noreferrer"
            className="card p-3 flex flex-col items-center gap-2 active:scale-95 transition-all hover:border-white/15 text-center"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#7B4FFC' }}>
              <CabifyIcon />
            </div>
            <p className="text-white text-xs font-medium">Cabify</p>
          </a>
          <a
            href="https://m.bolt.eu/"
            target="_blank"
            rel="noopener noreferrer"
            className="card p-3 flex flex-col items-center gap-2 active:scale-95 transition-all hover:border-white/15 text-center"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#34D186' }}>
              <BoltIcon />
            </div>
            <p className="text-white text-xs font-medium">Bolt</p>
          </a>
        </div>
      </div>

      {/* Mis eventos — entry point para canjear otro codigo */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Ticket className="w-4 h-4 text-gold" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted">Mis eventos</h2>
        </div>
        <Link
          href="/events"
          className="card p-4 flex items-center gap-3 active:scale-95 transition-all hover:border-white/15"
        >
          <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 border border-gold/25 flex items-center justify-center flex-shrink-0">
            <Ticket className="w-5 h-5 text-gold" strokeWidth={2} />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gold/90 text-black text-[9px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(212,168,67,0.4)]">
              <Plus className="w-2.5 h-2.5" strokeWidth={3.5} />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium leading-tight">Tengo otro codigo</p>
            <p className="text-white-muted text-[11px] mt-0.5 leading-snug">Anade otra graduacion o fiesta</p>
          </div>
          <ChevronRight className="w-4 h-4 text-white-muted flex-shrink-0" />
        </Link>
      </div>

      {/* Social Links */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted mb-3">Siguenos</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-3.5 active:scale-95 transition-all hover:shadow-[0_0_20px_rgba(131,58,180,0.15)]">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #833AB4, #FD1D1D, #F77737)' }}>
              <InstagramIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Instagram</p>
              <p className="text-white-muted text-[10px] truncate">@tugraduacionmadrid</p>
            </div>
          </a>
          <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" className="card flex items-center gap-3 p-3.5 active:scale-95 transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.08)]">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-black border border-white/10">
              <Music2 className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">TikTok</p>
              <p className="text-white-muted text-[10px] truncate">@tugraduacionmadrid</p>
            </div>
          </a>
        </div>
      </div>

      <div className="h-2" />
    </div>
  )
}
