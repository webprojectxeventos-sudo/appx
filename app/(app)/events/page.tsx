'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useToast } from '@/components/ui/toast'
import { Calendar, ChevronRight, Plus, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Mapea el `error` string que devuelve redeem_access_code a copia para toast.
// Dejo la logica de i18n aqui para poder iterar sin tocar SQL.
const REDEEM_ERRORS: Record<string, string> = {
  invalid_code: 'Codigo no valido',
  code_disabled: 'Este codigo esta deshabilitado',
  code_already_used: 'Este codigo ya fue canjeado por otro usuario',
  not_authenticated: 'Sesion expirada, vuelve a iniciar sesion',
}

type RedeemResult = {
  ok: boolean
  error?: string
  already_redeemed?: boolean
  event_id?: string
  event_title?: string
  event_date?: string | null
}

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
      // Canje atomico: reclama el codigo + asegura user_events en una sola tx.
      // Ver supabase-migration-redeem-access-code.sql.
      const { data, error } = await supabase.rpc('redeem_access_code', {
        code_text: joinCode,
      })

      if (error) {
        console.error('[redeem_access_code]', error)
        showError('No se pudo procesar el codigo')
        return
      }

      const result = data as RedeemResult | null
      if (!result?.ok) {
        const code = result?.error || 'invalid_code'
        showError(REDEEM_ERRORS[code] || 'Codigo no valido')
        return
      }

      if (!result.event_id) {
        showError('Respuesta invalida del servidor')
        return
      }

      // Generar ticket (idempotente: si ya existe, devuelve el QR existente).
      // Asi el usuario siempre sale de aqui con QR valido aunque sea su codigo
      // repetido.
      let qrCode: string | null = null
      try {
        const { data: qr } = await supabase.rpc('generate_ticket', {
          p_user_id: user.id,
          p_event_id: result.event_id,
        })
        if (typeof qr === 'string') qrCode = qr
      } catch (ticketErr) {
        console.error('[generate_ticket]', ticketErr)
      }

      // Email best-effort (nunca bloquea la UX: si falla, el QR sigue
      // disponible en /tickets). No await para no bloquear el switch.
      if (qrCode) {
        authFetch('/api/send-ticket', {
          qrCode,
          eventDate: result.event_date || null,
          venueName: null,
        }).catch((err) => {
          console.error('[send-ticket]', err)
        })
      }

      // Cambiar evento activo para que el resto de la app refleje el canje.
      await supabase
        .from('users')
        .update({ event_id: result.event_id })
        .eq('id', user.id)
      await refreshProfile()

      setJoinCode('')
      if (result.already_redeemed) {
        success('Ya estabas en este evento, actualizado')
      } else {
        success(`Te has unido a ${result.event_title || 'el evento'}`)
      }
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
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
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
