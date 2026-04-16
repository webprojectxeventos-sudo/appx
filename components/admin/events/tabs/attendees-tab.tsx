'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/lib/auth-context'
import { Pagination } from '@/components/admin/pagination'
import { cn } from '@/lib/utils'
import {
  Search,
  Users,
  ScanLine,
  Shield,
  User,
  Megaphone,
  Mail,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  Check,
  X,
  Loader2,
  Download,
  Ticket,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type UserRow = Database['public']['Tables']['users']['Row']
type UserEvent = Database['public']['Tables']['user_events']['Row']
type TicketRow = Database['public']['Tables']['tickets']['Row']

interface Attendee {
  user: UserRow
  membership: UserEvent
  ticket: TicketRow | null
}

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof User }> = {
  super_admin: { label: 'Super Admin', color: 'text-red-400', bg: 'bg-red-500/10', icon: Shield },
  admin: { label: 'Admin', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: Shield },
  group_admin: { label: 'Group Admin', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Shield },
  scanner: { label: 'Scanner', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: ScanLine },
  promoter: { label: 'Organizador', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Megaphone },
  cloakroom: { label: 'Ropero', color: 'text-pink-400', bg: 'bg-pink-500/10', icon: User },
  attendee: { label: 'Asistente', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: User },
}

const ROLE_OPTIONS = [
  { key: 'attendee', label: 'Asistente' },
  { key: 'scanner', label: 'Scanner' },
  { key: 'promoter', label: 'Organizador' },
  { key: 'cloakroom', label: 'Ropero' },
  { key: 'group_admin', label: 'Group Admin' },
  { key: 'admin', label: 'Admin' },
]

const PAGE_SIZE = 50

interface AttendeesTabProps {
  eventId: string
}

