'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Info, KeyRound, BarChart3, ClipboardList, Music, CalendarClock, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CodesTab } from './tabs/codes-tab'
import { PollsTab } from './tabs/polls-tab'
import { SurveysTab } from './tabs/surveys-tab'
import { PlaylistTab } from './tabs/playlist-tab'
import { ScheduleTab } from './tabs/schedule-tab'
import { PhotosTab } from './tabs/photos-tab'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']

const TABS = [
  { id: 'codes', label: 'Codigos', icon: KeyRound },
  { id: 'polls', label: 'Bebidas', icon: BarChart3 },
  { id: 'surveys', label: 'Encuestas', icon: ClipboardList },
  { id: 'playlist', label: 'Playlist', icon: Music },
  { id: 'schedule', label: 'Programa', icon: CalendarClock },
  { id: 'photos', label: 'Fotos', icon: ImageIcon },
] as const

type TabId = (typeof TABS)[number]['id']

interface GroupDetailDrawerProps {
  event: Event | null
  venueName?: string
  date?: string
  onClose: () => void
}

export function GroupDetailDrawer({ event, venueName, date, onClose }: GroupDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('codes')
  const prevEventIdRef = useRef<string | undefined>(undefined)

  // Reset tab when a different event is opened
  useEffect(() => {
    if (event?.id !== prevEventIdRef.current) {
      prevEventIdRef.current = event?.id
      setActiveTab('codes')
    }
  }, [event?.id])

  // Close on Escape
  useEffect(() => {
    if (!event) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [event, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (event) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [event])

  if (!event) return null

  const dateFormatted = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer - right side on desktop, full screen on mobile */}
      <div className="fixed inset-y-0 right-0 z-50 w-full md:w-[520px] flex flex-col bg-background border-l border-black-border shadow-2xl animate-drawer-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{event.group_name || event.title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono text-white-muted bg-white/5 px-1.5 py-0.5 rounded">{event.event_code}</span>
              {venueName && <span className="text-[11px] text-white-muted">{venueName}</span>}
              {dateFormatted && <span className="text-[11px] text-white-muted">{dateFormatted}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-black-border overflow-x-auto scrollbar-hide shrink-0">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                  isActive ? 'bg-primary text-white' : 'text-white-muted hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'codes' && <CodesTab eventId={event.id} />}
          {activeTab === 'polls' && <PollsTab eventId={event.id} eventType={event.event_type} eventTitle={event.title} />}
          {activeTab === 'surveys' && <SurveysTab eventId={event.id} />}
          {activeTab === 'playlist' && <PlaylistTab eventId={event.id} />}
          {activeTab === 'schedule' && <ScheduleTab eventId={event.id} />}
          {activeTab === 'photos' && event.venue_id && date && <PhotosTab venueId={event.venue_id} date={date} />}
          {activeTab === 'photos' && (!event.venue_id || !date) && (
            <div className="py-8 text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 text-white-muted" />
              <p className="text-white-muted text-sm">Este grupo no tiene venue asignado</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
