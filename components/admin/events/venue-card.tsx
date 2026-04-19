'use client'

import { useCallback, useEffect, useState } from 'react'
import { Layers, PartyPopper, GraduationCap, Trash2, MapPin, ChevronDown, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { GroupRow } from './group-row'
import { QuickAddInput } from './quick-add-input'
import { BatchAddModal } from './batch-add-modal'
import { VenuePhotosModal } from './venue-photos-modal'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

type EventMutator = (prev: Event[]) => Event[]

interface VenueCardProps {
  venue: Venue
  groups: Event[]
  otherVenues: Venue[]
  date: string
  organizationId: string
  userId: string
  onRefresh: () => void
  onMutate?: (mutator: EventMutator) => void
  onSelectGroup?: (event: Event) => void
  onDeleteVenue?: (venueId: string, venueName: string) => void
  compact?: boolean
}

export function VenueCard({ venue, groups, otherVenues, date, organizationId, userId, onRefresh, onMutate, onSelectGroup, onDeleteVenue, compact }: VenueCardProps) {
  const [showBatch, setShowBatch] = useState(false)
  const [showPhotos, setShowPhotos] = useState(false)
  const [expanded, setExpanded] = useState(true)

  // Tracks photo state for (venue, date) so the button can show a live badge
  // without opening the modal. Shared across all institutes at the same
  // venue+date since that's how the photos table is keyed.
  const [photosInfo, setPhotosInfo] = useState<{ hasDropbox: boolean; featuredCount: number }>({
    hasDropbox: false,
    featuredCount: 0,
  })

  const refreshPhotosInfo = useCallback(async () => {
    if (!venue.id || !date) return
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('id,caption')
        .eq('venue_id', venue.id)
        .eq('photo_date', date)
      if (error) return
      const rows = data || []
      setPhotosInfo({
        hasDropbox: rows.some(p => p.caption === '_dropbox_folder'),
        featuredCount: rows.filter(p => p.caption !== '_dropbox_folder').length,
      })
    } catch {
      // swallow — badge is a nice-to-have, not critical
    }
  }, [venue.id, date])

  useEffect(() => { refreshPhotosInfo() }, [refreshPhotosInfo])

  // When the modal closes, re-read so the badge reflects the admin's edits
  const handleClosePhotos = useCallback(() => {
    setShowPhotos(false)
    refreshPhotosInfo()
  }, [refreshPhotosInfo])

  const eventType: 'eso' | 'fiesta' = groups.length > 0
    ? (groups.filter(g => g.event_type === 'eso').length > groups.length / 2 ? 'eso' : 'fiesta')
    : 'fiesta'

  const photosConfigured = photosInfo.hasDropbox || photosInfo.featuredCount > 0

  // ── Compact / list mode ──
  if (compact) {
    return (
      <>
        <div className="card overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
          >
            <ChevronDown className={cn('w-4 h-4 text-white-muted transition-transform shrink-0', expanded && 'rotate-180')} />
            <h3 className="text-sm font-bold text-white truncate text-left flex-1">{venue.name}</h3>
            {venue.city && (
              <span className="text-[11px] text-white-muted/60 hidden sm:block">{venue.city}</span>
            )}
            <span className={cn(
              'flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0',
              eventType === 'fiesta' ? 'bg-primary/15 text-primary' : 'bg-blue-500/15 text-blue-400',
            )}>
              {eventType === 'fiesta' ? <PartyPopper className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
              {eventType === 'fiesta' ? 'Fiesta' : 'ESO'}
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); setShowPhotos(true) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowPhotos(true) } }}
              className={cn(
                'flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg shrink-0 transition-colors cursor-pointer',
                photosConfigured
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'bg-white/5 text-white-muted hover:bg-white/10 hover:text-white',
              )}
              title="Fotos · compartidas por todos los institutos del venue en esta fecha"
            >
              <ImageIcon className="w-3 h-3" />
              {photosInfo.featuredCount > 0 ? photosInfo.featuredCount : photosInfo.hasDropbox ? '●' : ''}
            </span>
            <span className="text-xs font-bold text-white bg-white/10 px-2 py-0.5 rounded-lg shrink-0">
              {groups.length}
            </span>
            {onDeleteVenue && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onDeleteVenue(venue.id, venue.name) }}
                className="p-1.5 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            )}
          </button>

          {/* Expandable body */}
          {expanded && (
            <>
              <div className="h-px bg-black-border" />
              <div className={cn('py-1', groups.length > 12 && 'max-h-[340px] overflow-y-auto scrollbar-none')}>
                {groups.length === 0 ? (
                  <p className="py-6 text-center text-white-muted text-sm">Sin grupos</p>
                ) : (
                  groups.map(group => (
                    <GroupRow key={group.id} event={group} otherVenues={otherVenues} onRefresh={onRefresh} onMutate={onMutate} onSelect={onSelectGroup} />
                  ))
                )}
              </div>
              <div className="border-t border-black-border">
                <QuickAddInput venueId={venue.id} date={date} eventType={eventType} organizationId={organizationId} userId={userId} onCreated={onRefresh} onMutate={onMutate} />
                <div className="px-4 pb-2.5 flex items-center gap-2">
                  <button onClick={() => setShowBatch(true)} className="flex-1 py-2 text-xs font-medium text-white-muted border border-dashed border-black-border rounded-xl hover:border-primary/30 hover:text-primary active:bg-primary/5 transition-all">
                    Añadir en lote
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <BatchAddModal open={showBatch} onClose={() => setShowBatch(false)} venueId={venue.id} venueName={venue.name} date={date} eventType={eventType} organizationId={organizationId} userId={userId} onCreated={onRefresh} onMutate={onMutate} />
        <VenuePhotosModal open={showPhotos} onClose={handleClosePhotos} venueId={venue.id} venueName={venue.name} date={date} />
      </>
    )
  }

  // ── Full / grid mode ──
  return (
    <>
      <div className="card flex flex-col w-full overflow-hidden">
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
              <button
                onClick={(e) => { e.stopPropagation(); setShowPhotos(true) }}
                className={cn(
                  'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur-sm transition-colors',
                  photosConfigured
                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-white/10 text-white/80 hover:bg-white/20',
                )}
                title="Fotos · compartidas por todos los institutos del venue en esta fecha"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {photosInfo.featuredCount > 0
                  ? photosInfo.featuredCount
                  : photosInfo.hasDropbox
                    ? '●'
                    : 'Fotos'}
              </button>
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
                onMutate={onMutate}
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
            onMutate={onMutate}
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
        onMutate={onMutate}
      />
      <VenuePhotosModal
        open={showPhotos}
        onClose={handleClosePhotos}
        venueId={venue.id}
        venueName={venue.name}
        date={date}
      />
    </>
  )
}
