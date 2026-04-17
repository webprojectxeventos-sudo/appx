'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  UserPlus,
  DoorOpen,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useScanner } from './scanner-provider'
import { EventDayGroups } from './event-day-groups'
import { playBeep, haptic, formatTime } from './scanner-utils'
import { useToast } from '@/components/ui/toast'
import * as outbox from '@/lib/scanner-outbox'

type DoorResult = {
  success: boolean
  name?: string
  promoter?: string
  error?: string
  queued?: boolean
}

export function DoorTab() {
  const {
    eventsByDay,
    // Use filteredAttendees so the "recent entries" + door count respect
    // the global per-event selector.
    filteredAttendees: attendees,
    selectedEventId,
    loadAttendees,
    soundEnabled,
    multipleEvents,
    eventNameMap,
    eventIds,
    online,
  } = useScanner()
  // Only show the per-row event label when rows mix multiple events.
  // When scoped to one event, the label would repeat on every row.
  const showEventLabel = multipleEvents && selectedEventId === 'all'
  const toast = useToast()

  const [doorName, setDoorName] = useState('')
  const [doorEventId, setDoorEventId] = useState<string>('')

  // If the user selected a specific event globally, auto-sync the door form to
  // register in that same event (avoids mismatch between what they're viewing
  // and what they're registering).
  useEffect(() => {
    if (selectedEventId !== 'all') setDoorEventId(selectedEventId)
  }, [selectedEventId])
  const [doorPromoterCode, setDoorPromoterCode] = useState('')
  const [doorLoading, setDoorLoading] = useState(false)
  const [doorResult, setDoorResult] = useState<DoorResult | null>(null)

  // Default to first event
  useEffect(() => {
    if (eventIds.length > 0 && !doorEventId) setDoorEventId(eventIds[0])
  }, [eventIds, doorEventId])

  // Door entries
  const doorEntries = useMemo(
    () => attendees.filter((a) => a.qr_code.startsWith('DOOR-')).slice(0, 10),
    [attendees],
  )

  const doorCount = useMemo(
    () => attendees.filter((a) => a.qr_code.startsWith('DOOR-')).length,
    [attendees],
  )

  // ── Register ─────────────────────────────────────────────────────────────

  const registerDoor = async () => {
    if (!doorName.trim() || !doorEventId) return
    setDoorLoading(true)
    setDoorResult(null)
    const name = doorName.trim()
    const payload = {
      name,
      event_id: doorEventId,
      ...(doorPromoterCode.replace(/-/g, '').length === 8 && {
        promoter_code: doorPromoterCode,
      }),
    }

    const handleQueued = async () => {
      await outbox.enqueue({
        kind: 'door-register',
        endpoint: '/api/scanner/door-register',
        payload,
        label: name,
      })
      if (soundEnabled) playBeep(true)
      haptic(true)
      setDoorResult({ success: true, queued: true, name })
      toast.warning(`${name} · registrado (pendiente sync)`)
      setDoorName('')
      setDoorPromoterCode('')
      setTimeout(() => setDoorResult(null), 3000)
    }

    try {
      if (!online) {
        await handleQueued()
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setDoorResult({ success: false, error: 'Sesion expirada' })
        return
      }
      const res = await fetch('/api/scanner/door-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        if (soundEnabled) playBeep(true)
        haptic(true)
        setDoorResult({
          success: true,
          name: data.user_name || name,
          promoter: data.promoter_name,
        })
        toast.success(`${data.user_name || name} registrado`)
        setDoorName('')
        setDoorPromoterCode('')
        loadAttendees()
        setTimeout(() => setDoorResult(null), 3000)
      } else {
        if (soundEnabled) playBeep(false)
        haptic(false)
        const msg = data.error || 'Error'
        setDoorResult({ success: false, error: msg })
        toast.error(msg)
      }
    } catch {
      // Network error — queue for later
      await handleQueued()
    } finally {
      setDoorLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Registro en puerta</h3>
            <p className="text-[11px] text-white-muted">
              Para asistentes que pagan en la entrada
            </p>
          </div>
        </div>

        {/* Name input */}
        <input
          type="text"
          value={doorName}
          onChange={(e) => setDoorName(e.target.value)}
          placeholder="Nombre de la persona"
          className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && doorName.trim() && !doorLoading) registerDoor()
          }}
          autoFocus
        />

        {/* Promoter code (optional) */}
        <div>
          <label className="text-[11px] text-white-muted font-medium mb-1 block">
            Codigo organizador (opcional)
          </label>
          <input
            type="text"
            value={doorPromoterCode}
            onChange={(e) => {
              const clean = e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 8)
              setDoorPromoterCode(
                clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean,
              )
            }}
            placeholder="XXXX-XXXX"
            className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm font-mono tracking-widest focus:outline-none focus:border-primary/40 transition-colors uppercase"
          />
        </div>

        {/* Event selector — hidden when the user has already scoped to one
            event via the top EventScopeSelector (the doorEventId auto-syncs
            to that same event, making this picker redundant). */}
        {multipleEvents && selectedEventId === 'all' && (
          <div className="space-y-2">
            <label className="text-[11px] text-white-muted font-medium">Grupo</label>
            <EventDayGroups
              eventsByDay={eventsByDay}
              selectedId={doorEventId}
              onSelect={(id) => setDoorEventId(id)}
            />
          </div>
        )}

        {/* When scoped to a specific event, surface a small hint so the user
            sees WHICH event this registration will be applied to. */}
        {multipleEvents && selectedEventId !== 'all' && eventNameMap[doorEventId] && (
          <p className="text-[11px] text-white-muted">
            Registrando en{' '}
            <span className="text-white font-medium">{eventNameMap[doorEventId]}</span>
          </p>
        )}

        {/* Register button */}
        <button
          onClick={registerDoor}
          disabled={!doorName.trim() || doorLoading}
          className={cn(
            'btn-primary w-full py-3.5 text-sm font-semibold',
            (!doorName.trim() || doorLoading) && 'opacity-50 pointer-events-none',
          )}
        >
          {doorLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <DoorOpen className="w-4 h-4" />
          )}
          {doorLoading ? 'Registrando...' : 'Registrar entrada'}
        </button>
      </div>

      {/* Result feedback */}
      {doorResult && (
        <div
          className={cn(
            'card p-4 flex items-center gap-3',
            doorResult.success ? 'border-emerald-500/30' : 'border-red-500/30',
          )}
          style={{ animation: 'slideUp 0.2s ease-out' }}
        >
          {doorResult.success ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-white">
              {doorResult.success
                ? `${doorResult.name} registrado${doorResult.queued ? ' (offline)' : ''}`
                : 'Error'}
            </p>
            <p className="text-[11px] text-white-muted">
              {doorResult.success
                ? doorResult.queued
                  ? 'Se enviara al servidor cuando vuelva la conexion'
                  : doorResult.promoter
                    ? `Paga en puerta · Organizador: ${doorResult.promoter}`
                    : 'Entrada en puerta confirmada'
                : doorResult.error}
            </p>
          </div>
        </div>
      )}

      {/* Door entry stats */}
      {doorCount > 0 && (
        <div className="card p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DoorOpen className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-white-muted">Entradas en puerta hoy</span>
          </div>
          <span className="text-sm font-bold text-amber-400 tabular-nums">{doorCount}</span>
        </div>
      )}

      {/* Recent door entries */}
      {doorEntries.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">
            Ultimas entradas
          </p>
          <div className="space-y-1.5">
            {doorEntries.map((a) => (
              <div key={a.id} className="card p-3 flex items-center gap-2.5">
                <DoorOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-white flex-1 truncate">
                  {a.user_name || 'Sin nombre'}
                </span>
                {showEventLabel && (
                  <span className="text-[10px] text-white/25 truncate max-w-[80px]">
                    {eventNameMap[a.event_id]}
                  </span>
                )}
                <span className="text-[10px] text-white/25 tabular-nums">
                  {formatTime(a.scanned_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
