'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Search,
  Users,
  UserCheck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Share2,
  Copy,
  Check,
  Undo2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useScanner } from './scanner-provider'
import { EventDayGroups } from './event-day-groups'
import { playBeep, haptic, formatTime } from './scanner-utils'
import { useToast } from '@/components/ui/toast'
import * as outbox from '@/lib/scanner-outbox'
import type { ScanResult } from './scanner-types'

const INITIAL_VISIBLE = 50
const LOAD_MORE_STEP = 50

export function ListTab() {
  const {
    attendees,
    loadAttendees,
    loadingAttendees,
    eventNameMap,
    stats,
    eventsByDay,
    eventIds,
    multipleEvents,
    soundEnabled,
    venueName,
    online,
    patchAttendee,
  } = useScanner()
  const toast = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'pending'>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')
  const [copied, setCopied] = useState(false)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)

  // ── Filters ──────────────────────────────────────────────────────────────

  const filteredAttendees = useMemo(() => {
    return attendees.filter((a) => {
      if (statusFilter === 'inside' && a.status !== 'used') return false
      if (statusFilter === 'pending' && a.status === 'used') return false
      if (groupFilter !== 'all' && a.event_id !== groupFilter) return false
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        (a.user_name || '').toLowerCase().includes(q) ||
        a.user_email.toLowerCase().includes(q) ||
        (eventNameMap[a.event_id] || '').toLowerCase().includes(q)
      )
    })
  }, [attendees, statusFilter, groupFilter, searchQuery, eventNameMap])

  // Reset visible count when filters change
  const visibleAttendees = useMemo(
    () => filteredAttendees.slice(0, visibleCount),
    [filteredAttendees, visibleCount],
  )
  const hasMore = filteredAttendees.length > visibleCount

  // ── Manual check-in ──────────────────────────────────────────────────────

  const manualCheckIn = async (ticketId: string, qrCode: string) => {
    const ticket = attendees.find((a) => a.id === ticketId)
    const name = ticket?.user_name || 'Asistente'

    const queue = async () => {
      await outbox.enqueue({
        kind: 'scan',
        endpoint: '/api/scanner/scan',
        payload: { ticket_qr: qrCode },
        label: name,
      })
      patchAttendee({
        id: ticketId,
        status: 'used',
        scanned_at: new Date().toISOString(),
      })
      if (soundEnabled) playBeep(true)
      haptic(true)
      toast.warning(`${name} · check-in pendiente sync`)
    }

    try {
      if (!online) {
        await queue()
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sesion expirada')
        return
      }
      const res = await fetch('/api/scanner/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticket_qr: qrCode }),
      })
      if (!res.ok) {
        if (soundEnabled) playBeep(false)
        haptic(false)
        const errBody = await res.json().catch(() => ({}))
        toast.error(errBody.error || `Error ${res.status}`)
        return
      }
      const result: ScanResult = await res.json()
      if (soundEnabled) playBeep(result.success)
      haptic(result.success)
      if (result.success) {
        patchAttendee({
          id: ticketId,
          status: 'used',
          scanned_at: new Date().toISOString(),
        })
        toast.success(`${name} · validado`)
      } else if (result.error?.includes('escaneado')) {
        toast.warning(`${name} · ya escaneado`)
      } else {
        toast.error(result.error || 'Error')
      }
    } catch {
      await queue()
    }
  }

  // ── Undo scan ────────────────────────────────────────────────────────────

  const undoScan = async (ticketId: string) => {
    const ticket = attendees.find((a) => a.id === ticketId)
    const name = ticket?.user_name || 'Asistente'

    const queue = async () => {
      await outbox.enqueue({
        kind: 'undo',
        endpoint: '/api/scanner/undo',
        payload: { ticket_id: ticketId },
        label: name,
      })
      patchAttendee({ id: ticketId, status: 'valid', scanned_at: null })
      haptic(true)
      toast.warning(`${name} · undo pendiente sync`)
    }

    try {
      if (!online) {
        await queue()
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Sesion expirada')
        return
      }
      const res = await fetch('/api/scanner/undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      })
      if (res.ok) {
        patchAttendee({ id: ticketId, status: 'valid', scanned_at: null })
        haptic(true)
        toast.info(`${name} · deshecho`)
      } else {
        haptic(false)
        const errBody = await res.json().catch(() => ({}))
        toast.error(errBody.error || 'No se pudo deshacer')
      }
    } catch {
      await queue()
    }
  }

  // ── Export / Share ────────────────────────────────────────────────────────

  const generateExportMessage = useCallback(() => {
    const date = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    const pct = stats.total > 0 ? ((stats.scanned / stats.total) * 100).toFixed(1) : '0'

    let msg = `ASISTENCIA — ${venueName || 'Evento'}\n${date}\n\n`
    msg += `Total: ${stats.total}\n`
    msg += `Dentro: ${stats.scanned} (${pct}%)\n`
    msg += `Pendiente: ${stats.pending}\n`

    const doorTotal = attendees.filter((a) => a.qr_code.startsWith('DOOR-')).length
    if (doorTotal > 0) {
      msg += `Puerta: ${doorTotal}\n`
    }

    if (multipleEvents) {
      msg += '\n'
      for (const [eventId, name] of Object.entries(eventNameMap)) {
        const evAtt = attendees.filter((a) => a.event_id === eventId)
        const inside = evAtt.filter((a) => a.status === 'used').length
        const pending = evAtt.length - inside
        const doors = evAtt.filter((a) => a.qr_code.startsWith('DOOR-')).length
        msg += `\n${name}\n  ${inside} dentro / ${pending} pendiente${doors > 0 ? ` / ${doors} puerta` : ''}\n`
      }
    }

    const noShows = attendees.filter((a) => a.status !== 'used')
    if (noShows.length > 0) {
      msg += `\nPENDIENTES (${noShows.length}):\n`
      noShows.slice(0, 80).forEach((a) => {
        const name = a.user_name || 'Sin nombre'
        const group = multipleEvents ? ` (${eventNameMap[a.event_id] || ''})` : ''
        msg += `- ${name}${group}\n`
      })
      if (noShows.length > 80) msg += `... y ${noShows.length - 80} mas\n`
    }

    return msg
  }, [attendees, eventNameMap, multipleEvents, stats, venueName])

  const shareExport = async () => {
    const msg = generateExportMessage()
    if (navigator.share) {
      try {
        await navigator.share({ text: msg })
        return
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(msg)
      setCopied(true)
      haptic(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* */
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setVisibleCount(INITIAL_VISIBLE)
          }}
          placeholder={
            multipleEvents ? 'Buscar nombre, email o grupo...' : 'Buscar asistente...'
          }
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/10 text-white/50 hover:text-white/80 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5">
        {(
          [
            { key: 'all' as const, label: 'Todos', count: stats.total },
            { key: 'inside' as const, label: 'Dentro', count: stats.scanned },
            { key: 'pending' as const, label: 'Pendiente', count: stats.pending },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setStatusFilter(f.key)
              setVisibleCount(INITIAL_VISIBLE)
            }}
            className={cn(
              'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center',
              statusFilter === f.key
                ? f.key === 'inside'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                  : f.key === 'pending'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-primary/15 text-primary border border-primary/20'
                : 'bg-white/5 text-white-muted border border-transparent',
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Group filter */}
      {multipleEvents && (
        <EventDayGroups
          eventsByDay={eventsByDay}
          selectedId={groupFilter}
          onSelect={(id) => {
            setGroupFilter(id)
            setVisibleCount(INITIAL_VISIBLE)
          }}
          showAll
          totalCount={eventIds.length}
        />
      )}

      {/* Actions row */}
      <div className="flex gap-2">
        <button onClick={shareExport} className="flex-1 btn-ghost py-2 text-xs">
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Share2 className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copiado!' : 'Compartir resumen'}
        </button>
        <button onClick={loadAttendees} className="flex-1 btn-ghost py-2 text-xs">
          <RefreshCw className={cn('w-3.5 h-3.5', loadingAttendees && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Filtered count */}
      {(statusFilter !== 'all' || groupFilter !== 'all' || searchQuery) && (
        <p className="text-[11px] text-white/30 text-center">
          {filteredAttendees.length} de {attendees.length} asistentes
        </p>
      )}

      {/* Attendee list */}
      <div className="space-y-2">
        {visibleAttendees.map((attendee) => (
          <div key={attendee.id} className="card p-3.5 flex items-center gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                attendee.status === 'used' ? 'bg-emerald-500/15' : 'bg-white/5',
              )}
            >
              {attendee.status === 'used' ? (
                <UserCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <Users className="w-4 h-4 text-white-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                {attendee.user_name || 'Sin nombre'}
                {attendee.qr_code.startsWith('DOOR-') && (
                  <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">
                    PUERTA
                  </span>
                )}
              </p>
              <p className="text-[11px] text-white-muted truncate">
                {multipleEvents && eventNameMap[attendee.event_id]
                  ? `${eventNameMap[attendee.event_id]} · `
                  : ''}
                {attendee.qr_code.startsWith('DOOR-')
                  ? 'Pago en puerta'
                  : attendee.user_email}
              </p>
            </div>
            {attendee.status === 'used' ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {attendee.scanned_at && (
                  <span className="text-[10px] text-white/25 tabular-nums flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {formatTime(attendee.scanned_at)}
                  </span>
                )}
                <span className="text-[10px] text-emerald-400 font-medium px-2 py-1 rounded-full bg-emerald-500/10">
                  Dentro
                </span>
                <button
                  onClick={() => undoScan(attendee.id)}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-white/30 active:bg-white/10 active:text-white/60 transition-all"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => manualCheckIn(attendee.id, attendee.qr_code)}
                className="text-[10px] text-primary font-medium px-2.5 py-1 rounded-full bg-primary/10 active:scale-95 transition-transform flex-shrink-0"
              >
                Check-in
              </button>
            )}
          </div>
        ))}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={() => setVisibleCount((c) => c + LOAD_MORE_STEP)}
            className="w-full py-3 text-center text-xs text-white-muted bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
          >
            Mostrar mas ({filteredAttendees.length - visibleCount} restantes)
          </button>
        )}

        {/* Empty state */}
        {filteredAttendees.length === 0 && (
          <div className="text-center py-8">
            <Users className="w-8 h-8 text-white-muted mx-auto mb-2" />
            <p className="text-white-muted text-sm">
              {searchQuery || statusFilter !== 'all' || groupFilter !== 'all'
                ? 'No se encontraron resultados'
                : 'No hay asistentes aun'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
