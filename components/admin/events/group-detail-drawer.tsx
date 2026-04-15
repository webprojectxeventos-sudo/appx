'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, KeyRound, BarChart3, ClipboardList, Music, CalendarClock, Image as ImageIcon, Users, Clock, Calendar, Check, Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { cn, toLocalDateKey } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useToast } from '@/components/ui/toast'
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

  // Date editing
  const [editingDate, setEditingDate] = useState(false)
  const [dateValue, setDateValue] = useState('')
  const [dateSaved, setDateSaved] = useState(false)

  // Delete event
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingEvent, setDeletingEvent] = useState(false)
  const { error: showError, success } = useToast()

  // Portal mount
  useEffect(() => { setMounted(true) }, [])

  // Reset tab + extract time + date when a different event is opened
  useEffect(() => {
    if (event?.id !== prevEventIdRef.current) {
      prevEventIdRef.current = event?.id
      setActiveTab('attendees')
      setEditingTime(false)
      setEditingDate(false)
      // Extract LOCAL time + date from event.date (handles UTC→local conversion)
      if (event?.date) {
        const d = new Date(event.date)
        const hh = String(d.getHours()).padStart(2, '0')
        const mm = String(d.getMinutes()).padStart(2, '0')
        setTimeValue(`${hh}:${mm}`)
        setDateValue(toLocalDateKey(d))
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
    // Preserve the original local date, update only the time
    const orig = new Date(event.date)
    const [hh, mm] = timeValue.split(':').map(Number)
    orig.setHours(hh, mm, 0, 0)
    const newDate = orig.toISOString()

    // .select() returns the updated rows — if RLS silently blocks, data is []
    const { data, error } = await supabase
      .from('events')
      .update({ date: newDate })
      .eq('id', event.id)
      .select()

    if (error) {
      showError('Error al guardar la hora')
      return
    }
    if (!data || data.length === 0) {
      showError('No tienes permiso para modificar este evento')
      return
    }
    setEditingTime(false)
    setTimeSaved(true)
    setTimeout(() => setTimeSaved(false), 1500)
    onRefresh?.()
  }

  const handleSaveDate = async () => {
    if (!event || !dateValue) return
    // Preserve the original local time, update only the date.
    // Parse as local components to avoid UTC timezone shift.
    const orig = new Date(event.date)
    const [year, month, day] = dateValue.split('-').map(Number)
    if (!year || !month || !day) return
    orig.setFullYear(year, month - 1, day)
    const newDate = orig.toISOString()

    const { data, error } = await supabase
      .from('events')
      .update({ date: newDate })
      .eq('id', event.id)
      .select()

    if (error) {
      showError('Error al guardar la fecha')
      return
    }
    if (!data || data.length === 0) {
      showError('No tienes permiso para modificar este evento')
      return
    }
    setEditingDate(false)
    setDateSaved(true)
    setTimeout(() => setDateSaved(false), 1500)
    onRefresh?.()
  }

  const handleDeleteEvent = async () => {
    if (!event) return
    setDeletingEvent(true)
    try {
      const res = await authFetch('/api/admin/delete-event', { eventId: event.id })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al eliminar evento')
        return
      }
      success(`Evento "${event.group_name || event.title}" eliminado`)
      setShowDeleteConfirm(false)
      onClose()
      onRefresh?.()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setDeletingEvent(false)
    }
  }

  if (!event || !mounted) return null

  // Display date derived from event.date (local timezone, not the stale `date` prop)
  const eventLocal = new Date(event.date)
  const dateFormatted = eventLocal.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const currentDateKey = toLocalDateKey(eventLocal)

  // Current time display from event.date (local timezone)
  const currentTime = `${String(eventLocal.getHours()).padStart(2, '0')}:${String(eventLocal.getMinutes()).padStart(2, '0')}`

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
              {/* Editable date */}
              {editingDate ? (
                <span className="flex items-center gap-1">
                  <input
                    type="date"
                    value={dateValue}
                    onChange={e => setDateValue(e.target.value)}
                    className="px-1.5 py-0.5 rounded border border-primary/40 bg-transparent text-white text-[11px] focus:outline-none"
                    autoFocus
                  />
                  <button onClick={handleSaveDate} className="p-0.5 rounded text-primary hover:bg-primary/10">
                    <Check className="w-3 h-3" />
                  </button>
                  <button onClick={() => setEditingDate(false)} className="p-0.5 rounded text-white-muted hover:bg-white/5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => { setDateValue(currentDateKey); setEditingDate(true) }}
                  className={cn(
                    'flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded transition-colors',
                    dateSaved
                      ? 'text-primary bg-primary/10'
                      : 'text-white-muted hover:text-primary hover:bg-white/5'
                  )}
                >
                  <Calendar className="w-3 h-3" />
                  {dateSaved ? 'Guardado!' : dateFormatted}
                </button>
              )}
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
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
              title="Eliminar evento"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
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
          {activeTab === 'codes' && <CodesTab eventId={event.id} eventName={event.group_name || event.title} eventDate={event.date} />}
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

        {/* Delete Event Confirmation */}
        {showDeleteConfirm && (
          <>
            <div className="absolute inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={() => !deletingEvent && setShowDeleteConfirm(false)} />
            <div className="absolute inset-0 z-[90] flex items-center justify-center p-4">
              <div className="w-full max-w-sm bg-background border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">Eliminar evento</h3>
                  <p className="text-sm text-white-muted">
                    Se eliminara <span className="text-white font-medium">{event.group_name || event.title}</span> y todos sus datos: asistentes, tickets, mensajes, encuestas, fotos, playlist, codigos de acceso.
                  </p>
                  <p className="text-xs text-red-400/80">Esta accion no se puede deshacer.</p>
                </div>
                <div className="flex gap-3 p-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deletingEvent}
                    className="btn-ghost flex-1 text-sm py-2.5"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteEvent}
                    disabled={deletingEvent}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {deletingEvent && <Loader2 className="w-4 h-4 animate-spin" />}
                    {deletingEvent ? 'Eliminando...' : 'Eliminar evento'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )

  // Portal to body so drawer escapes admin layout stacking context
  return createPortal(drawerContent, document.body)
}
