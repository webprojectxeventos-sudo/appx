'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import {
  Search, UserPlus, Check, ChevronDown, Users, TrendingUp,
  Megaphone, UserCheck, Loader2,
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

export default function PromoterPage() {
  const { user, profile, organization, event: currentEvent, events, isPromoter, isAdmin, isSuperAdmin, initialized } = useAuth()
  const { error: showError, success } = useToast()

  // Event selection
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string>('')
  const [showEventPicker, setShowEventPicker] = useState(false)

  // User search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AssignedUser[]>([])
  const [searching, setSearching] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  // Create new user
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newGender, setNewGender] = useState('')
  const [creating, setCreating] = useState(false)

  // Stats
  const [stats, setStats] = useState({ total: 0, byMe: 0 })

  // Load events for the selector
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('events').select('*').eq('organization_id', organization.id).order('date', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setAllEvents(data)
          // Auto-select current event or first event
          if (currentEvent?.id) setSelectedEventId(currentEvent.id)
          else if (data.length > 0) setSelectedEventId(data[0].id)
        }
      })
  }, [organization?.id, currentEvent?.id])

  // Load stats for selected event
  useEffect(() => {
    if (!selectedEventId || !user?.id) return
    const loadStats = async () => {
      const [totalRes, byMeRes] = await Promise.all([
        supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', selectedEventId).eq('role', 'attendee'),
        supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', selectedEventId).eq('added_by', user.id),
      ])
      setStats({ total: totalRes.count || 0, byMe: byMeRes.count || 0 })
    }
    loadStats()
  }, [selectedEventId, user?.id])

  // Search users in the organization
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
        .limit(20)

      if (!users) { setSearchResults([]); return }

      // Check which are already in the selected event
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

  // Auto-search on Enter
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSearch() }
  }

  // Assign existing user to event
  const handleAssign = async (targetUserId: string) => {
    if (!selectedEventId || !user?.id) return
    setAssigningId(targetUserId)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch('/api/promoter/assign-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
        },
        body: JSON.stringify({ userId: targetUserId, eventId: selectedEventId, addedBy: user.id }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error'); return }
      success('Usuario asignado al evento')
      // Update local state
      setSearchResults(prev => prev.map(u => u.id === targetUserId ? { ...u, isInEvent: true } : u))
      setStats(prev => ({ ...prev, total: prev.total + 1, byMe: prev.byMe + 1 }))
    } catch {
      showError('Error al asignar')
    } finally {
      setAssigningId(null)
    }
  }

  // Create new user and assign to event
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName || !newEmail || !selectedEventId || !user?.id) return
    setCreating(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch('/api/promoter/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: newEmail,
          fullName: newName,
          gender: newGender || null,
          eventId: selectedEventId,
          addedBy: user.id,
          organizationId: organization?.id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error'); return }
      success(data.alreadyExisted ? 'Usuario existente asignado al evento' : 'Usuario creado y asignado')
      setNewName('')
      setNewEmail('')
      setNewGender('')
      setShowCreate(false)
      setStats(prev => ({ ...prev, total: prev.total + 1, byMe: prev.byMe + 1 }))
    } catch {
      showError('Error al crear usuario')
    } finally {
      setCreating(false)
    }
  }

  const selectedEvent = allEvents.find(e => e.id === selectedEventId)
  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-4 animate-fade-in">{[0,1,2].map(i => <div key={i} className="card h-20 animate-pulse" />)}</div>
  if (!isPromoter && !isAdmin && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Megaphone className="w-10 h-10 text-white-muted mb-3" />
        <p className="text-white-muted text-sm">No tienes acceso al panel de promotores</p>
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
          <h1 className="text-lg font-bold text-white">Panel Promotor</h1>
          <p className="text-xs text-white-muted">Asigna personas a eventos</p>
        </div>
      </div>

      {/* Event selector */}
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
          <ChevronDown className={cn("w-4 h-4 text-white-muted transition-transform", showEventPicker && "rotate-180")} />
        </button>
        {showEventPicker && (
          <div className="absolute top-full left-0 right-0 z-20 mt-1 card max-h-60 overflow-y-auto divide-y divide-white/5">
            {allEvents.map(ev => (
              <button
                key={ev.id}
                onClick={() => { setSelectedEventId(ev.id); setShowEventPicker(false); setSearchResults([]) }}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-white/5 transition-colors",
                  ev.id === selectedEventId && "bg-primary/[0.06]"
                )}
              >
                <p className={cn("text-sm font-medium truncate", ev.id === selectedEventId ? "text-primary" : "text-white")}>{ev.title}</p>
                <p className="text-[11px] text-white-muted">
                  {new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  {ev.group_name && ` · ${ev.group_name}`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 text-center">
          <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-white">{stats.total}</p>
          <p className="text-[11px] text-white-muted">Asistentes</p>
        </div>
        <div className="card p-4 text-center">
          <TrendingUp className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-white">{stats.byMe}</p>
          <p className="text-[11px] text-white-muted">Asignados por ti</p>
        </div>
      </div>

      {/* Search existing users */}
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

        {/* Results */}
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
                    <Check className="w-3 h-3" /> Ya asignado
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

      {/* Create new user */}
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