export function AttendeesTab({ eventId }: AttendeesTabProps) {
  const { error: showError, success } = useToast()
  const { user } = useAuth()
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  // Delete confirm
  const [confirmAction, setConfirmAction] = useState<{ userId: string; mode: 'remove' | 'delete' } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Add user modal
  const [showAddUser, setShowAddUser] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState<UserRow[]>([])
  const [addSearching, setAddSearching] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)

  // Batch fetch users for .in() queries with >100 IDs
  const batchFetchUsers = async (ids: string[]): Promise<UserRow[]> => {
    const BATCH = 80
    const results: UserRow[] = []
    for (let i = 0; i < ids.length; i += BATCH) {
      const { data } = await supabase.from('users').select('*').in('id', ids.slice(i, i + BATCH))
      if (data) results.push(...data)
    }
    return results
  }

  const batchFetchTickets = async (userIds: string[], evtId: string): Promise<TicketRow[]> => {
    const BATCH = 80
    const results: TicketRow[] = []
    for (let i = 0; i < userIds.length; i += BATCH) {
      const { data } = await supabase.from('tickets').select('*').eq('event_id', evtId).in('user_id', userIds.slice(i, i + BATCH))
      if (data) results.push(...data)
    }
    return results
  }

  const fetchAttendees = useCallback(async () => {
    setLoading(true)
    try {
      // Get all memberships for this event (no limit)
      const { data: memberships, error: memError } = await supabase
        .from('user_events')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('joined_at', { ascending: false })
        .limit(5000)

      if (memError) throw memError
      if (!memberships || memberships.length === 0) {
        setAttendees([])
        setLoading(false)
        return
      }

      const userIds = memberships.map(m => m.user_id)

      // Batch fetch users and tickets in parallel
      const [usersData, ticketsData] = await Promise.all([
        batchFetchUsers(userIds),
        batchFetchTickets(userIds, eventId),
      ])

      const usersMap = new Map(usersData.map(u => [u.id, u]))
      const ticketsMap = new Map(ticketsData.map(t => [t.user_id, t]))

      const result: Attendee[] = memberships
        .filter(m => usersMap.has(m.user_id))
        .map(m => ({
          user: usersMap.get(m.user_id)!,
          membership: m,
          ticket: ticketsMap.get(m.user_id) || null,
        }))

      setAttendees(result)
    } catch (err) {
      console.error('Error fetching attendees:', err)
      showError('Error al cargar asistentes')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { fetchAttendees() }, [fetchAttendees])
  useEffect(() => { setPage(1) }, [search, roleFilter])

  // Filtered attendees
  const filtered = useMemo(() => {
    let list = attendees
    if (roleFilter !== 'all') {
      list = list.filter(a => a.membership.role === roleFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        (a.user.full_name || '').toLowerCase().includes(q) ||
        a.user.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [attendees, search, roleFilter])

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Stats
  const stats = useMemo(() => ({
    total: attendees.length,
    attendees: attendees.filter(a => a.membership.role === 'attendee').length,
    staff: attendees.filter(a => a.membership.role !== 'attendee').length,
    scanned: attendees.filter(a => a.ticket?.status === 'used').length,
  }), [attendees])

  // Start editing
  const startEdit = (a: Attendee) => {
    setEditingId(a.user.id)
    setEditEmail(a.user.email)
    setEditName(a.user.full_name || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditEmail('')
    setEditName('')
  }

  // Save edit
  const handleSaveEdit = async (userId: string) => {
    setSaving(true)
    try {
      const res = await authFetch('/api/admin/update-user', {
        userId,
        email: editEmail,
        fullName: editName,
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al actualizar')
        return
      }
      success('Usuario actualizado')
      cancelEdit()
      await fetchAttendees()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setSaving(false)
    }
  }

  // Change role in event
  const handleChangeEventRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('user_events')
        .update({ role: newRole as UserRow['role'] })
        .eq('user_id', userId)
        .eq('event_id', eventId)

      if (error) throw error
      success('Rol actualizado en este evento')
      await fetchAttendees()
    } catch (err) {
      console.error('Error changing role:', err)
      showError('Error al cambiar rol')
    }
  }

  // Remove from event or delete user
  const handleConfirmAction = async () => {
    if (!confirmAction) return
    setDeleting(true)
    try {
      const res = await authFetch('/api/admin/delete-user', {
        userId: confirmAction.userId,
        eventId,
        mode: confirmAction.mode === 'remove' ? 'remove_from_event' : 'delete_user',
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error')
        return
      }
      success(confirmAction.mode === 'remove' ? 'Usuario eliminado del evento' : 'Usuario eliminado permanentemente')
      setConfirmAction(null)
      await fetchAttendees()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setDeleting(false)
    }
  }

  // Search users to add to this event
  const handleSearchUsersToAdd = async (q: string) => {
    setAddSearch(q)
    if (q.trim().length < 2) {
      setAddResults([])
      return
    }
    setAddSearching(true)
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .or(`full_name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`)
        .limit(20)

      // Exclude users already in this event
      const existingIds = new Set(attendees.map(a => a.user.id))
      setAddResults((data || []).filter(u => !existingIds.has(u.id)))
    } catch {
      setAddResults([])
    } finally {
      setAddSearching(false)
    }
  }

  // Add existing user to this event
  const handleAddUserToEvent = async (userId: string) => {
    setAddingUserId(userId)
    try {
      const res = await authFetch('/api/promoter/assign-user', {
        userId,
        eventId,
        addedBy: user?.id,
      })
      const data = await res.json()
      if (!res.ok && data.error) {
        showError(data.error)
        return
      }
      success('Usuario añadido al evento')
      setAddResults(prev => prev.filter(u => u.id !== userId))
      await fetchAttendees()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setAddingUserId(null)
    }
  }

  // Export CSV
  const handleExport = () => {
    const headers = 'Nombre,Email,Rol,Genero,Ticket,Escaneado\n'
    const rows = filtered.map(a => {
      const name = (a.user.full_name || '').replace(/,/g, ' ')
      const role = ROLE_CONFIG[a.membership.role]?.label || a.membership.role
      const ticket = a.ticket?.status || 'sin ticket'
      const scanned = a.ticket?.scanned_at
        ? new Date(a.ticket.scanned_at).toLocaleString('es-ES')
        : ''
      return `${name},${a.user.email},${role},${a.user.gender || ''},${ticket},${scanned}`
    })
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `asistentes-${eventId.slice(0, 8)}.csv`
    el.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-primary' },
          { label: 'Asistentes', value: stats.attendees, color: 'text-emerald-400' },
          { label: 'Staff', value: stats.staff, color: 'text-blue-400' },
          { label: 'Escaneados', value: stats.scanned, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="text-center py-2 rounded-xl bg-white/[0.03] border border-black-border">
            <div className={cn('text-lg font-bold', s.color)}>{s.value}</div>
            <div className="text-[10px] text-white-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white-muted" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
        </div>
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40"
        >
          <option value="all">Todos</option>
          {ROLE_OPTIONS.map(r => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setShowAddUser(true); setAddSearch(''); setAddResults([]) }}
          className="btn-primary text-xs py-1.5 px-3"
        >
          <UserPlus className="w-3 h-3" />
          Añadir usuario
        </button>
        {attendees.length > 0 && (
          <button onClick={handleExport} className="btn-ghost text-xs text-primary">
            <Download className="w-3 h-3" /> CSV
          </button>
        )}
        {filtered.length > 0 && (
          <span className="text-[11px] text-white-muted ml-auto">
            {filtered.length === attendees.length
              ? `${filtered.length} usuarios`
              : `${filtered.length} de ${attendees.length}`
            }
          </span>
        )}
      </div>

      {/* Attendees List */}
      <div className="space-y-1">
        {filtered.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="w-8 h-8 mx-auto mb-2 text-black-border" />
            <p className="text-white-muted text-sm">
              {attendees.length === 0 ? 'No hay asistentes en este evento' : 'Sin resultados'}
            </p>
          </div>
        ) : (
          paginated.map(a => {
            const roleConf = ROLE_CONFIG[a.membership.role] || ROLE_CONFIG.attendee
            const RoleIcon = roleConf.icon
            const isEditing = editingId === a.user.id
            const isScanned = a.ticket?.status === 'used'

            return (
              <div key={a.user.id} className="rounded-xl border border-black-border overflow-hidden">
                {/* Main row */}
                <div className="flex items-center gap-3 p-3">
                  {/* Avatar */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold',
                    roleConf.bg, roleConf.color
                  )}>
                    {(a.user.full_name?.[0] || a.user.email[0]).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {a.user.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-[11px] text-white-muted truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 shrink-0" />
                      {a.user.email}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isScanned && (
                      <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                        <Ticket className="w-2.5 h-2.5" />
                        IN
                      </span>
                    )}
                    <span className={cn(
                      'flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full',
                      roleConf.bg, roleConf.color
                    )}>
                      <RoleIcon className="w-2.5 h-2.5" />
                      {roleConf.label}
                    </span>
                  </div>

                  {/* Actions dropdown */}
                  <div className="relative group shrink-0">
                    <button className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 rounded-xl border border-black-border bg-black-card shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                      <button
                        onClick={() => startEdit(a)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar email / nombre
                      </button>

                      {/* Role submenu */}
                      <div className="px-3 py-2 border-t border-black-border">
                        <span className="text-[10px] text-white-muted block mb-1.5">Rol en este evento</span>
                        <div className="flex flex-wrap gap-1">
                          {ROLE_OPTIONS.map(r => (
                            <button
                              key={r.key}
                              onClick={() => handleChangeEventRole(a.user.id, r.key)}
                              className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-medium transition-all',
                                a.membership.role === r.key
                                  ? 'bg-primary/20 text-primary'
                                  : 'text-white-muted hover:text-white hover:bg-white/5'
                              )}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-black-border">
                        <button
                          onClick={() => setConfirmAction({ userId: a.user.id, mode: 'remove' })}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/5 transition-colors"
                        >
                          <UserMinus className="w-3 h-3" />
                          Quitar del evento
                        </button>
                        <button
                          onClick={() => setConfirmAction({ userId: a.user.id, mode: 'delete' })}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/5 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar usuario
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Edit inline form */}
                {isEditing && (
                  <div className="border-t border-black-border p-3 bg-white/[0.02] space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-white-muted mb-0.5 block">Nombre</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Nombre completo"
                          className="w-full px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
                          autoFocus
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-white-muted mb-0.5 block">Email</label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          placeholder="email@ejemplo.com"
                          className="w-full px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelEdit} className="btn-ghost text-xs py-1 px-3">
                        <X className="w-3 h-3" /> Cancelar
                      </button>
                      <button
                        onClick={() => handleSaveEdit(a.user.id)}
                        disabled={saving}
                        className="btn-primary text-xs py-1 px-3 disabled:opacity-40"
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Confirm action modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmAction(null)}>
          <div className="card w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center',
                confirmAction.mode === 'delete' ? 'bg-red-500/10' : 'bg-amber-500/10'
              )}>
                <AlertTriangle className={cn('w-5 h-5', confirmAction.mode === 'delete' ? 'text-red-400' : 'text-amber-400')} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {confirmAction.mode === 'delete' ? 'Eliminar usuario' : 'Quitar del evento'}
                </h3>
                <p className="text-xs text-white-muted">
                  {(() => {
                    const target = attendees.find(a => a.user.id === confirmAction.userId)
                    return target?.user.full_name || target?.user.email || 'Usuario'
                  })()}
                </p>
              </div>
            </div>

            <p className="text-xs text-white-muted">
              {confirmAction.mode === 'delete'
                ? 'Se eliminara el usuario permanentemente: su cuenta, tickets, pedidos de bebida, mensajes y votos. Esta accion no se puede deshacer.'
                : 'Se quitara al usuario de este evento. Su ticket sera cancelado y su pedido de bebida eliminado. El usuario seguira existiendo en el sistema y podra ser añadido a otros eventos.'
              }
            </p>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmAction(null)} className="btn-ghost text-xs">
                Cancelar
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={deleting}
                className={cn(
                  'text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-40',
                  confirmAction.mode === 'delete'
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                )}
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                {deleting ? 'Procesando...' : confirmAction.mode === 'delete' ? 'Eliminar permanentemente' : 'Quitar del evento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add user to event modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddUser(false)}>
          <div className="card w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-black-border">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                Añadir usuario al evento
              </h3>
              <button onClick={() => setShowAddUser(false)} className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-black-border">
              <p className="text-xs text-white-muted mb-2">
                Busca un usuario existente por nombre o email para añadirlo a este evento.
                Util si un usuario quiere ir a varios eventos.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white-muted" />
                <input
                  type="text"
                  value={addSearch}
                  onChange={e => handleSearchUsersToAdd(e.target.value)}
                  placeholder="Buscar por nombre o email..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                  autoFocus
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-[300px] overflow-y-auto">
              {addSearching ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                </div>
              ) : addSearch.length < 2 ? (
                <div className="p-6 text-center text-xs text-white-muted">
                  Escribe al menos 2 caracteres para buscar
                </div>
              ) : addResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-white-muted">
                  No se encontraron usuarios que no esten ya en este evento
                </div>
              ) : (
                addResults.map(u => {
                  const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.attendee
                  const isAdding = addingUserId === u.id
                  return (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 border-b border-black-border last:border-0 hover:bg-white/[0.02]">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold', roleConf.bg, roleConf.color)}>
                        {(u.full_name?.[0] || u.email[0]).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{u.full_name || 'Sin nombre'}</p>
                        <p className="text-[11px] text-white-muted truncate">{u.email}</p>
                      </div>
                      <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full', roleConf.bg, roleConf.color)}>
                        {roleConf.label}
                      </span>
                      <button
                        onClick={() => handleAddUserToEvent(u.id)}
                        disabled={isAdding}
                        className="btn-primary text-xs py-1 px-2.5 disabled:opacity-40"
                      >
                        {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                        Añadir
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
