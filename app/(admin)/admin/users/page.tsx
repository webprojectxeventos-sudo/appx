'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { Pagination } from '@/components/admin/pagination'
import { cn } from '@/lib/utils'
import {
  UsersRound,
  Download,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ScanLine,
  User,
  Megaphone,
  ChevronDown,
  Ticket,
  Calendar,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  X,
  Pencil,
  Trash2,
  Check,
  AlertTriangle,
  Filter,
  Hash,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type UserRow = Database['public']['Tables']['users']['Row']
type UserEvent = Database['public']['Tables']['user_events']['Row']
type Event = Database['public']['Tables']['events']['Row']

const PAGE_SIZE = 30

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Shield }> = {
  super_admin: { label: 'Super Admin', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: ShieldAlert },
  admin: { label: 'Admin', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: ShieldCheck },
  group_admin: { label: 'Group Admin', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: Shield },
  scanner: { label: 'Scanner', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: ScanLine },
  promoter: { label: 'Promotor', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Megaphone },
  attendee: { label: 'Asistente', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: User },
}

const ROLE_OPTIONS = [
  { key: 'all', label: 'Todos los roles' },
  { key: 'super_admin', label: 'Super Admin' },
  { key: 'admin', label: 'Admin' },
  { key: 'group_admin', label: 'Group Admin' },
  { key: 'scanner', label: 'Scanner' },
  { key: 'promoter', label: 'Promotor' },
  { key: 'attendee', label: 'Asistente' },
]

interface UserWithEvents extends UserRow {
  userEvents?: (UserEvent & { eventTitle: string })[]
}

