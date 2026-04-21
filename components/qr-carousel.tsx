'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { X, Maximize2, Ticket, Calendar, MapPin, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CarouselTicket {
  /** Stable key — event id */
  id: string
  eventName: string
  /** ISO timestamp */
  eventDate: string
  eventLocation?: string | null
  qrCode: string
}

interface Props {
  tickets: CarouselTicket[]
  userName: string
}

/**
 * Sort rule: future events ordered by closest upcoming first; past events
 * appended in reverse chronological (most recent past first). Today counts
 * as "future" until end of day so attendees on the day of the event still
 * see their ticket up top.
 */
function sortByProximity(tickets: CarouselTicket[]): CarouselTicket[] {
  const now = Date.now()
  const withTs = tickets.map((t) => ({ ...t, ts: new Date(t.eventDate).getTime() }))
  const future = withTs.filter((t) => t.ts >= now - 12 * 60 * 60 * 1000) // grace of 12h so "today" counts
  const past = withTs.filter((t) => t.ts < now - 12 * 60 * 60 * 1000)
  future.sort((a, b) => a.ts - b.ts)
  past.sort((a, b) => b.ts - a.ts)
  return [...future, ...past]
}

/**
 * Relative-time label: "Esta noche" / "Mañana" / "En N dias" / "Hace N dias" etc.
 * Null when the event is too far away to be useful (e.g. > 1 year).
 */
