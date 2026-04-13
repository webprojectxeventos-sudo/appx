'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, KeyRound, BarChart3, ClipboardList, Music, CalendarClock, Image as ImageIcon, Users, Clock, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { CodesTab } from './tabs/codes-tab'
import { PollsTab } from './tabs/polls-tab'
import { SurveysTab } from './tabs/surveys-tab'
import { PlaylistTab } from './tabs/playlist-tab'
import { ScheduleTab } from './tabs/schedule-tab'
import { PhotosTab } from './tabs/photos-tab'
import { AttendeesTab } from './tabs/attendees-tab'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']

const TABS = [
  { id: 'attendees', label: 'Asistentes', icon: Users },
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
  onRefresh?: () => void
}

export function GroupDetailDrawer({ event, venueName, date, onClose, onRefresh }: GroupDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('codes')
  const [mounted, setMounted] = useState(false)
  const prevEventIdRef = useRef<string | undefined>(undefined)

  // Time editing
  const [editingTime, setEditingTime] = useState(false)
  const [timeValue, setTimeValue] = useState('22:00')
  const [timeSaved, setTimeSaved] = useState(false)

  // Portal mount
  useEffect(() => { setMounted(true) }, [])

  // Reset tab + extract time when a different event is opened
  useEffect(() => {
    if (event?.id !== prevEventIdRef.current) {
      prevEventIdRef.current = event?.id
      setActiveTab('attendees')
      setEditingTime(false)
      // Extract time from event.date (e.g. "2026-04-24T22:00:00")
      if (event?.date) {
        const match = event.date.match(/T(\d{2}:\d{2})/)
        setTimeValue(match ? match[1] : '22:00')
      }
    }
  }, [event?.id, event?.date])

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

  const handleSaveTime = async () => {
    if (!event) return
    // Build new date string preserving the date part
    const datePart = event.date.split('T')[0]
    const newDate = `${datePart}T${timeValue}:00`

    const { error } = await supabase
      .from('events')
      .update({ date: newDate })
      .eq('id', event.id)

    if (!error) {
      setEditingTime(false)
      setTimeSaved(true)
      setTimeout(() => setTimeSaved(false), 1500)
      onRefresh?.()
    }
  }

  if (!event || !mounted) return null

  const dateFormatted = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  // Current time display from event.date
  const currentTime = event.date.match(/T(\d{2}:\d{2})/)?.[1] || '00:00'

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer - right side on desktop, full screen on mobile */}
      <div className="fixed inset-y-0 right-0 z-[70] w-full md:w-[520px] flex flex-col bg-background border-l border-black-border shadow-2xl animate-drawer-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{event.group_name || event.title}</h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono text-white-muted bg-white/5 px-1.5 py-0.5 rounded">{event.event_code}</span>
              {venueName && <span className="text-[11px] text-white-muted">{venueName}</span>}
              {dateFormatted && <span className="text-[11px] text-white-muted">{dateFormatted}</span>}
              {/* Editable time */}
              {editingTime ? (
                <span className="flex items-center gap-1">
                  <input
                    type="time"
                    value={timeValue}
                    onChange={e => setTimeValue(e.target.value)}
                    className="px-1.5 py-0.5 rounded border border-primary/40 bg-transparent text-white text-[11px] focus:outline-none w-[80px]"
                    autoFocus
                  />
                  <button onClick={handleSaveTime} className="p-0.5 rounded text-primary hover:bg-primary/10">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingTime(false)} className="p-0.5 rounded text-white-muted hover:bg-white/5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => { setTimeValue(currentTime); setEditingTime(true) }}
                  className={cn(
                    'flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded transition-colors',
                    timeSaved
                      ? 'text-primary bg-primary/10'
                      : 'text-white-muted hover:text-primary hover:bg-white/5'
                  )}
                >
                  <Clock className="w-3 h-3" />
                  {timeSaved ? 'Guardado!' : currentTime + 'h'}
                </button>
              )}
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
          {activeTab === 'attendees' && <AttendeesTab eventId={event.id} />}
          {activeTab === 'codes' && <CodesTab eventId={event.id} />}
          {activeTab === 'polls' && <PollsTab eventId={event.id} eventType={event.event_type} eventTitle={event.title} venueId={event.venue_id || undefined} date={date} />}
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

  // Portal to body so drawer escapes admin layout stacking context
  return createPortal(drawerContent, document.body)
}
