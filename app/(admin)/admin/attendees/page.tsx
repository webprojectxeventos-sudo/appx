'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { Pagination } from '@/components/admin/pagination'
import { BanModal } from '@/components/admin/attendees/ban-modal'
import { cn } from '@/lib/utils'
import {
  Users, VolumeX, Volume2, Shield, ShieldOff, ScanLine, Clock,
  User, Filter, ChevronDown,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type UserEvent = Database['public']['Tables']['user_events']['Row']
type ChatBan = Database['public']['Tables']['chat_bans']['Row']

interface AttendeeRow {
  userId: string
  fullName: string | null
  email: string
  avatarUrl: string | null
  gender: string | null
  eventId: string
  eventTitle: string
  groupName: string | null
  isMuted: boolean
  isCheckedIn: boolean
  scannedAt: string | null
  joinedAt: string
  ban: ChatBan | null
}

type StatusFilter = 'all' | 'checked_in' | 'pending' | 'muted' | 'banned'

const PAGE_SIZE = 30

export default function AttendeesPage() {
  const { user, isAdmin, isGroupAdmin, initialized } = useAuth()
  const { allEvents: events } = useAdminSelection()
  const { error: showError, success } = useToast()

  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  // Ban modal state
  const [banTarget, setBanTarget] = useState<{ userId: string; userName: string; eventIds: string[] } | null>(null)

  const fetchData = useCallback(async () => {
    const eventIds = events.map(e => e.id)
    if (eventIds.length === 0) { setAttendees([]); setLoading(false); return }

    try {
      // Fetch user_events for attendees
      const { data: ueData } = await supabase
        .from('user_events')
        .select('user_id, event_id, is_muted, joined_at, role')
        .in('event_id', eventIds)
        .eq('role', 'attendee')

      if (!ueData || ueData.length === 0) { setAttendees([]); setLoading(false); return }

      const userIds = [...new Set(ueData.map(ue => ue.user_id))]

      // Fetch users, bans, tickets in parallel
      const [usersRes, bansRes, ticketsRes] = await Promise.all([
        supabase.from('users').select('id, full_name, email, avatar_url, gender').in('id', userIds),
        supabase.from('chat_bans').select('*').in('event_id', eventIds).eq('is_active', true),
        supabase.from('tickets').select('user_id, event_id, scanned_at').in('event_id', eventIds).not('scanned_at', 'is', null),
      ])

      const usersMap = new Map<string, { full_name: string | null; email: string; avatar_url: string | null; gender: string | null }>()
      usersRes.data?.forEach(u => usersMap.set(u.id, u))

      const bansMap = new Map<string, ChatBan>()
      bansRes.data?.forEach(b => bansMap.set(`${b.user_id}_${b.event_id}`, b))

      const scannedSet = new Set<string>()
      const scannedTimes = new Map<string, string>()
      ticketsRes.data?.forEach(t => {
        const key = `${t.user_id}_${t.event_id}`
        scannedSet.add(key)
        if (t.scanned_at) scannedTimes.set(key, t.scanned_at)
      })

      const eventsMap = new Map(events.map(e => [e.id, e]))

      const rows: AttendeeRow[] = ueData.map(ue => {
        const u = usersMap.get(ue.user_id)
        const ev = eventsMap.get(ue.event_id)
        const key = `${ue.user_id}_${ue.event_id}`
        return {
          userId: ue.user_id,
          fullName: u?.full_name || null,
          email: u?.email || '',
          avatarUrl: u?.avatar_url || null,
          gender: u?.gender || null,
          eventId: ue.event_id,
          eventTitle: ev?.title || '',
          groupName: ev?.group_name || null,
          isMuted: ue.is_muted,
          isCheckedIn: scannedSet.has(key),
          scannedAt: scannedTimes.get(key) || null,
          joinedAt: ue.joined_at,
          ban: bansMap.get(key) || null,
        }
      })

      // Sort: checked-in first, then by name
      rows.sort((a, b) => {
        if (a.isCheckedIn !== b.isCheckedIn) return a.isCheckedIn ? -1 : 1
        return (a.fullName || '').localeCompare(b.fullName || '')
      })

      setAttendees(rows)
    } catch (err) {
      console.error('Error fetching attendees:', err)
      showError('Error cargando asistentes')
    } finally {
      setLoading(false)
    }
  }, [events, showError])

  useEffect(() => { fetchData() }, [fetchData])

  // Toggle mute
  const handleToggleMute = async (att: AttendeeRow) => {
    const { error } = await supabase
      .from('user_events')
      .update({ is_muted: !att.isMuted })
      .eq('user_id', att.userId)
      .eq('event_id', att.eventId)
    if (error) { showError('Error al cambiar silencio'); return }
    success(att.isMuted ? 'Usuario desilenciado' : 'Usuario silenciado')
    // Optimistic update
    setAttendees(prev => prev.map(a =>
      a.userId === att.userId && a.eventId === att.eventId
        ? { ...a, isMuted: !a.isMuted }
        : a
    ))
  }

  // Unban
  const handleUnban = async (att: AttendeeRow) => {
    if (!att.ban) return
    const { error } = await supabase
      .from('chat_bans')
      .update({ is_active: false })
      .eq('id', att.ban.id)
    if (error) { showError('Error al desbanear'); return }
    success('Ban eliminado')
    setAttendees(prev => prev.map(a =>
      a.userId === att.userId && a.eventId === att.eventId
        ? { ...a, ban: null }
        : a
    ))
  }

  // Filtering
  const filtered = useMemo(() => {
    return attendees.filter(att => {
      // Event filter
      if (eventFilter !== 'all' && att.eventId !== eventFilter) return false
      // Status filter
      if (statusFilter === 'checked_in' && !att.isCheckedIn) return false
      if (statusFilter === 'pending' && att.isCheckedIn) return false
      if (statusFilter === 'muted' && !att.isMuted) return false
      if (statusFilter === 'banned' && !att.ban) return false
      // Search
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !(att.fullName || '').toLowerCase().includes(q) &&
          !att.email.toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [attendees, eventFilter, statusFilter, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Stats
  const stats = useMemo(() => {
    const total = attendees.length
    const checkedIn = attendees.filter(a => a.isCheckedIn).length
    const muted = attendees.filter(a => a.isMuted).length
    const banned = attendees.filter(a => a.ban).length
    return { total, checkedIn, muted, banned }
  }, [attendees])

  if (!initialized) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="card h-24 animate-pulse" />
      </div>
    )
  }
  if (!isAdmin && !isGroupAdmin) return null

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Asistentes</h1>
        <p className="text-sm text-white-muted mt-0.5">
          Gestiona los asistentes de tus eventos
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5">
          <Users className="w-3.5 h-3.5 text-white-muted" />
          <span className="text-white font-bold">{stats.total}</span>
          <span className="text-white-muted">asistentes</span>
        </span>
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8">
          <ScanLine className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-400 font-bold">{stats.checkedIn}</span>
          <span className="text-white-muted">checked-in</span>
        </span>
        {stats.muted > 0 && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/8">
            <VolumeX className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-400 font-bold">{stats.muted}</span>
            <span className="text-white-muted">silenciados</span>
          </span>
        )}
        {stats.banned > 0 && (
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/8">
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span className="text-red-400 font-bold">{stats.banned}</span>
            <span className="text-white-muted">baneados</span>
          </span>
        )}
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Buscar por nombre o email..." />

        {/* Filter toggle (mobile) */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="md:hidden flex items-center gap-2 text-xs text-white-muted px-3 py-2 rounded-lg border border-black-border hover:bg-white/5 transition-colors"
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')} />
        </button>

        {/* Filters row */}
        <div className={cn('flex flex-wrap gap-2', !showFilters && 'hidden md:flex')}>
          {/* Status filters */}
          {([
            { value: 'all' as const, label: 'Todos' },
            { value: 'checked_in' as const, label: 'Checked-in' },
            { value: 'pending' as const, label: 'Pendientes' },
            { value: 'muted' as const, label: 'Silenciados' },
            { value: 'banned' as const, label: 'Baneados' },
          ]).map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                statusFilter === f.value
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-black-border text-white-muted hover:border-white/15'
              )}
            >
              {f.label}
            </button>
          ))}

          {/* Event filter */}
          {events.length > 1 && (
            <select
              value={eventFilter}
              onChange={e => { setEventFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-black-border bg-transparent text-white-muted focus:outline-none"
            >
              <option value="all">Todos los grupos</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.group_name || ev.title}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Attendees List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="card h-16 animate-pulse" />
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <div className="card p-10 text-center">
          <Users className="w-8 h-8 text-white-muted mx-auto mb-2 opacity-50" />
          <p className="text-white-muted text-sm">
            {search ? 'No se encontraron asistentes' : 'Sin asistentes en estos eventos'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden divide-y divide-black-border">
          {paginated.map(att => (
            <div
              key={`${att.userId}_${att.eventId}`}
              className={cn(
                'flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors group',
                att.ban && 'bg-red-500/[0.03]'
              )}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                {att.avatarUrl ? (
                  <img src={att.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-white-muted" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {att.fullName || 'Sin nombre'}
                  </span>
                  {/* Badges */}
                  {att.isCheckedIn && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 shrink-0">
                      CHECK-IN
                    </span>
                  )}
                  {att.isMuted && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 shrink-0">
                      MUTED
                    </span>
                  )}
                  {att.ban && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 shrink-0">
                      BANEADO
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-white-muted truncate">{att.email}</span>
                  {events.length > 1 && (
                    <span className="text-[10px] text-white-muted/60 truncate hidden md:inline">
                      {att.groupName || att.eventTitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                {/* Mute toggle */}
                <button
                  onClick={() => handleToggleMute(att)}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    att.isMuted
                      ? 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20'
                      : 'text-white-muted hover:text-yellow-400 hover:bg-yellow-500/10'
                  )}
                  title={att.isMuted ? 'Desilenciar' : 'Silenciar'}
                >
                  {att.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Ban/Unban toggle */}
                {att.ban ? (
                  <button
                    onClick={() => handleUnban(att)}
                    className="p-2 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    title="Quitar ban"
                  >
                    <ShieldOff className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setBanTarget({
                      userId: att.userId,
                      userName: att.fullName || att.email,
                      eventIds: [att.eventId],
                    })}
                    className="p-2 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Banear del chat"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Ban Modal */}
      <BanModal
        open={!!banTarget}
        onClose={() => setBanTarget(null)}
        userId={banTarget?.userId || ''}
        userName={banTarget?.userName || ''}
        eventIds={banTarget?.eventIds || []}
        bannedBy={user?.id || ''}
        onBanned={fetchData}
      />
    </div>
  )
}
