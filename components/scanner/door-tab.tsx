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

type DoorResult = {
  success: boolean
  name?: string
  promoter?: string
  error?: string
}

export function DoorTab() {
  const {
    serverEvents,
    eventsByDay,
    attendees,
    loadAttendees,
    soundEnabled,
    multipleEvents,
    eventNameMap,
    eventIds,
  } = useScanner()

  const [doorName, setDoorName] = useState('')
  const [doorEventId, setDoorEventId] = useState<string>('')
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
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/scanner/door-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: doorName.trim(),
          event_id: doorEventId,
          ...(doorPromoterCode.replace(/-/g, '').length === 8 && {
            promoter_code: doorPromoterCode,
          }),
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (soundEnabled) playBeep(true)
        haptic(true)
        setDoorResult({
          success: true,
          name: data.user_name,
          promoter: data.promoter_name,
        })
        setDoorName('')
        setDoorPromoterCode('')
        loadAttendees()
        setTimeout(() => setDoorResult(null), 3000)
      } else {
        if (soundEnabled) playBeep(false)
        haptic(false)
        setDoorResult({ success: false, error: data.error || 'Error' })
      }
    } catch {
      if (soundEnabled) playBeep(false)
      haptic(false)
      setDoorResult({ success: false, error: 'Error de conexion' })
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

        {/* Event selector */}
        {multipleEvents && (
          <div className="space-y-2">
            <label className="text-[11px] text-white-muted font-medium">Grupo</label>
            <EventDayGroups
              eventsByDay={eventsByDay}
              selectedId={doorEventId}
              onSelect={(id) => setDoorEventId(id)}
            />
          </div>
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
              {doorResult.success ? `${doorResult.name} registrado` : 'Error'}
            </p>
            <p className="text-[11px] text-white-muted">
              {doorResult.success
                ? doorResult.promoter
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
                {multipleEvents && (
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
