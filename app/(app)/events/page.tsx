'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { Calendar, ChevronRight, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserEvent {
  event_id: string
  role: string
  events: {
    id: string
    title: string
    date: string
    location: string | null
    event_type: string
    cover_image_url: string | null
  }
}

export default function EventsPage() {
  const { user, profile, event: currentEvent, refreshProfile } = useAuth()
  const { error: showError, success } = useToast()
  const [events, setEvents] = useState<UserEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const loadEvents = async () => {
      setLoading(true)

      const { data } = await supabase
        .from('user_events')
        .select('event_id, role, events!inner(id, title, date, location, event_type, cover_image_url)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('joined_at', { ascending: false })

      if (cancelled) return
      if (data) setEvents(data as unknown as UserEvent[])
      setLoading(false)
    }
    loadEvents()
    return () => { cancelled = true }
  }, [user?.id])

  const fetchEvents = async () => {
    if (!user?.id) return
    setLoading(true)

    const { data } = await supabase
      .from('user_events')
      .select('event_id, role, events!inner(id, title, date, location, event_type, cover_image_url)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('joined_at', { ascending: false })

    if (data) setEvents(data as unknown as UserEvent[])
    setLoading(false)
  }

  const handleJoin = async () => {
    if (!joinCode || !user?.id) return
    setJoining(true)

    try {
      const { data: validated } = await supabase.rpc('validate_access_code', { code_text: joinCode })
      if (!validated) {
        showError('Codigo no valido')
        return
      }

      // Add to user_events
      await supabase.from('user_events').upsert({
        user_id: user.id,
        event_id: validated.event_id,
        role: 'attendee',
      }, { onConflict: 'user_id,event_id' })

      // Switch active event
      await supabase.from('users').update({ event_id: validated.event_id }).eq('id', user.id)
      await refreshProfile()
      setJoinCode('')
      success('Te has unido al evento')
      fetchEvents()
    } catch (err) {
      console.error(err)
      showError('Error al unirse al evento')
    } finally {
      setJoining(false)
    }
  }

  const switchEvent = async (eventId: string) => {
    if (!user?.id || eventId === currentEvent?.id) return
    setSwitching(eventId)

    await supabase.from('users').update({ event_id: eventId }).eq('id', user.id)
    await refreshProfile()
    setSwitching(null)
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

  if (loading) {
    return (
      <div className="space-y-3 animate-fade-in">
        {[0, 1].map((i) => <div key={i} className="card p-5 h-24 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h1 className="text-lg font-bold text-white">Mis eventos</h1>

      {/* Join new event */}
      <div className="card p-4 space-y-3">
        <p className="text-sm font-medium text-white">Unirse a un evento</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Codigo de acceso"
            maxLength={10}
            className="flex-1 px-4 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 uppercase tracking-widest"
          />
          <button onClick={handleJoin} disabled={!joinCode || joining} className="btn-primary px-4 py-2.5 text-sm">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {events.map((ue) => {
          const ev = ue.events
          const isActive = currentEvent?.id === ev.id

          return (
            <button
              key={ev.id}
              onClick={() => switchEvent(ev.id)}
              disabled={switching === ev.id}
              className={cn(
                'card p-4 w-full text-left flex items-center gap-3 active:scale-[0.98] transition-all',
                isActive && 'border-primary/30'
              )}
            >
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                isActive ? 'bg-primary/15' : 'bg-white/5'
              )}>
                {isActive ? (
                  <Check className="w-5 h-5 text-primary" />
                ) : (
                  <Calendar className="w-5 h-5 text-white-muted" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{ev.title}</p>
                <p className="text-[11px] text-white-muted">
                  {formatDate(ev.date)}
                  {ev.location && ` · ${ev.location}`}
                </p>
              </div>
              {isActive && (
                <span className="text-[10px] text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10">
                  Activo
                </span>
              )}
              {!isActive && <ChevronRight className="w-4 h-4 text-white-muted" />}
            </button>
          )
        })}

        {events.length === 0 && (
          <div className="text-center py-8">
            <Calendar className="w-8 h-8 text-white-muted mx-auto mb-2" />
            <p className="text-white-muted text-sm">No estas en ningun evento aun</p>
            <p className="text-white-muted text-xs mt-1">Usa un codigo de acceso para unirte</p>
          </div>
        )}
      </div>
    </div>
  )
}
