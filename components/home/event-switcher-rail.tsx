'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useHomeEvent } from './home-event-context'

/**
 * EventSwitcherRail — horizontal pills above the hero.
 *
 * Only renders when the user has more than one event — otherwise we hide it
 * to keep the home as clean as the single-event case.
 *
 * Tap-to-switch is the baseline interaction here; swipe on the panel itself
 * (added in Phase 2) will also drive this component via context.
 */
export function EventSwitcherRail() {
  const { availableEvents, viewedEventId, setViewedEventId, syncing } = useHomeEvent()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Keep the active pill in view as the user switches events (tap or swipe).
  useEffect(() => {
    if (!activeRef.current || !scrollRef.current) return
    const pill = activeRef.current
    const scroll = scrollRef.current
    const pillLeft = pill.offsetLeft
    const pillRight = pillLeft + pill.offsetWidth
    const scrollLeft = scroll.scrollLeft
    const scrollRight = scrollLeft + scroll.offsetWidth
    const padding = 24
    if (pillLeft < scrollLeft + padding) {
      scroll.scrollTo({ left: pillLeft - padding, behavior: 'smooth' })
    } else if (pillRight > scrollRight - padding) {
      scroll.scrollTo({
        left: pillRight - scroll.offsetWidth + padding,
        behavior: 'smooth',
      })
    }
  }, [viewedEventId])

  if (availableEvents.length <= 1) return null

  return (
    <div className="-mx-4 pb-1">
      {/* Non-sticky on purpose: the app header already occupies top-0 and
          stacking two sticky rails produces weird behaviour. The swipe
          gesture works regardless of scroll position, so the rail is just
          a discovery aid at the top of the page. */}
      <div className="relative">
        <div
          className="absolute left-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, rgba(10,10,10,1), rgba(10,10,10,0))',
          }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to left, rgba(10,10,10,1), rgba(10,10,10,0))',
          }}
        />
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto px-4 scrollbar-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {availableEvents.map((ev, idx) => {
            const active = ev.id === viewedEventId
            return (
              <button
                key={ev.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => setViewedEventId(ev.id)}
                className={cn(
                  'group flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full transition-all duration-200 active:scale-[0.97]',
                  active
                    ? 'bg-gradient-to-br from-primary/25 via-primary/15 to-gold/15 border border-gold/40 shadow-[0_0_20px_rgba(212,168,67,0.2)]'
                    : 'bg-white/[0.04] border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06]',
                )}
                aria-current={active ? 'true' : undefined}
                aria-label={`Ver ${ev.title}`}
              >
                {/* Pulsing dot — only for active */}
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors',
                    active
                      ? 'bg-gold shadow-[0_0_6px_rgba(212,168,67,0.8)]'
                      : 'bg-white/25',
                  )}
                />
                <div className="flex flex-col items-start leading-tight">
                  <span
                    className={cn(
                      'text-[11px] font-semibold tracking-tight whitespace-nowrap max-w-[160px] truncate',
                      active ? 'text-white' : 'text-white-muted',
                    )}
                  >
                    {ev.title}
                  </span>
                  <span
                    className={cn(
                      'text-[9px] uppercase tracking-[0.14em] whitespace-nowrap',
                      active ? 'text-gold' : 'text-white-muted/60',
                    )}
                  >
                    {relativeLabel(ev.date)}
                  </span>
                </div>
                {/* Position indicator (1/3, 2/3…) only on active pill */}
                {active && availableEvents.length > 1 && (
                  <span className="ml-1 text-[9px] tabular-nums font-bold text-gold/80 bg-gold/10 px-1.5 py-0.5 rounded-full">
                    {idx + 1}/{availableEvents.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
      {/* Sync indicator — only while the backend catches up with the local
          viewed event (600ms debounce). Subtle, doesn't block interaction. */}
      {syncing && (
        <p className="mt-1.5 text-center text-[9px] text-gold/60 uppercase tracking-[0.2em]">
          Sincronizando…
        </p>
      )}
    </div>
  )
}

/**
 * Human-readable relative date label.
 *   - Today → "Hoy"
 *   - Tomorrow → "Mañana"
 *   - Within 7d forward → "En N dias"
 *   - Within 2d past → "Ayer" / "Anteayer"
 *   - Past (7+ days) → "Hace N dias"
 *   - Further out → short weekday+day+month ("Sab 5 May")
 */
function relativeLabel(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((startOfTarget - startOfToday) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Mañana'
  if (diffDays === -1) return 'Ayer'
  if (diffDays > 1 && diffDays <= 7) return `En ${diffDays} dias`
  if (diffDays < -1 && diffDays >= -7) return `Hace ${Math.abs(diffDays)} dias`
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
