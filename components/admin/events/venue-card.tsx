'use client'

import { useState } from 'react'
import { Layers, PartyPopper, GraduationCap, Trash2, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GroupRow } from './group-row'
import { QuickAddInput } from './quick-add-input'
import { BatchAddModal } from './batch-add-modal'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

interface VenueCardProps {
  venue: Venue
  groups: Event[]
  otherVenues: Venue[]
  date: string
  organizationId: string
  userId: string
  onRefresh: () => void
  onSelectGroup?: (event: Event) => void
  onDeleteVenue?: (venueId: string, venueName: string) => void
}

export function VenueCard({ venue, groups, otherVenues, date, organizationId, userId, onRefresh, onSelectGroup, onDeleteVenue }: VenueCardProps) {
  const [showBatch, setShowBatch] = useState(false)

  const eventType: 'eso' | 'fiesta' = groups.length > 0
    ? (groups.filter(g => g.event_type === 'eso').length > groups.length / 2 ? 'eso' : 'fiesta')
    : 'fiesta'

  return (
    <>
      <div className="card flex flex-col w-full md:min-w-[320px] md:max-w-[420px] overflow-hidden">
        {/* Header with image or gradient fallback */}
        <div className="relative">
          {venue.image_url ? (
            <div className="relative h-32 bg-black-card">
              <img
                src={venue.image_url}
                alt={venue.name}
                className="absolute inset-0 w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
            </div>
          ) : (
            <div className="h-20 bg-gradient-to-br from-white/[0.04] via-transparent to-white/[0.02]" />
          )}

          {/* Venue info */}
          <div className={cn(
            'flex items-end justify-between gap-3 px-4 pb-4',
            venue.image_url ? 'absolute bottom-0 left-0 right-0' : 'pt-4'
          )}>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate drop-shadow-lg">{venue.name}</h3>
              {venue.city && (
                <p className="flex items-center gap-1 text-xs text-white/60 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {venue.city}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur-sm',
                eventType === 'fiesta' ? 'bg-primary/20 text-primary' : 'bg-blue-500/20 text-blue-400'
              )}>
                {eventType === 'fiesta' ? <PartyPopper className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
                {eventType === 'fiesta' ? 'Fiesta' : 'ESO'}
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-white bg-white/10 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                <Layers className="w-3.5 h-3.5" />
                {groups.length}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-black-border" />

        {/* Groups list */}
        <div className={cn(
          'flex-1 py-1',
          groups.length > 8 && 'max-h-[380px] overflow-y-auto scrollbar-none'
        )}>
          {groups.length === 0 ? (
            <div className="py-10 text-center">
              <Layers className="w-7 h-7 text-white-muted mx-auto mb-2 opacity-50" />
              <p className="text-white-muted text-sm">Sin grupos asignados</p>
            </div>
          ) : (
            groups.map(group => (
              <GroupRow
                key={group.id}
                event={group}
                otherVenues={otherVenues}
                onRefresh={onRefresh}
                onSelect={onSelectGroup}
              />
            ))
          )}
        </div>

        {/* Footer: Quick add + batch + delete */}
        <div className="border-t border-black-border">
          <QuickAddInput
            venueId={venue.id}
            date={date}
            eventType={eventType}
            organizationId={organizationId}
            userId={userId}
            onCreated={onRefresh}
          />
          <div className="px-4 pb-3 flex items-center gap-2">
            <button
              onClick={() => setShowBatch(true)}
              className="flex-1 py-2.5 text-xs font-medium text-white-muted border border-dashed border-black-border rounded-xl hover:border-primary/30 hover:text-primary active:bg-primary/5 transition-all"
            >
              Añadir en lote
            </button>
            {onDeleteVenue && (
              <button
                onClick={() => onDeleteVenue(venue.id, venue.name)}
                className="p-2.5 rounded-xl text-white-muted hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-all"
                title="Eliminar venue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <BatchAddModal
        open={showBatch}
        onClose={() => setShowBatch(false)}
        venueId={venue.id}
        venueName={venue.name}
        date={date}
        eventType={eventType}
        organizationId={organizationId}
        userId={userId}
        onCreated={onRefresh}
      />
    </>
  )
}
