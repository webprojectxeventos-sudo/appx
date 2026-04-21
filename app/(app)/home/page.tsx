'use client'

import { useAuth } from '@/lib/auth-context'
import { HomeEventProvider, useHomeEvent } from '@/components/home/home-event-context'
import { EventSwitcherRail } from '@/components/home/event-switcher-rail'
import { HomePanel } from '@/components/home/home-panel'
import { HomeSwipe } from '@/components/home/home-swipe'

/**
 * Home — composition shell for the multi-event swipeable home.
 *
 * The real UI lives in <HomePanel> (one panel per event). This component
 * just orchestrates:
 *   - HomeEventProvider: holds viewedEventId + preloads tickets/venues
 *   - EventSwitcherRail: sticky pills row (only when >1 event)
 *   - HomePanel: the entire event-scoped UI for the currently viewed event
 *
 * Loading and empty states are handled here so the panel can assume a
 * non-null event.
 */
export default function HomePage() {
  return (
    <HomeEventProvider>
      <HomePageInner />
    </HomeEventProvider>
  )
}

function HomePageInner() {
  const { loading, profile } = useAuth()
  const { availableEvents, viewedEvent, venuesByEvent } = useHomeEvent()

  // Auth still loading, or auth done but events are still streaming in from
  // the background loader in auth-context (and the profile tells us one
  // should arrive).
  const eventStillLoading =
    !loading && !viewedEvent && availableEvents.length === 0 && !!profile?.event_id
  if (loading || eventStillLoading) return <HomeSkeleton />

  // Truly no events — auth done, profile loaded, nothing to show.
  if (!viewedEvent) return <NoEventsState />

  return (
    <div className="space-y-4">
      <EventSwitcherRail />
      <HomeSwipe>
        <HomePanel
          event={viewedEvent}
          venue={venuesByEvent[viewedEvent.id] ?? null}
        />
      </HomeSwipe>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div
        className="rounded-2xl bg-black-card animate-pulse"
        style={{ height: '200px' }}
      />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card p-3 h-[72px] animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4 h-[80px] animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function NoEventsState() {
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
