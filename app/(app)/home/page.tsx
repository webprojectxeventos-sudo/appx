'use client'

import { useEffect, useState } from 'react'
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
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { QRTicketCard } from '@/components/qr-ticket'
import dynamic from 'next/dynamic'

const EventMap = dynamic(() => import('@/components/event-map').then(m => ({ default: m.EventMap })), { ssr: false })

const SOCIAL_LINKS = {
  instagram: 'https://instagram.com/tugraduacionmadrid',
  tiktok: 'https://tiktok.com/@tugraduacionmadrid',
}

interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
}

interface Announcement {
  id: string
  content: string
  created_at: string
  user_name: string
  is_general?: boolean
}

export default function HomePage() {
  const { user, profile, event, venue, loading } = useAuth()
  const heroImage = event?.cover_image_url || venue?.image_url || null
  const [countdown, setCountdown] = useState<Countdown>({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [hasDrinkOrder, setHasDrinkOrder] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [eventPassed, setEventPassed] = useState(false)
  const [schedule, setSchedule] = useState<{ id: string; title: string; start_time: string; end_time: string | null; icon: string }[]>([])


  // Countdown
  useEffect(() => {
    if (!event?.date) return
    const updateCountdown = () => {
      const diff = new Date(event.date).getTime() - Date.now()
      if (diff > 0) {
        setEventPassed(false)
        setCountdown({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / (1000 * 60)) % 60),
          seconds: Math.floor((diff / 1000) % 60),
        })
      } else {
        setEventPassed(true)
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 })
      }
    }
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [event?.date])

  // Fetch announcements (event-scoped + venue general)
  useEffect(() => {
    if (!event?.id) return
    let cancelled = false
    const fetchAnnouncements = async () => {
      // Event-scoped announcements
      const eventQuery = supabase
        .from('messages')
        .select('id, content, created_at, user_id, is_general')
        .eq('event_id', event.id)
        .eq('is_announcement', true)
        .order('created_at', { ascending: false })
        .limit(3)

      const { data: eventMsgs } = await eventQuery
      if (cancelled) return

      // Venue general announcements
      let venueMsgs: typeof eventMsgs = []
      if (venue?.id) {
        const { data } = await supabase
          .from('messages')
          .select('id, content, created_at, user_id, is_general')
          .eq('venue_id', venue.id)
          .eq('is_general', true)
          .eq('is_announcement', true)
          .order('created_at', { ascending: false })
          .limit(3)
        if (!cancelled && data) venueMsgs = data
      }

      if (cancelled) return

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
    const channel = supabase.channel(`home-announcements-${event.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${event.id}` }, () => fetchAnnouncements()).subscribe()
    // Also subscribe to venue general messages
    const venueChannel = venue?.id
      ? supabase.channel(`home-venue-announcements-${venue.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `venue_id=eq.${venue.id}` }, () => fetchAnnouncements()).subscribe()
      : null
    return () => { cancelled = true; supabase.removeChannel(channel); if (venueChannel) supabase.removeChannel(venueChannel) }
  }, [event?.id, venue?.id])

  // Check drink order, ticket, and schedule
  useEffect(() => {
    if (!event?.id || !user?.id) return
    let cancelled = false
    supabase.from('drink_orders').select('id').eq('event_id', event.id).eq('user_id', user.id).single().then(({ data }) => {
      if (cancelled) return
      setHasDrinkOrder(!!data)
    })
    supabase.from('tickets').select('qr_code').eq('event_id', event.id).eq('user_id', user.id).single().then(({ data }) => {
      if (cancelled) return
      if (data?.qr_code) setQrCode(data.qr_code)
    })
    supabase.from('event_schedule').select('id, title, start_time, end_time, icon').eq('event_id', event.id).order('start_time', { ascending: true }).then(({ data }) => {
      if (cancelled) return
      if (data) setSchedule(data)
    })
    return () => { cancelled = true }
  }, [event?.id, user?.id])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const timeAgo = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'Ahora'
    if (mins < 60) return `${mins}min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  if (loading) {
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
            <img src={heroImage} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
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

      {/* Countdown */}
      {!eventPassed ? (
        <div className="card-glow p-4 animate-glow-pulse">
          <p className="text-accent-gradient text-sm font-semibold text-center mb-3">
            Faltan {countdown.days} dias
          </p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { v: countdown.days, l: 'Dias' },
              { v: countdown.hours, l: 'Horas' },
              { v: countdown.minutes, l: 'Min' },
              { v: countdown.seconds, l: 'Seg' },
            ].map((item, i) => (
              <div key={i} className="bg-white/[0.04] rounded-xl p-3 text-center">
                <div className="text-3xl font-bold tabular-nums text-gradient-primary">{String(item.v).padStart(2, '0')}</div>
                <div className="text-[9px] uppercase tracking-[0.2em] text-gold mt-1 font-medium">{item.l}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card-glow p-5 text-center animate-glow-pulse">
          <Sparkles className="w-6 h-6 mx-auto mb-2 text-gold" />
          <p className="font-bold text-white text-lg">La fiesta ya ha empezado!</p>
        </div>
      )}

      {/* Ticket / Complete Order Banner */}
      {qrCode ? (
        <QRTicketCard
          qrCode={qrCode}
          userName={profile?.full_name || ''}
          eventName={event.title}
        />
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
      <div className="grid grid-cols-3 gap-2.5">
        <Link href="/polls" className="card-glow p-4 text-center active:scale-[0.92] transition-transform animate-scale-in">
          <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center ${hasDrinkOrder ? 'bg-emerald-500/15' : 'bg-gradient-to-br from-primary/15 to-primary/5'}`}>
            {hasDrinkOrder ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <GlassWater className="w-5 h-5 text-primary" />
            )}
          </div>
          <p className="text-xs font-medium text-white">{hasDrinkOrder ? 'Pedido listo' : 'Bebidas'}</p>
        </Link>
        <Link href="/gallery" className="card-glow p-4 text-center active:scale-[0.92] transition-transform animate-scale-in delay-100">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5">
            <ImageIcon className="w-5 h-5 text-gold" />
          </div>
          <p className="text-xs font-medium text-white">Galeria</p>
        </Link>
        <Link href="/chat" className="card-glow p-4 text-center active:scale-[0.92] transition-transform animate-scale-in delay-200">
          <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center bg-gradient-to-br from-violet-500/15 to-violet-500/5">
            <MessageCircle className="w-5 h-5 text-violet-400" />
          </div>
          <p className="text-xs font-medium text-white">Chat</p>
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
        {event.location && (
          <div className="flex items-center gap-4 p-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-gold/15 to-gold/5 flex-shrink-0">
              <MapPin className="w-5 h-5 text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white-muted">Ubicacion</p>
              <p className="text-white text-sm font-medium truncate">{event.location}</p>
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

      {/* Map */}
      {event.latitude && event.longitude && event.location && (
        <EventMap latitude={event.latitude} longitude={event.longitude} location={event.location} />
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
