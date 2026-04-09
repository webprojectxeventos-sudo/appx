'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { Pagination } from '@/components/admin/pagination'
import { FilterBar } from '@/components/admin/filter-bar'
import { cn } from '@/lib/utils'
import {
  UsersRound,
  Download,
  Shield,
  ShieldCheck,
  ShieldAlert,
  UserCog,
  ScanLine,
  User,
  Megaphone,
  ChevronDown,
  ChevronUp,
  Ticket,
  Calendar,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  X,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type UserRow = Database['public']['Tables']['users']['Row']
type UserEvent = Database['public']['Tables']['user_events']['Row']

const PAGE_SIZE = 25

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Shield }> = {
  super_admin: { label: 'Super Admin', color: 'text-red-400', bg: 'bg-red-500/10', icon: ShieldAlert },
  admin: { label: 'Admin', color: 'text-orange-400', bg: 'bg-orange-500/10', icon: ShieldCheck },
  group_admin: { label: 'Group Admin', color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: Shield },
  scanner: { label: 'Scanner', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: ScanLine },
  promoter: { label: 'Promotor', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Megaphone },
  attendee: { label: 'Asistente', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: User },
}

const ROLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: 'Todos' },
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
  const { allEvents } = useAdminSelection()
  const { error: showError, success } = useToast()

  const [users, setUsers] = useState<UserWithEvents[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole] = useState('')
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

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

  const fetchUsers = useCallback(async () => {
    if (!organization?.id) return
    setLoading(true)

    try {
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
  }, [organization?.id, search, roleFilter, page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, roleFilter])

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

  const STAFF_ROLES = ['admin', 'group_admin', 'scanner', 'promoter', 'super_admin']

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        showError('Sesion expirada')
        return
      }
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al cambiar contraseña')
        return
      }
      success('Contraseña actualizada correctamente')
      setPasswordTarget(null)
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch {
      showError('Error de conexion')
    } finally {
      setChangingPassword(false)
    }
  }

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        showError('Sesion expirada')
        return
      }
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: createEmail,
          password: createPassword,
          fullName: createName,
          role: createRole,
          gender: createGender || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al crear usuario')
        return
      }
      success(`Usuario ${createEmail} creado correctamente`)
      resetCreateModal()
      await fetchUsers()
    } catch {
      showError('Error de conexion')
    } finally {
      setCreatingUser(false)
    }
  }

  const loadUserDetails = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)

    // Load user_events for this user
    const eventIds = allEvents.map(e => e.id)
    if (eventIds.length === 0) return

    const { data: ueData } = await supabase
      .from('user_events')
      .select('*')
      .eq('user_id', userId)
      .in('event_id', eventIds)

    if (ueData) {
      const evMap: Record<string, string> = {}
      allEvents.forEach(e => { evMap[e.id] = e.group_name || e.title })

      const enriched = ueData.map(ue => ({
        ...ue,
        eventTitle: evMap[ue.event_id] || 'Evento',
      }))

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, userEvents: enriched } : u
      ))
    }
  }

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

  // Build filter options with counts
  const roleFilters = ROLE_OPTIONS.map(r => ({
    key: r.key,
    label: r.label,
    count: r.key === 'all' ? totalCount : undefined,
  }))

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isSuperAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <UsersRound className="w-6 h-6 text-primary" />
            Usuarios
          </h1>
          <p className="text-sm text-white-muted mt-0.5">
            {totalCount} usuarios en la organizacion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateModal(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">Crear Usuario</span>
            <span className="md:hidden">Crear</span>
          </button>
          <button onClick={handleExportCSV} className="btn-ghost text-sm text-primary">
            <Download className="w-4 h-4" /> <span className="hidden md:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre o email..."
      />

      <FilterBar
        filters={roleFilters}
        activeFilter={roleFilter}
        onFilterChange={setRoleFilter}
      />

      {/* Bulk actions */}
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

      {/* Users List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="card h-16 animate-pulse" />)}
        </div>
      ) : users.length === 0 ? (
        <div className="card p-8 text-center">
          <UsersRound className="w-8 h-8 text-white-muted mx-auto mb-2" />
          <p className="text-white-muted text-sm">No se encontraron usuarios</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Select all header */}
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-white-muted">
            <input
              type="checkbox"
              checked={selectedUsers.size === users.length && users.length > 0}
              onChange={toggleSelectAll}
              className="rounded border-black-border"
            />
            <span className="flex-1">Usuario</span>
            <span className="w-32 text-center hidden md:block">Rol</span>
            <span className="w-24 text-center hidden md:block">Genero</span>
            <span className="w-8" />
          </div>

          {users.map(u => {
            const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.attendee
            const RoleIcon = roleConf.icon
            const isExpanded = expandedUser === u.id

            return (
              <div key={u.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(u.id)}
                    onChange={() => toggleSelectUser(u.id)}
                    className="rounded border-black-border flex-shrink-0"
                  />

                  {/* Avatar */}
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold', roleConf.bg, roleConf.color)}>
                    {(u.full_name?.[0] || u.email[0]).toUpperCase()}
                  </div>

                  {/* Name + Email */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {u.full_name || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-white-muted truncate">{u.email}</p>
                  </div>

                  {/* Role selector */}
                  <div className="hidden md:block w-32">
                    <select
                      value={u.role}
                      onChange={e => handleChangeRole(u.id, e.target.value as UserRow['role'])}
                      className={cn('px-2 py-1 rounded-lg text-xs font-medium border-0 bg-transparent focus:outline-none cursor-pointer', roleConf.color)}
                    >
                      {ROLE_OPTIONS.filter(r => r.key !== 'all').map(r => (
                        <option key={r.key} value={r.key} className="bg-[#1a1a1a] text-white">{r.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Gender */}
                  <span className="hidden md:block w-24 text-center text-xs text-white-muted capitalize">
                    {u.gender || '-'}
                  </span>

                  {/* Expand */}
                  <button
                    onClick={() => loadUserDetails(u.id)}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-white-muted" /> : <ChevronDown className="w-4 h-4 text-white-muted" />}
                  </button>
                </div>

                {/* Mobile role selector */}
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

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-black-border p-4 bg-white/[0.02] space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-white-muted block mb-0.5">Email</span>
                        <span className="text-white flex items-center gap-1"><Mail className="w-3 h-3" /> {u.email}</span>
                      </div>
                      <div>
                        <span className="text-white-muted block mb-0.5">Creado</span>
                        <span className="text-white flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(u.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div>
                        <span className="text-white-muted block mb-0.5">Genero</span>
                        <span className="text-white capitalize">{u.gender || 'No especificado'}</span>
                      </div>
                      <div>
                        <span className="text-white-muted block mb-0.5">Eventos</span>
                        <span className="text-white">{u.userEvents?.length ?? '...'}</span>
                      </div>
                    </div>

                    {/* User events */}
                    {u.userEvents && u.userEvents.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-xs text-white-muted font-medium">Eventos asignados:</span>
                        {u.userEvents.map(ue => (
                          <div key={ue.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] text-xs">
                            <span className="text-white">{ue.eventTitle}</span>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'px-2 py-0.5 rounded-full font-medium',
                                ROLE_CONFIG[ue.role]?.bg || 'bg-gray-500/10',
                                ROLE_CONFIG[ue.role]?.color || 'text-gray-400'
                              )}>
                                {ROLE_CONFIG[ue.role]?.label || ue.role}
                              </span>
                              {ue.is_muted && (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Silenciado</span>
                              )}
                              {!ue.is_active && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-400 font-medium">Inactivo</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Password change — only for staff roles */}
                    {STAFF_ROLES.includes(u.role) && (
                      <div className="pt-2 border-t border-black-border">
                        {passwordTarget === u.id ? (
                          <div className="space-y-2.5">
                            <span className="text-xs text-white-muted font-medium flex items-center gap-1.5">
                              <KeyRound className="w-3.5 h-3.5" />
                              Cambiar contraseña de {u.full_name || u.email}
                            </span>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Nueva contraseña (min. 6 caracteres)"
                                className="w-full px-3 py-2 pr-10 rounded-lg border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white-muted hover:text-white"
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={e => setConfirmPassword(e.target.value)}
                              placeholder="Confirmar contraseña"
                              className="w-full px-3 py-2 rounded-lg border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                              autoComplete="new-password"
                            />
                            {newPassword && confirmPassword && newPassword !== confirmPassword && (
                              <p className="text-xs text-red-400">Las contraseñas no coinciden</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleChangePassword(u.id)}
                                disabled={changingPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                              >
                                {changingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {changingPassword ? 'Cambiando...' : 'Guardar contraseña'}
                              </button>
                              <button
                                onClick={() => {
                                  setPasswordTarget(null)
                                  setNewPassword('')
                                  setConfirmPassword('')
                                  setShowPassword(false)
                                }}
                                className="btn-ghost text-xs py-1.5 px-3"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setPasswordTarget(u.id)
                              setNewPassword('')
                              setConfirmPassword('')
                            }}
                            className="flex items-center gap-1.5 text-xs text-white-muted hover:text-primary transition-colors py-1"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Cambiar contraseña
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {/* Create User Modal */}
      {showCreateModal && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" onClick={resetCreateModal} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-background border border-black-border rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-black-border">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" />
                  Crear Usuario
                </h2>
                <button onClick={resetCreateModal} className="p-2 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Email */}
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

                {/* Name */}
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

                {/* Role */}
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
                              ? 'border-primary/50 bg-primary/10 text-white'
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

                {/* Gender */}
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

                {/* Password */}
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

                {/* Confirm Password */}
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

              {/* Modal Footer */}
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
