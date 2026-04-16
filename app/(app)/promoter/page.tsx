'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import {
  Search, UserPlus, Check, ChevronDown, Users, TrendingUp,
  Megaphone, Loader2, Copy, DoorOpen, Send, Bell, BellRing,
  ChevronRight, UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']

interface OrgUser {
  id: string
  email: string
  full_name: string | null
  gender: string | null
}

interface AssignedUser extends OrgUser {
  isInEvent: boolean
}

interface DoorEntry {
  id: string
  full_name: string | null
  created_at: string
}

export default function PromoterPage() {
  const { user, profile, organization, event: currentEvent, isPromoter, isAdmin, isSuperAdmin, initialized } = useAuth()
  const { error: showError, success } = useToast()

  // Event selection
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [showEventPicker, setShowEventPicker] = useState(false)

  // Promoter code
  const [myCode, setMyCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  // Stats
  const [stats, setStats] = useState({ total: 0, byMe: 0, doorByMe: 0 })

  // Door entries by this promoter
  const [doorEntries, setDoorEntries] = useState<DoorEntry[]>([])
  const [showDoorList, setShowDoorList] = useState(false)

  // Attendee list
  const [attendees, setAttendees] = useState<OrgUser[]>([])
  const [showAttendees, setShowAttendees] = useState(false)
  const [attendeesLoading, setAttendeesLoading] = useState(false)

  // User search + create
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AssignedUser[]>([])
  const [searching, setSearching] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newGender, setNewGender] = useState('')
  const [creating, setCreating] = useState(false)

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastPush, setBroadcastPush] = useState(false)
  const [sendingBroadcast, setSendingBroadcast] = useState(false)

  // Load events for the selector
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('events').select('*').eq('organization_id', organization.id).order('date', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setAllEvents(data)
          if (currentEvent?.id) setSelectedEventId(currentEvent.id)
          else if (data.length > 0) setSelectedEventId(data[0].id)
        }
      })
  }, [organization?.id, currentEvent?.id])

  // Load promoter's access code
  useEffect(() => {
    if (!user?.id) return
    supabase.from('access_codes').select('code').eq('used_by', user.id).limit(1).maybeSingle()
      .then(({ data }) => { if (data) setMyCode(data.code) })
  }, [user?.id])

  // Load stats + door entries for selected event
  useEffect(() => {
    if (!selectedEventId || !user?.id) return

    const loadStats = async () => {
      const [totalRes, byMeRes] = await Promise.all([
        supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', selectedEventId).eq('role', 'attendee'),
        supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', selectedEventId).eq('added_by', user.id),
      ])

      // Count door entries by this promoter
      // Door entries are users with email like 'door.%@puerta.local' added by this promoter
      const { data: addedUsers } = await supabase
        .from('user_events')
        .select('user_id')
        .eq('event_id', selectedEventId)
        .eq('added_by', user.id)

      let doorCount = 0
      const doorList: DoorEntry[] = []

      if (addedUsers && addedUsers.length > 0) {
        const ids = addedUsers.map(u => u.user_id)
        const { data: doorUsers } = await supabase
          .from('users')
          .select('id, full_name, created_at, email')
          .in('id', ids)
          .like('email', 'door.%@puerta.local')
          .order('created_at', { ascending: false })

        if (doorUsers) {
          doorCount = doorUsers.length
          doorList.push(...doorUsers.map(u => ({ id: u.id, full_name: u.full_name, created_at: u.created_at })))
        }
      }

      setStats({ total: totalRes.count || 0, byMe: byMeRes.count || 0, doorByMe: doorCount })
      setDoorEntries(doorList)
    }

    loadStats()
  }, [selectedEventId, user?.id])

  // Load full attendee list for event
  const loadAttendees = async () => {
    if (!selectedEventId) return
    setAttendeesLoading(true)
    try {
      const { data: ue } = await supabase
        .from('user_events')
        .select('user_id')
        .eq('event_id', selectedEventId)
        .eq('role', 'attendee')

      if (ue && ue.length > 0) {
        const ids = ue.map(u => u.user_id)
        const { data: users } = await supabase
          .from('users')
          .select('id, email, full_name, gender')
          .in('id', ids)
          .not('email', 'like', 'door.%@puerta.local')
          .order('full_name')

        setAttendees(users || [])
      } else {
        setAttendees([])
      }
    } catch {
      showError('Error cargando asistentes')
    } finally {
      setAttendeesLoading(false)
    }
  }

  // Copy code
  const handleCopyCode = async () => {
    if (!myCode) return
    const formatted = myCode.length === 8 ? myCode.slice(0, 4) + '-' + myCode.slice(4) : myCode
    try {
      await navigator.clipboard.writeText(formatted)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      showError('Error al copiar')
    }
  }

  // Search users
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !organization?.id || !selectedEventId) return
    setSearching(true)
    try {
      const q = searchQuery.trim().toLowerCase()
      const { data: users } = await supabase
        .from('users')
        .select('id, email, full_name, gender')
        .eq('organization_id', organization.id)
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
        .not('email', 'like', 'door.%@puerta.local')
        .limit(20)

      if (!users) { setSearchResults([]); return }

      const userIds = users.map(u => u.id)
      const { data: memberships } = await supabase
        .from('user_events')
        .select('user_id')
        .eq('event_id', selectedEventId)
        .in('user_id', userIds)

      const inEventSet = new Set(memberships?.map(m => m.user_id) || [])
      setSearchResults(users.map(u => ({ ...u, isInEvent: inEventSet.has(u.id) })))
    } catch {
      showError('Error buscando usuarios')
    } finally {
      setSearching(false)
    }
  }, [searchQuery, organization?.id, selectedEventId, showError])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSearch() }
  }

  // Assign existing user
  const handleAssign = async (targetUserId: string) => {
    if (!selectedEventId || !user?.id) return
    setAssigningId(targetUserId)
    try {
      const res = await authFetch('/api/promoter/assign-user', { userId: targetUserId, eventId: selectedEventId, addedBy: user.id })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error'); return }
      success('Usuario asignado al evento')
      setSearchResults(prev => prev.map(u => u.id === targetUserId ? { ...u, isInEvent: true } : u))
      setStats(prev => ({ ...prev, total: prev.total + 1, byMe: prev.byMe + 1 }))
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error al asignar')
    } finally {
      setAssigningId(null)
    }
  }

  // Create new user
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newEmail || !selectedEventId || !user?.id) return
    setCreating(true)
    try {
      const res = await authFetch('/api/promoter/create-user', {
        email: newEmail, fullName: newName, gender: newGender || null,
        eventId: selectedEventId, addedBy: user.id, organizationId: organization?.id || null,
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error'); return }
      success(data.alreadyExisted ? 'Usuario existente asignado' : 'Usuario creado y asignado')
      setNewName(''); setNewEmail(''); setNewGender(''); setShowCreate(false)
      setStats(prev => ({ ...prev, total: prev.total + 1, byMe: prev.byMe + 1 }))
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setCreating(false)
    }
  }

  // Send broadcast
  const handleBroadcast = async () => {
    if (!broadcastMsg.trim() || !selectedEventId || !user?.id || !organization?.id) return
    setSendingBroadcast(true)
    try {
      // Insert announcement message
      const { error: msgError } = await supabase.from('messages').insert({
        event_id: selectedEventId,
        user_id: user.id,
        content: broadcastMsg.trim(),
        is_announcement: true,
      })
      if (msgError) throw msgError

      // Log broadcast
      await supabase.from('broadcast_log').insert({
        organization_id: organization.id,
        event_ids: [selectedEventId],
        content: broadcastMsg.trim(),
        sent_by: user.id,
      })

      // Push notification
      if (broadcastPush) {
        try {
          await authFetch('/api/push', {
            title: 'Anuncio',
            body: broadcastMsg.trim().slice(0, 200),
            url: '/chat',
            event_ids: [selectedEventId],
          })
        } catch { /* push is best-effort */ }
      }

      success('Difusion enviada')
      setBroadcastMsg('')
      setBroadcastPush(false)
    } catch {
      showError('Error al enviar difusion')
    } finally {
      setSendingBroadcast(false)
    }
  }

  const selectedEvent = allEvents.find(e => e.id === selectedEventId)
  const formattedCode = myCode
    ? (myCode.length === 8 ? myCode.slice(0, 4) + '-' + myCode.slice(4) : myCode)
    : null

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-4 animate-fade-in">{[0, 1, 2].map(i => <div key={i} className="card h-20 animate-pulse" />)}</div>
  if (!isPromoter && !isAdmin && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Megaphone className="w-10 h-10 text-white-muted mb-3" />
        <p className="text-white-muted text-sm">No tienes acceso al panel de organizadores</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Panel Organizador</h1>
          <p className="text-xs text-white-muted">Gestiona asistentes y entradas en puerta</p>
        </div>
      </div>

      {/* ── Tu codigo de puerta ────────────────────────────────────── */}
      {formattedCode && (
        <div className="card p-4 space-y-2 border-amber-500/20">
          <p className="text-[11px] text-amber-400 font-semibold uppercase tracking-wider">Tu codigo de puerta</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono font-bold text-white tracking-[0.15em] flex-1">{formattedCode}</span>
            <button
              onClick={handleCopyCode}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                codeCopied
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-white/5 text-white-muted border border-black-border hover:border-amber-500/30 hover:text-amber-400'
              )}
            >
              {codeCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {codeCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-white-muted">
            Comparte este codigo con gente que quiera venir pagando en puerta
          </p>
        </div>
      )}

      {/* ── Event selector ─────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => setShowEventPicker(!showEventPicker)}
          className="card p-4 w-full flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <div className="text-left min-w-0">
            <p className="text-[11px] text-white-muted">Evento seleccionado</p>
            <p className="text-sm font-medium text-white truncate">
              {selectedEvent?.title || 'Seleccionar evento'}
            </p>
            {selectedEvent?.date && (
              <p className="text-[11px] text-white-muted">
                {new Date(selectedEvent.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <ChevronDown className={cn('w-4 h-4 text-white-muted transition-transform', showEventPicker && 'rotate-180')} />
        </button>
        {showEventPicker && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 card max-h-60 overflow-y-auto divide-y divide-white/5">
            {allEvents.map(ev => (
              <button
                key={ev.id}
                onClick={() => { setSelectedEventId(ev.id); setShowEventPicker(false); setSearchResults([]); setShowAttendees(false) }}
                className={cn('w-full text-left px-4 py-3 hover:bg-white/5 transition-colors', ev.id === selectedEventId && 'bg-primary/[0.06]')}
              >
                <p className={cn('text-sm font-medium truncate', ev.id === selectedEventId ? 'text-primary' : 'text-white')}>{ev.title}</p>
                <p className="text-[11px] text-white-muted">
                  {new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {ev.group_name && ` · ${ev.group_name}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Stats ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <Users className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.total}</p>
          <p className="text-[10px] text-white-muted">Asistentes</p>
        </div>
        <div className="card p-3 text-center">
          <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.byMe}</p>
          <p className="text-[10px] text-white-muted">Asignados</p>
        </div>
        <div className="card p-3 text-center">
          <DoorOpen className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.doorByMe}</p>
          <p className="text-[10px] text-white-muted">En puerta</p>
        </div>
      </div>

      {/* ── Pagan en puerta ────────────────────────────────────────── */}
      {stats.doorByMe > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShowDoorList(!showDoorList)}
            className="w-full flex items-center justify-between p-4 active:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">Pagan en puerta ({stats.doorByMe})</span>
            </div>
            <ChevronRight className={cn('w-4 h-4 text-white-muted transition-transform', showDoorList && 'rotate-90')} />
          </button>
          {showDoorList && (
            <div className="border-t border-black-border divide-y divide-white/5 max-h-60 overflow-y-auto">
              {doorEntries.map(entry => (
                <div key={entry.id} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-white">{entry.full_name || 'Sin nombre'}</span>
                  <span className="text-[10px] text-white-muted">
                    {new Date(entry.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Enviar difusion ────────────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-primary" /> Enviar difusion a tu grupo
        </h2>
        <textarea
          value={broadcastMsg}
          onChange={e => setBroadcastMsg(e.target.value)}
          placeholder="Escribe un mensaje para todos los asistentes..."
          rows={3}
          className={cn(inputClass, 'resize-none')}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setBroadcastPush(!broadcastPush)}
              className={cn('relative w-10 h-5 rounded-full transition-colors', broadcastPush ? 'bg-primary' : 'bg-white/10')}
            >
              <div className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform', broadcastPush && 'translate-x-5')} />
            </button>
            <span className={cn('text-xs flex items-center gap-1', broadcastPush ? 'text-white' : 'text-white-muted')}>
              {broadcastPush ? <BellRing className="w-3.5 h-3.5 text-primary" /> : <Bell className="w-3.5 h-3.5" />} Push
            </span>
          </label>
          <button
            onClick={handleBroadcast}
            disabled={!broadcastMsg.trim() || !selectedEventId || sendingBroadcast}
            className="btn-primary px-4 py-2 text-xs disabled:opacity-40"
          >
            {sendingBroadcast ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {sendingBroadcast ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>

      {/* ── Lista de asistentes ────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <button
          onClick={() => { if (!showAttendees) loadAttendees(); setShowAttendees(!showAttendees) }}
          className="w-full flex items-center justify-between p-4 active:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Lista de asistentes ({stats.total})</span>
          </div>
          {attendeesLoading ? (
            <Loader2 className="w-4 h-4 text-white-muted animate-spin" />
          ) : (
            <ChevronRight className={cn('w-4 h-4 text-white-muted transition-transform', showAttendees && 'rotate-90')} />
          )}
        </button>
        {showAttendees && !attendeesLoading && (
          <div className="border-t border-black-border divide-y divide-white/5 max-h-[400px] overflow-y-auto">
            {attendees.length === 0 ? (
              <p className="text-sm text-white-muted text-center py-6">No hay asistentes registrados</p>
            ) : attendees.map(a => (
              <div key={a.id} className="px-4 py-2.5">
                <p className="text-sm text-white">{a.full_name || 'Sin nombre'}</p>
                <p className="text-[10px] text-white-muted">{a.email}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Buscar / Crear usuario ─────────────────────────────────── */}
      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" /> Buscar usuario existente
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Nombre o email..."
            className={cn(inputClass, 'flex-1')}
          />
          <button onClick={handleSearch} disabled={searching || !searchQuery.trim()} className="btn-primary px-4 text-sm">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {searchResults.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-black-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{u.full_name || 'Sin nombre'}</p>
                  <p className="text-[11px] text-white-muted truncate">{u.email}</p>
                </div>
                {u.isInEvent ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                    <Check className="w-3 h-3" /> Asignado
                  </span>
                ) : (
                  <button
                    onClick={() => handleAssign(u.id)}
                    disabled={assigningId === u.id}
                    className="btn-primary text-xs px-3 py-1.5"
                  >
                    {assigningId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                    <span className="ml-1">Agregar</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-amber-400" /> Crear nuevo usuario
          </h2>
          <button onClick={() => setShowCreate(!showCreate)} className="text-xs text-primary">
            {showCreate ? 'Cerrar' : 'Abrir'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreate} className="space-y-3">
            <input type="text" placeholder="Nombre completo *" value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} required />
            <input type="email" placeholder="Email *" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputClass} required />
            <select value={newGender} onChange={e => setNewGender(e.target.value)} className={cn(inputClass, !newGender && 'text-gray-600')}>
              <option value="">Genero (opcional)</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="otro">Otro</option>
            </select>
            <p className="text-[11px] text-white-muted">El usuario podra acceder usando &quot;Olvide mi contraseña&quot; para crear su clave.</p>
            <button type="submit" disabled={creating || !newName || !newEmail} className="btn-primary w-full py-3 text-sm">
              {creating ? 'Creando...' : 'Crear y asignar al evento'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