export default function UsersPage() {
  const { user, organization, isSuperAdmin, initialized } = useAuth()
  const { error: showError, success } = useToast()

  const [users, setUsers] = useState<UserWithEvents[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole] = useState('')

  // All org events for filter
  const [orgEvents, setOrgEvents] = useState<Event[]>([])

  // Role counts
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})

  // Inline edit
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Password change
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserWithEvents | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Create user modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState<string>('scanner')
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirmPassword, setCreateConfirmPassword] = useState('')
  const [createGender, setCreateGender] = useState<string>('')
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  // Fetch all org events for event filter
  useEffect(() => {
    if (!organization?.id) return
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('organization_id', organization.id)
        .order('date', { ascending: false })
      setOrgEvents(data || [])
    }
    fetchEvents()
  }, [organization?.id])

  // Fetch users with event filter support
  const fetchUsers = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)

    try {
      // If filtering by event, first get user IDs from user_events
      let eventUserIds: string[] | null = null
      if (eventFilter !== 'all') {
        const { data: ueData } = await supabase
          .from('user_events')
          .select('user_id')
          .eq('event_id', eventFilter)
        eventUserIds = (ueData || []).map(ue => ue.user_id)
        if (eventUserIds.length === 0) {
          setUsers([])
          setTotalCount(0)
          setLoading(false)
          return
        }
      }

      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })

      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`)
      }

      if (roleFilter !== 'all') {
        query = query.eq('role', roleFilter as UserRow['role'])
      }

      if (eventUserIds) {
        // Batch the .in() if too many IDs
        const BATCH = 80
        if (eventUserIds.length <= BATCH) {
          query = query.in('id', eventUserIds)
        } else {
          // For large sets, just use first batch — pagination handles the rest
          query = query.in('id', eventUserIds.slice(0, BATCH))
        }
      }

      const from = (page - 1) * PAGE_SIZE
      query = query.range(from, from + PAGE_SIZE - 1)

      const { data, count, error } = await query
      if (error) throw error

      setUsers(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      console.error('Error fetching users:', err)
      showError('Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }, [organization?.id, search, roleFilter, eventFilter, page])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Fetch role counts (once, independent of filters)
  useEffect(() => {
    if (!organization?.id) return
    const fetchCounts = async () => {
      const roles: UserRow['role'][] = ['super_admin', 'admin', 'group_admin', 'scanner', 'promoter', 'attendee']
      const counts: Record<string, number> = {}
      const promises = roles.map(async (role) => {
        const { count } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organization.id)
          .eq('role', role)
        counts[role] = count || 0
      })
      await Promise.all(promises)
      setRoleCounts(counts)
    }
    fetchCounts()
  }, [organization?.id])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, roleFilter, eventFilter])

  // Load user details (events)
  const loadUserDetails = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)

    const { data: ueData } = await supabase
      .from('user_events')
      .select('*')
      .eq('user_id', userId)

    if (ueData && ueData.length > 0) {
      const eventIds = ueData.map(ue => ue.event_id)
      const { data: evData } = await supabase
        .from('events')
        .select('id, title, group_name')
        .in('id', eventIds)

      const evMap: Record<string, string> = {}
      evData?.forEach(e => { evMap[e.id] = e.group_name || e.title })

      const enriched = ueData.map(ue => ({
        ...ue,
        eventTitle: evMap[ue.event_id] || 'Evento',
      }))

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, userEvents: enriched } : u
      ))
    } else {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, userEvents: [] } : u
      ))
    }
  }

  // Inline edit
  const startEditing = (u: UserWithEvents) => {
    setEditingUser(u.id)
    setEditName(u.full_name || '')
    setEditEmail(u.email)
  }

  const cancelEditing = () => {
    setEditingUser(null)
    setEditName('')
    setEditEmail('')
  }

  const saveEdit = async (userId: string) => {
    setSavingEdit(true)
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
      cancelEditing()
      await fetchUsers()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setSavingEdit(false)
    }
  }

  // Role change
  const handleChangeRole = async (userId: string, newRole: UserRow['role']) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId)
      if (error) throw error
      success('Rol actualizado')
      await fetchUsers()
    } catch (err) {
      console.error('Error changing role:', err)
      showError('Error al cambiar rol')
    }
  }

  // Bulk role change
  const handleBulkChangeRole = async () => {
    if (!bulkRole || selectedUsers.size === 0) return
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: bulkRole as UserRow['role'] })
        .in('id', Array.from(selectedUsers))
      if (error) throw error
      success(`Rol actualizado para ${selectedUsers.size} usuarios`)
      setSelectedUsers(new Set())
      setBulkRole('')
      await fetchUsers()
    } catch (err) {
      console.error('Error bulk change:', err)
      showError('Error al cambiar roles')
    }
  }

  // Delete user
  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await authFetch('/api/admin/delete-user', {
        userId: deleteTarget.id,
        mode: 'delete_user',
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al eliminar usuario')
        return
      }
      success(`Usuario ${deleteTarget.full_name || deleteTarget.email} eliminado`)
      setDeleteTarget(null)
      await fetchUsers()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setDeleting(false)
    }
  }

  // Password change
  const handleChangePassword = async (userId: string) => {
    if (!newPassword || newPassword !== confirmPassword) {
      showError('Las contraseñas no coinciden')
      return
    }
    if (newPassword.length < 6) {
      showError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    setChangingPassword(true)
    try {
      const res = await authFetch('/api/admin/change-password', { userId, newPassword })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al cambiar contraseña')
        return
      }
      success('Contraseña actualizada')
      setPasswordTarget(null)
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setChangingPassword(false)
    }
  }

  // Selection
  const toggleSelectUser = (userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(users.map(u => u.id)))
    }
  }

  // Create user
  const resetCreateModal = () => {
    setShowCreateModal(false)
    setCreateEmail('')
    setCreateName('')
    setCreateRole('scanner')
    setCreatePassword('')
    setCreateConfirmPassword('')
    setCreateGender('')
    setShowCreatePassword(false)
  }

  const handleCreateUser = async () => {
    if (!createEmail || !createPassword || !createRole) {
      showError('Email, contrasena y rol son obligatorios')
      return
    }
    if (createPassword.length < 6) {
      showError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    if (createPassword !== createConfirmPassword) {
      showError('Las contrasenas no coinciden')
      return
    }
    setCreatingUser(true)
    try {
      const res = await authFetch('/api/admin/create-user', {
        email: createEmail,
        password: createPassword,
        fullName: createName,
        role: createRole,
        gender: createGender || null,
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al crear usuario')
        return
      }
      success(`Usuario ${createEmail} creado`)
      resetCreateModal()
      await fetchUsers()
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setCreatingUser(false)
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    const headers = 'Nombre,Email,Rol,Genero,Creado\n'
    const rows = users.map(u => {
      const name = (u.full_name || '').replace(/,/g, ' ')
      const role = ROLE_CONFIG[u.role]?.label || u.role
      const date = new Date(u.created_at).toLocaleDateString('es-ES')
      return `${name},${u.email},${role},${u.gender || ''},${date}`
    })
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios-${organization?.slug || 'org'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Total users in org
  const totalOrgUsers = useMemo(
    () => Object.values(roleCounts).reduce((a, b) => a + b, 0),
    [roleCounts]
  )

  // Event names map
  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    orgEvents.forEach(e => { map[e.id] = e.group_name || e.title })
    return map
  }, [orgEvents])

  if (!initialized) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-12 bg-white/5 rounded-xl animate-pulse" />
      </div>
    )
  }
  if (!isSuperAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary flex items-center gap-2.5">
            <UsersRound className="w-7 h-7 text-primary" />
            Usuarios
          </h1>
          <p className="text-sm text-white-muted mt-1">
            {totalOrgUsers} usuarios en la organizacion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Crear Usuario</span>
            <span className="md:hidden">Crear</span>
          </button>
          <button onClick={handleExportCSV} className="btn-ghost text-sm text-primary hover:bg-primary/5">
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Object.entries(ROLE_CONFIG).map(([key, conf]) => {
          const Icon = conf.icon
          const count = roleCounts[key] || 0
          return (
            <button
              key={key}
              onClick={() => setRoleFilter(roleFilter === key ? 'all' : key)}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-xl border transition-all',
                roleFilter === key
                  ? `${conf.bg} ${conf.border} border`
                  : 'border-black-border hover:border-white/10 bg-white/[0.02]'
              )}
            >
              <Icon className={cn('w-4 h-4', roleFilter === key ? conf.color : 'text-white-muted')} />
              <span className={cn('text-lg font-bold', roleFilter === key ? conf.color : 'text-white')}>
                {count}
              </span>
              <span className="text-[10px] text-white-muted leading-tight">{conf.label}</span>
            </button>
          )
        })}
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre o email..."
          />
        </div>
        <div className="relative">
          <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-black-border bg-white/[0.02] text-sm">
            <Filter className="w-4 h-4 text-white-muted shrink-0" />
            <select
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer appearance-none pr-6 min-w-[140px] text-sm"
            >
              <option value="all" className="bg-[#1a1a1a]">Todos los eventos</option>
              {orgEvents.map(ev => (
                <option key={ev.id} value={ev.id} className="bg-[#1a1a1a]">
                  {ev.group_name || ev.title}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-white-muted absolute right-3 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Active filters indicator */}
      {(roleFilter !== 'all' || eventFilter !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          {roleFilter !== 'all' && (
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
              ROLE_CONFIG[roleFilter]?.bg, ROLE_CONFIG[roleFilter]?.color
            )}>
              {ROLE_CONFIG[roleFilter]?.label}
              <button onClick={() => setRoleFilter('all')} className="hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          )}
          {eventFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary">
              <Calendar className="w-3 h-3" />
              {eventNameMap[eventFilter] || 'Evento'}
              <button onClick={() => setEventFilter('all')} className="hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          )}
          <button
            onClick={() => { setRoleFilter('all'); setEventFilter('all') }}
            className="text-[11px] text-white-muted hover:text-white transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedUsers.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
          <span className="text-sm text-primary font-medium">{selectedUsers.size} seleccionados</span>
          <select
            value={bulkRole}
            onChange={e => setBulkRole(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none"
          >
            <option value="">Cambiar rol a...</option>
            {ROLE_OPTIONS.filter(r => r.key !== 'all').map(r => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          {bulkRole && (
            <button onClick={handleBulkChangeRole} className="btn-primary text-xs py-1.5 px-3">
              Aplicar
            </button>
          )}
          <button onClick={() => setSelectedUsers(new Set())} className="btn-ghost text-xs py-1.5 px-3">
            Cancelar
          </button>
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-white-muted">
          Mostrando {users.length} de {totalCount} usuarios
        </p>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedUsers.size === users.length && users.length > 0}
            onChange={toggleSelectAll}
            className="rounded border-black-border"
          />
          <span className="text-xs text-white-muted">Seleccionar todos</span>
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-[72px] bg-white/[0.03] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="py-16 text-center">
          <UsersRound className="w-10 h-10 text-white-muted mx-auto mb-3 opacity-40" />
          <p className="text-white-muted text-sm">No se encontraron usuarios</p>
          {(search || roleFilter !== 'all' || eventFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setRoleFilter('all'); setEventFilter('all') }}
              className="text-primary text-xs mt-2 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {users.map(u => {
            const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.attendee
            const RoleIcon = roleConf.icon
            const isExpanded = expandedUser === u.id
            const isEditing = editingUser === u.id
            const isSelf = u.id === user?.id

            return (
              <div
                key={u.id}
                className={cn(
                  'rounded-xl border transition-all overflow-hidden',
                  isExpanded ? 'border-white/10 bg-white/[0.03]' : 'border-black-border bg-white/[0.015] hover:bg-white/[0.03]'
                )}
              >
                {/* Main Row */}
                <div className="flex items-center gap-3 p-3 md:p-4">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => toggleSelectUser(u.id)}
                    className="rounded border-black-border shrink-0"
                  />

                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
                      roleConf.bg, roleConf.color
                    )}
                  >
                    {(u.full_name?.[0] || u.email[0]).toUpperCase()}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Nombre"
                          className="px-2 py-1 rounded-lg border border-primary/30 bg-transparent text-white text-sm focus:outline-none focus:border-primary/50 w-32 md:w-40"
                          autoFocus
                        />
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          placeholder="Email"
                          className="px-2 py-1 rounded-lg border border-primary/30 bg-transparent text-white text-sm focus:outline-none focus:border-primary/50 w-40 md:w-52"
                        />
                        <button
                          onClick={() => saveEdit(u.id)}
                          disabled={savingEdit}
                          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="p-1.5 rounded-lg text-white-muted hover:bg-white/5 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-white truncate">
                          {u.full_name || 'Sin nombre'}
                          {isSelf && <span className="text-[10px] text-primary ml-1.5">(tu)</span>}
                        </p>
                        <p className="text-xs text-white-muted truncate">{u.email}</p>
                      </>
                    )}
                  </div>

                  {/* Role Badge */}
                  <div className="hidden md:flex items-center">
                    <select
                      value={u.role}
                      onChange={e => handleChangeRole(u.id, e.target.value as UserRow['role'])}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer focus:outline-none',
                        roleConf.bg, roleConf.border, roleConf.color
                      )}
                    >
                      {ROLE_OPTIONS.filter(r => r.key !== 'all').map(r => (
                        <option key={r.key} value={r.key} className="bg-[#1a1a1a] text-white">{r.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Gender */}
                  <span className="hidden lg:block text-xs text-white-muted capitalize w-20 text-center">
                    {u.gender || '-'}
                  </span>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-0.5">
                    {!isEditing && (
                      <button
                        onClick={() => startEditing(u)}
                        className="p-2 rounded-lg text-white-muted hover:text-primary hover:bg-primary/5 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isSelf && (
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="p-2 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => loadUserDetails(u.id)}
                      className={cn(
                        'p-2 rounded-lg transition-colors',
                        isExpanded ? 'text-primary bg-primary/5' : 'text-white-muted hover:text-white hover:bg-white/5'
                      )}
                      title="Ver detalles"
                    >
                      <ChevronDown className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
                    </button>
                  </div>
                </div>

                {/* Mobile Role */}
                <div className="md:hidden px-4 pb-3 flex items-center gap-2">
                  <RoleIcon className={cn('w-3.5 h-3.5', roleConf.color)} />
                  <select
                    value={u.role}
                    onChange={e => handleChangeRole(u.id, e.target.value as UserRow['role'])}
                    className={cn('text-xs font-medium bg-transparent focus:outline-none cursor-pointer', roleConf.color)}
                  >
                    {ROLE_OPTIONS.filter(r => r.key !== 'all').map(r => (
                      <option key={r.key} value={r.key} className="bg-[#1a1a1a] text-white">{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] p-4 space-y-4">
                    {/* Info Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <span className="text-[11px] text-white-muted uppercase tracking-wider">Email</span>
                        <p className="text-xs text-white flex items-center gap-1.5 break-all">
                          <Mail className="w-3 h-3 shrink-0 text-white-muted" />
                          {u.email}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-white-muted uppercase tracking-wider">Registrado</span>
                        <p className="text-xs text-white flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-white-muted" />
                          {new Date(u.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-white-muted uppercase tracking-wider">Genero</span>
                        <p className="text-xs text-white capitalize">{u.gender || 'No especificado'}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] text-white-muted uppercase tracking-wider">ID</span>
                        <p className="text-xs text-white-muted font-mono flex items-center gap-1.5">
                          <Hash className="w-3 h-3" />
                          {u.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>

                    {/* Events */}
                    {u.userEvents !== undefined && (
                      <div className="space-y-2">
                        <span className="text-[11px] text-white-muted uppercase tracking-wider">
                          Eventos asignados ({u.userEvents.length})
                        </span>
                        {u.userEvents.length > 0 ? (
                          <div className="grid gap-1.5">
                            {u.userEvents.map(ue => (
                              <div key={ue.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                                <div className="flex items-center gap-2">
                                  <Ticket className="w-3.5 h-3.5 text-white-muted" />
                                  <span className="text-xs text-white font-medium">{ue.eventTitle}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    'px-2 py-0.5 rounded-full text-[10px] font-medium',
                                    ROLE_CONFIG[ue.role]?.bg || 'bg-gray-500/10',
                                    ROLE_CONFIG[ue.role]?.color || 'text-gray-400'
                                  )}>
                                    {ROLE_CONFIG[ue.role]?.label || ue.role}
                                  </span>
                                  {ue.is_muted && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-medium">Muted</span>
                                  )}
                                  {!ue.is_active && (
                                    <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 text-[10px] font-medium">Inactivo</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-white-muted italic">Sin eventos asignados</p>
                        )}
                      </div>
                    )}

                    {/* Actions Row */}
                    <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                      {/* Password Change */}
                      {passwordTarget === u.id ? (
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Nueva contraseña (min. 6)"
                                className="w-full px-3 py-2 pr-9 rounded-lg border border-black-border bg-transparent text-white placeholder:text-gray-600 text-xs focus:outline-none focus:border-primary/40"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white-muted hover:text-white"
                              >
                                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                              placeholder="Confirmar"
                              className="w-32 px-3 py-2 rounded-lg border border-black-border bg-transparent text-white placeholder:text-gray-600 text-xs focus:outline-none focus:border-primary/40"
                              autoComplete="new-password"
                            />
                          </div>
                          {newPassword && confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-[11px] text-red-400">No coinciden</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleChangePassword(u.id)}
                              disabled={changingPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                              className="btn-primary text-xs py-1.5 px-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                              {changingPassword && <Loader2 className="w-3 h-3 animate-spin" />}
                              Guardar
                            </button>
                            <button
                              onClick={() => { setPasswordTarget(null); setNewPassword(''); setConfirmPassword(''); setShowPassword(false) }}
                              className="btn-ghost text-xs py-1.5 px-3"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => { setPasswordTarget(u.id); setNewPassword(''); setConfirmPassword('') }}
                            className="flex items-center gap-1.5 text-xs text-white-muted hover:text-primary transition-colors py-1.5 px-2.5 rounded-lg hover:bg-primary/5"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Cambiar contraseña
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="flex items-center gap-1.5 text-xs text-white-muted hover:text-red-400 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-red-500/5 ml-auto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar usuario
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-background border border-red-500/20 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-base font-bold text-white">Eliminar usuario</h3>
                <p className="text-sm text-white-muted">
                  Se eliminara permanentemente a <span className="text-white font-medium">{deleteTarget.full_name || deleteTarget.email}</span> y todos sus datos asociados (tickets, pedidos, mensajes, votos).
                </p>
                <p className="text-xs text-red-400/80">Esta accion no se puede deshacer.</p>
              </div>
              <div className="flex gap-3 p-4 border-t border-white/[0.06]">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="btn-ghost flex-1 text-sm py-2.5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={resetCreateModal} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-background border border-black-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-black-border">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" />
                  Crear Usuario
                </h2>
                <button onClick={resetCreateModal} className="p-2 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={e => setCreateEmail(e.target.value)}
                    placeholder="usuario@ejemplo.com"
                    className="w-full px-3 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                    autoFocus
                  />
                  <p className="text-[10px] text-white-muted mt-1">Puedes usar cualquier email, no necesita ser real</p>
                </div>

                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Nombre completo</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={e => setCreateName(e.target.value)}
                    placeholder="Nombre del usuario"
                    className="w-full px-3 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Rol *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.filter(r => r.key !== 'all').map(r => {
                      const conf = ROLE_CONFIG[r.key]
                      const Icon = conf?.icon || User
                      const isSelected = createRole === r.key
                      return (
                        <button
                          key={r.key}
                          onClick={() => setCreateRole(r.key)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all text-left',
                            isSelected
                              ? `${conf?.border || 'border-primary/50'} ${conf?.bg || 'bg-primary/10'} text-white`
                              : 'border-black-border text-white-muted hover:border-white/20 hover:text-white'
                          )}
                        >
                          <Icon className={cn('w-4 h-4 shrink-0', isSelected ? conf?.color || 'text-primary' : '')} />
                          {r.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Genero</label>
                  <div className="flex gap-2">
                    {[
                      { value: '', label: 'Sin especificar' },
                      { value: 'masculino', label: 'Masculino' },
                      { value: 'femenino', label: 'Femenino' },
                      { value: 'otro', label: 'Otro' },
                    ].map(g => (
                      <button
                        key={g.value}
                        onClick={() => setCreateGender(g.value)}
                        className={cn(
                          'flex-1 py-2 rounded-xl border text-xs font-medium transition-all',
                          createGender === g.value
                            ? 'border-primary/50 bg-primary/10 text-white'
                            : 'border-black-border text-white-muted hover:border-white/20 hover:text-white'
                        )}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Contrasena *</label>
                  <div className="relative">
                    <input
                      type={showCreatePassword ? 'text' : 'password'}
                      value={createPassword}
                      onChange={e => setCreatePassword(e.target.value)}
                      placeholder="Minimo 6 caracteres"
                      className="w-full px-3 py-2.5 pr-10 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword(!showCreatePassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white-muted hover:text-white"
                    >
                      {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white-muted mb-1.5">Confirmar contrasena *</label>
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    value={createConfirmPassword}
                    onChange={e => setCreateConfirmPassword(e.target.value)}
                    placeholder="Repite la contrasena"
                    className="w-full px-3 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                    autoComplete="new-password"
                  />
                  {createPassword && createConfirmPassword && createPassword !== createConfirmPassword && (
                    <p className="text-xs text-red-400 mt-1">Las contrasenas no coinciden</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 border-t border-black-border">
                <button
                  onClick={handleCreateUser}
                  disabled={creatingUser || !createEmail || !createPassword || !createRole || createPassword !== createConfirmPassword || createPassword.length < 6}
                  className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {creatingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creatingUser ? 'Creando...' : 'Crear Usuario'}
                </button>
                <button onClick={resetCreateModal} className="btn-ghost text-sm py-2.5 px-4">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