function relativeLabel(iso: string): string | null {
  const ts = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = ts - now
  const diffDays = Math.round(diffMs / 86400000)

  // Same calendar day
  const nowDate = new Date(now)
  const evDate = new Date(ts)
  const sameDay =
    nowDate.getFullYear() === evDate.getFullYear() &&
    nowDate.getMonth() === evDate.getMonth() &&
    nowDate.getDate() === evDate.getDate()

  if (sameDay) return diffMs >= 0 ? 'Hoy' : 'Hoy'
  if (diffDays === 1) return 'Mañana'
  if (diffDays === -1) return 'Ayer'
  if (diffDays > 1 && diffDays <= 30) return `En ${diffDays} dias`
  if (diffDays < -1 && diffDays >= -30) return `Hace ${Math.abs(diffDays)} dias`
  if (diffDays > 30 && diffDays <= 60) return `En ${Math.ceil(diffDays / 7)} semanas`
  if (diffDays < -30) return null // past events older than a month — no badge
  if (diffDays > 60 && diffDays <= 365) return `En ${Math.round(diffDays / 30)} meses`
  return null
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * QRCarousel — renders one or more event tickets as a horizontal, swipeable
 * panel. Closest upcoming event appears first. With a single ticket the
 * carousel collapses to a single card (no dots, no extra chrome) so
 * attendees with just one event don't see carousel affordances that don't
 * apply to them.
 *
 * Interaction model:
 *   - Swipe/drag to change panel
 *   - Tap panel → fullscreen QR on white bg (max screen brightness)
 *   - Tap a dot → jumps to that panel with smooth scroll
 *
 * The carousel is NOT coupled to the "active event" concept in auth context:
 * swiping only changes which panel is in view. To change the globally active
 * event the user still goes to /events.
 */
export function QRCarousel({ tickets, userName }: Props) {
  const sorted = useMemo(() => sortByProximity(tickets), [tickets])
  const [active, setActive] = useState(0)
  const [fullscreen, setFullscreen] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync active-index with scroll position. Debounce so rapid swipes don't
  // cause dot flicker mid-snap.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        const width = el.clientWidth
        if (width === 0) return
        const idx = Math.round(el.scrollLeft / width)
        setActive(Math.min(Math.max(idx, 0), sorted.length - 1))
      }, 80)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [sorted.length])

  // Prevent body scroll while fullscreen modal is open
  useEffect(() => {
    if (fullscreen === null) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  if (sorted.length === 0) return null

  const scrollTo = (index: number) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: el.clientWidth * index, behavior: 'smooth' })
  }

  const activeTicket = fullscreen !== null ? sorted[fullscreen] : null
  const multi = sorted.length > 1

  return (
    <>
      {/* Fullscreen modal (white bg so the camera can read the QR at max brightness) */}
      {activeTicket && (
        <div
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setFullscreen(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>

          <div className="text-center mb-8">
            <Image
              src="/logo.png"
              alt="Project X"
              width={40}
              height={40}
              className="rounded-xl mx-auto mb-3"
            />
            <h2 className="text-xl font-bold text-gray-900">{activeTicket.eventName}</h2>
            <p className="text-gray-500 text-sm mt-1">
              {formatEventDate(activeTicket.eventDate)}
            </p>
            {userName && <p className="text-gray-400 text-xs mt-0.5">{userName}</p>}
          </div>

          <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100">
            <QRCodeSVG
              value={activeTicket.qrCode}
              size={280}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          <p className="text-gray-400 text-xs mt-6">Muestra este codigo en la entrada</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Header — only shown when there are multiple tickets */}
        {multi && (
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <Ticket className="w-3.5 h-3.5 text-gold" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-white-muted">
                Mis entradas
              </h2>
            </div>
            <span className="text-[10px] tabular-nums text-white-muted">
              {active + 1} <span className="text-white/30">/</span> {sorted.length}
            </span>
          </div>
        )}

        {/* Carousel track */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth -mx-1 px-1"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {sorted.map((t, i) => {
            const badge = relativeLabel(t.eventDate)
            const isFuture = new Date(t.eventDate).getTime() >= Date.now() - 12 * 60 * 60 * 1000
            return (
              <div
                key={t.id}
                className="snap-center flex-none w-full px-1"
                aria-hidden={i !== active}
              >
                <button
                  type="button"
                  onClick={() => setFullscreen(i)}
                  className={cn(
                    'group relative w-full rounded-2xl p-4 text-left overflow-hidden',
                    'bg-gradient-to-br from-[#1a1510] via-[#0e0e0e] to-[#0e0e0e]',
                    'border border-gold/25',
                    'shadow-[0_0_32px_rgba(212,168,67,0.08)]',
                    'active:scale-[0.99] transition-transform',
                    isFuture && 'animate-glow-pulse-gold',
                  )}
                  aria-label={`Ver entrada de ${t.eventName} a pantalla completa`}
                >
                  {/* Decorative gold bloom in the top-right corner */}
                  <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gold/20 blur-3xl" />
                  {/* Decorative gradient hair on top */}
                  <div className="pointer-events-none absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

                  <div className="relative flex items-center gap-4">
                    {/* QR — framed in white with gold glow */}
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-gold/25 blur-xl rounded-xl" aria-hidden />
                      <div className="relative w-[104px] h-[104px] bg-white rounded-xl flex items-center justify-center p-1.5 shadow-[0_4px_24px_rgba(212,168,67,0.2)]">
                        <QRCodeSVG
                          value={t.qrCode}
                          size={92}
                          level="M"
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      {badge && (
                        <div
                          className={cn(
                            'absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap tabular-nums',
                            isFuture
                              ? 'bg-gold text-black shadow-[0_2px_8px_rgba(212,168,67,0.4)]'
                              : 'bg-white/10 text-white-muted border border-white/10',
                          )}
                        >
                          {badge}
                        </div>
                      )}
                    </div>

                    {/* Event info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Ticket className="w-3 h-3 text-gold" />
                        <span className="text-[10px] uppercase tracking-[0.18em] text-gold font-semibold">
                          Tu entrada
                        </span>
                      </div>
                      <h3 className="text-white font-bold text-[15px] leading-tight line-clamp-2">
                        {t.eventName}
                      </h3>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-white-muted text-[11px]">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate capitalize">
                            {formatEventDate(t.eventDate)}
                            <span className="text-white/40"> · {formatEventTime(t.eventDate)}h</span>
                          </span>
                        </div>
                        {t.eventLocation && (
                          <div className="flex items-center gap-1.5 text-white-muted text-[11px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{t.eventLocation}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Maximize2 className="w-3.5 h-3.5 text-gold/50 flex-shrink-0 group-active:text-gold transition-colors" />
                  </div>

                  <p className="relative text-[10px] text-white/35 text-center mt-3 pt-3 border-t border-white/5">
                    Toca para pantalla completa
                  </p>
                </button>
              </div>
            )
          })}
        </div>

        {/* Dots indicator — only if multi */}
        {multi && (
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            {sorted.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollTo(i)}
                className={cn(
                  'rounded-full transition-all duration-300',
                  i === active
                    ? 'w-6 h-1.5 bg-gold'
                    : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40',
                )}
                aria-label={`Ir a entrada ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
