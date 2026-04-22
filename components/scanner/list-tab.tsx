'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Search,
  Users,
  UserCheck,
  RefreshCw,
  Clock,
  Share2,
  Check,
  Undo2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useScanner } from './scanner-provider'
import { playBeep, haptic, formatTime } from './scanner-utils'
import { useToast } from '@/components/ui/toast'
import * as outbox from '@/lib/scanner-outbox'
import { fuzzyMatchAny } from '@/lib/fuzzy-match'
import type { ScanResult } from './scanner-types'

const INITIAL_VISIBLE = 50
const LOAD_MORE_STEP = 50

/**
 * ListTab — lista/búsqueda de asistentes del día seleccionado.
 *
 * El scope viene del DÍA elegido en la EventPicker del top. Dentro de un día
 * todos los grupos se mezclan; si hay >1 grupo se muestra el nombre del
 * grupo en cada fila (meta text) para que la persona de lista distinga.
 * No hay filtro por grupo — era redundante con la picker de arriba.
 *
 * Diseño oscuro alineado con el resto de la app:
 *   - Inputs y filtros en glass-strong dark con border-white/10
 *   - Pills de estado con colores translúcidos (emerald-500/15 dentro,
 *     amber-500/15 pendiente, primary/15 todos)
 *   - Filas de asistente en glass-strong rounded-xl con accent primary en
 *     el botón de check-in
 *   - Asistente "dentro" muestra icono emerald + pill verde; pendiente muestra
 *     icono blanco sobre superficie neutra + botón check-in primary
 *   - Chip "PUERTA" en amber-500/20 para distinguir pagos en puerta
 *   - Highlight keyboard (j/k/Enter) con ring primary/40 visible pero no invasivo
 */
