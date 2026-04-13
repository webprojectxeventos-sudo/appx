'use client'

import { useState } from 'react'
import NextImage from 'next/image'
import { Layers, PartyPopper, GraduationCap } from 'lucide-react'
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
}

export function VenueCard({ venue, groups, otherVenues, date, organizationId, userId, onRefresh, onSelectGroup }: VenueCardProps) {
  const [showBatch, setShowBatch] = useState(false)

  // Determine dominant event type from existing groups, default to 'fiesta'
  const eventType: 'eso' | 'fiesta' = groups.length > 0
    ? (groups.filter(g => g.event_type === 'eso').length > groups.length / 2 ? 'eso' : 'fiesta')
    : 'fiesta'

  return (
    <>
      <div className="card flex flex-col w-full md:min-w-[280px] md:max-w-[360px] overflow-hidden">
        {/* Venue image */}
        {venue.image_url && (
          <div className="relative h-24 bg-black-card shrink-0">
            <img src={venue.image_url} alt={venue.name} className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        )}
        {/* Header */}
        <div className={cn("flex items-center justify-between p-4 pb-2 border-b border-black-border", venue.image_url && "-mt-8 relative z-10")}>
          <div className="min-w-0">
            <h3 className={cn("text-sm font-bold truncate", venue.image_url ? "text-white drop-shadow-lg" : "text-white")}>{venue.name}</h3>
            {venue.city && <p className={cn("text-[11px] truncate", venue.image_url ? "text-white/70" : "text-white-muted")}>{venue.city}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full',
              eventType === 'fiesta' ? 'bg-primary/10 text-primary' : 'bg-blue-500/10 text-blue-400'
            )}>
              {eventType === 'fiesta' ? <PartyPopper className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
              {eventType === 'fiesta' ? 'Fiesta' : 'ESO'}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-white-muted bg-white/5 px-2 py-0.5 rounded-full">
              <Layers className="w-3 h-3" />
              {groups.length}
            </span>
          </div>
        </div>

        {/* Groups list */}
        <div className={cn(
          'flex-1 overflow-y-auto',
          groups.length > 10 && 'max-h-[320px]'
        )}>
          {groups.length === 0 ? (
            <p className="text-white-muted text-xs text-center py-4">Sin grupos asignados</p>
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

        {/* Quick add + batch */}
        <div className="border-t border-black-border">
          <QuickAddInput
            venueId={venue.id}
            date={date}
            eventType={eventType}
            organizationId={organizationId}
            userId={userId}
            onCreated={onRefresh}
          />
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowBatch(true)}
              className="w-full py-1.5 text-[11px] font-medium text-white-muted border border-dashed border-black-border rounded-lg hover:border-primary/30 hover:text-primary transition-colors"
            >
              Añadir en lote
            </button>
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