export function ListTab() {
  const {
    // filteredAttendees is scoped to the selected day; the list tab always
    // reads from that scoped set.
    filteredAttendees,
    loadAttendees,
    loadingAttendees,
    eventNameMap,
    stats,
    eventIds,
    multipleEventsInDay,
    soundEnabled,
    venueName,
    online,
    patchAttendee,
  } = useScanner()
  // Within the list, "attendees" always means the filtered (scoped) set.
  const attendees = filteredAttendees
  const toast = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'pending'>('all')
  const [copied, setCopied] = useState(false)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement | null>>(new Map())

  // ── Filters ──────────────────────────────────────────────────────────────

  // "searchedAttendees" = the day-scoped set further narrowed by search +
  // status filter. No group filter — we already picked a day up top.
  const searchedAttendees = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed && statusFilter === 'all') {
      return attendees
    }
    // When there's a search query, compute a score per row and sort best-first.
    // Without a query we preserve the original attendee order.
    const scored: Array<{ att: typeof attendees[number]; score: number }> = []
    for (const a of attendees) {
      if (statusFilter === 'inside' && a.status !== 'used') continue
      if (statusFilter === 'pending' && a.status === 'used') continue
      if (!trimmed) {
        scored.push({ att: a, score: 0 })
        continue
      }
      const r = fuzzyMatchAny(trimmed, [
        a.user_name,
        a.user_email,
        eventNameMap[a.event_id] || null,
      ])
      if (r.matches) scored.push({ att: a, score: r.score })
    }
    if (trimmed) scored.sort((x, y) => y.score - x.score)
    return scored.map((s) => s.att)
  }, [attendees, statusFilter, searchQuery, eventNameMap])

  // Reset visible count when filters change
  const visibleAttendees = useMemo(
    () => searchedAttendees.slice(0, visibleCount),
    [searchedAttendees, visibleCount],
  )
  const hasMore = searchedAttendees.length > visibleCount

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

  // ── Keyboard shortcuts (desktop / external keyboard only) ───────────────

  const visibleIds = useMemo(
    () => searchedAttendees.slice(0, visibleCount).map((a) => a.id),
    [searchedAttendees, visibleCount],
  )

  // Reset highlight when the visible set changes out from under it
  useEffect(() => {
    if (highlightedId && !visibleIds.includes(highlightedId)) {
      setHighlightedId(visibleIds[0] ?? null)
    }
  }, [visibleIds, highlightedId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      // `/` always focuses search, even from inside inputs? No — only outside.
      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }

      // The rest only when not typing
      if (isInput) return

      if (e.key === 'j' || e.key === 'ArrowDown') {
        if (visibleIds.length === 0) return
        e.preventDefault()
        setHighlightedId((prev) => {
          const idx = prev ? visibleIds.indexOf(prev) : -1
          const nextIdx = Math.min(visibleIds.length - 1, idx + 1)
          const nextId = visibleIds[nextIdx]
          const el = rowRefs.current.get(nextId)
          el?.scrollIntoView({ block: 'nearest' })
          return nextId
        })
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        if (visibleIds.length === 0) return
        e.preventDefault()
        setHighlightedId((prev) => {
          const idx = prev ? visibleIds.indexOf(prev) : 0
          const nextIdx = Math.max(0, idx - 1)
          const nextId = visibleIds[nextIdx]
          const el = rowRefs.current.get(nextId)
          el?.scrollIntoView({ block: 'nearest' })
          return nextId
        })
      } else if (e.key === 'Enter' && highlightedId) {
        e.preventDefault()
        const att = attendees.find((a) => a.id === highlightedId)
        if (att && att.status !== 'used') manualCheckIn(att.id, att.qr_code)
      } else if (e.key === 'u' && highlightedId) {
        e.preventDefault()
        const att = attendees.find((a) => a.id === highlightedId)
        if (att && att.status === 'used') undoScan(att.id)
      } else if (e.key === 'Escape' && highlightedId) {
        setHighlightedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // manualCheckIn / undoScan are intentionally omitted: they are stable
    // closures over the current render; the shortcuts should reflect the
    // latest attendees/highlighted at key time, which they do via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds, highlightedId, attendees])

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

    if (multipleEventsInDay) {
      // Break the day down by group when it has more than one.
      const eventsInScope = new Set(attendees.map((a) => a.event_id))
      msg += '\n'
      for (const eventId of eventsInScope) {
        const name = eventNameMap[eventId] || ''
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
        const group = multipleEventsInDay ? ` (${eventNameMap[a.event_id] || ''})` : ''
        msg += `- ${name}${group}\n`
      })
      if (noShows.length > 80) msg += `... y ${noShows.length - 80} mas\n`
    }

    return msg
  }, [attendees, eventNameMap, multipleEventsInDay, stats, venueName])

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
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setVisibleCount(INITIAL_VISIBLE)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchQuery('')
              searchInputRef.current?.blur()
            } else if (e.key === 'Enter' && searchedAttendees.length > 0) {
              e.preventDefault()
              const first = searchedAttendees[0]
              setHighlightedId(first.id)
              if (first.status !== 'used') {
                manualCheckIn(first.id, first.qr_code)
                setSearchQuery('')
              }
            }
          }}
          placeholder={
            multipleEventsInDay
              ? 'Buscar nombre, email o grupo...'
              : 'Buscar asistente...'
          }
          className="w-full pl-10 pr-10 py-3 rounded-xl border border-white/10 bg-white/[0.04] text-white placeholder:text-white/35 text-sm focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/15 transition-all shadow-soft"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/[0.08] text-white/50 hover:bg-white/15 hover:text-white transition-colors"
            aria-label="Limpiar búsqueda"
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
              'flex-1 px-2 py-2 rounded-lg text-[11px] font-semibold transition-all text-center border',
              statusFilter === f.key
                ? f.key === 'inside'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-soft'
                  : f.key === 'pending'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35 shadow-soft'
                    : 'bg-primary/15 text-primary-light border-primary/45 shadow-soft'
                : 'bg-white/[0.03] text-white/70 border-white/[0.08] hover:border-white/15 hover:bg-white/[0.05]',
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Actions row */}
      <div className="flex gap-2">
        <button
          onClick={shareExport}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/10 text-white/80 hover:bg-white/[0.07] hover:text-white active:scale-[0.98] transition-all shadow-soft"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Share2 className="w-3.5 h-3.5 text-primary-light" />
          )}
          {copied ? 'Copiado!' : 'Compartir resumen'}
        </button>
        <button
          onClick={loadAttendees}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.04] border border-white/10 text-white/80 hover:bg-white/[0.07] hover:text-white active:scale-[0.98] transition-all shadow-soft"
        >
          <RefreshCw
            className={cn(
              'w-3.5 h-3.5 text-primary-light',
              loadingAttendees && 'animate-spin',
            )}
          />
          Actualizar
        </button>
      </div>

      {/* Filtered count */}
      {(statusFilter !== 'all' || searchQuery) && (
        <p className="text-[11px] text-white/55 text-center">
          {searchedAttendees.length} de {attendees.length} asistentes
        </p>
      )}

      {/* Attendee list */}
      <div className="space-y-2">
        {visibleAttendees.map((attendee) => {
          const isUsed = attendee.status === 'used'
          const isDoor = attendee.qr_code.startsWith('DOOR-')
          const highlighted = highlightedId === attendee.id
          return (
            <div
              key={attendee.id}
              ref={(el) => {
                if (el) rowRefs.current.set(attendee.id, el)
                else rowRefs.current.delete(attendee.id)
              }}
              onClick={() => setHighlightedId(attendee.id)}
              className={cn(
                'glass-strong rounded-xl shadow-soft p-3.5 flex items-center gap-3 transition-all cursor-pointer',
                highlighted && 'ring-2 ring-primary/45 border-primary/45',
              )}
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border',
                  isUsed
                    ? 'bg-emerald-500/15 border-emerald-500/30'
                    : 'bg-white/[0.05] border-white/[0.08]',
                )}
              >
                {isUsed ? (
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Users className="w-4 h-4 text-white/55" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                  {attendee.user_name || 'Sin nombre'}
                  {isDoor && (
                    <span className="text-[9px] text-amber-300 bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 rounded font-bold shrink-0 tracking-wider">
                      PUERTA
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-white/55 truncate">
                  {/* Show event/group name on each row only when the day has
                      more than one group — otherwise the label would be the
                      same for every row (noise). */}
                  {multipleEventsInDay && eventNameMap[attendee.event_id]
                    ? `${eventNameMap[attendee.event_id]} · `
                    : ''}
                  {isDoor ? 'Pago en puerta' : attendee.user_email}
                </p>
              </div>
              {isUsed ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {attendee.scanned_at && (
                    <span className="text-[10px] text-white/40 tabular-nums flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTime(attendee.scanned_at)}
                    </span>
                  )}
                  <span className="text-[10px] text-emerald-300 font-bold px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                    Dentro
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      undoScan(attendee.id)
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white/[0.06] text-white/55 hover:bg-white/15 hover:text-white transition-all"
                    aria-label="Deshacer check-in"
                  >
                    <Undo2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    manualCheckIn(attendee.id, attendee.qr_code)
                  }}
                  className="text-[10px] text-white font-bold px-2.5 py-1.5 rounded-full bg-gradient-to-br from-primary-light via-primary to-primary-dark shadow-[0_2px_10px_rgba(228,30,43,0.4)] active:scale-95 transition-transform flex-shrink-0"
                >
                  Check-in
                </button>
              )}
            </div>
          )
        })}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={() => setVisibleCount((c) => c + LOAD_MORE_STEP)}
            className="w-full py-3 text-center text-xs text-white/70 font-semibold bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.06] hover:border-white/15 transition-all shadow-soft"
          >
            Mostrar mas ({searchedAttendees.length - visibleCount} restantes)
          </button>
        )}

        {/* Empty state */}
        {searchedAttendees.length === 0 && (
          <div className="text-center py-10 glass-strong rounded-2xl shadow-soft">
            <Users className="w-8 h-8 text-white/30 mx-auto mb-2" />
            <p className="text-white/55 text-sm">
              {searchQuery || statusFilter !== 'all'
                ? 'No se encontraron resultados'
                : 'No hay asistentes aun'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
