'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Building2, MapPin, Plus, Pencil, Trash2, Save, UserPlus, Shield, Mail, Users, ImagePlus, X, Eye, EyeOff, KeyRound } from 'lucide-react'
import NextImage from 'next/image'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { authFetch } from '@/lib/auth-fetch'
import type { Database } from '@/lib/types'

type Venue = Database['public']['Tables']['venues']['Row']

interface StaffMember {
  id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

export default function OrgPage() {
  const { user, organization, isSuperAdmin, initialized } = useAuth()
  const { error: showError, success } = useToast()

  // Venues
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showVenueForm, setShowVenueForm] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', capacity: '', image_url: '' })

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [showCreateStaff, setShowCreateStaff] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState<string>('scanner')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [creatingStaff, setCreatingStaff] = useState(false)
  // Change password
  const [changingPasswordFor, setChangingPasswordFor] = useState<string | null>(null)
  const [changePassword, setChangePassword] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    if (!organization?.id) return
    fetchData()
  }, [organization?.id])

  const fetchData = async () => {
    if (!organization?.id) return
    setLoading(true)
    const [venueRes, staffRes] = await Promise.all([
      supabase.from('venues').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('users').select('id, email, full_name, role, created_at').eq('organization_id', organization.id).in('role', ['scanner', 'promoter', 'admin', 'super_admin']).order('created_at', { ascending: false }),
    ])
    setVenues(venueRes.data || [])
    setStaff((staffRes.data || []) as StaffMember[])
    setLoading(false)
  }

  // Venue CRUD
  const handleSaveVenue = async () => {
    if (!venueForm.name || !organization?.id) return
    const payload = {
      name: venueForm.name,
      address: venueForm.address || null,
      city: venueForm.city || null,
      capacity: venueForm.capacity ? parseInt(venueForm.capacity) : null,
      image_url: venueForm.image_url || null,
      organization_id: organization.id,
    }
    if (editingVenue) {
      await supabase.from('venues').update(payload).eq('id', editingVenue.id)
    } else {
      await supabase.from('venues').insert(payload)
    }
    resetVenueForm()
    fetchData()
  }

  const handleDeleteVenue = async (id: string) => {
    if (!confirm('Eliminar este local? Los eventos asociados no se eliminaran.')) return
    await supabase.from('venues').delete().eq('id', id)
    fetchData()
  }

  const resetVenueForm = () => {
    setShowVenueForm(false)
    setEditingVenue(null)
    setVenueForm({ name: '', address: '', city: '', capacity: '', image_url: '' })
  }

  // Staff — uses /api/admin/create-user (admin.createUser, no confirmation email)
  const handleCreateStaffMember = async () => {
    if (!newEmail || !newPassword || !organization?.id) return
    if (newPassword.length < 6) { showError('La contraseña debe tener al menos 6 caracteres'); return }
    setCreatingStaff(true)
    try {
      const res = await authFetch('/api/admin/create-user', {
        email: newEmail,
        password: newPassword,
        fullName: newName || undefined,
        role: newStaffRole,
      })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error al crear usuario'); return }
      const roleLabels: Record<string, string> = { scanner: 'Scanner', promoter: 'Promotor', admin: 'Admin', group_admin: 'Group Admin', super_admin: 'Super Admin' }
      success(`${roleLabels[newStaffRole] || newStaffRole} creado correctamente`)
      setNewEmail(''); setNewName(''); setNewPassword(''); setShowCreateStaff(false)
      fetchData()
    } catch (err) { showError(err instanceof Error ? err.message : 'Error al crear usuario') }
    finally { setCreatingStaff(false) }
  }

  const handleChangePassword = async (userId: string) => {
    if (!changePassword || changePassword.length < 6) { showError('Mínimo 6 caracteres'); return }
    setSavingPassword(true)
    try {
      const res = await authFetch('/api/admin/change-password', { userId, newPassword: changePassword })
      const data = await res.json()
      if (!res.ok) { showError(data.error || 'Error'); return }
      success('Contraseña cambiada')
      setChangingPasswordFor(null); setChangePassword('')
    } catch (err) { showError(err instanceof Error ? err.message : 'Error al cambiar contraseña') }
    finally { setSavingPassword(false) }
  }

  const handleRemoveStaff = async (userId: string) => {
    if (!confirm('Eliminar este miembro del staff?')) return
    await supabase.from('users').update({ role: 'attendee' }).eq('id', userId)
    fetchData()
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isSuperAdmin) return null

  if (loading) return (
    <div className="space-y-6 animate-fade-in">
      <div className="h-8 w-64 bg-white/5 rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[0, 1, 2, 3].map(i => <div key={i} className="card h-32 animate-pulse" />)}</div>
    </div>
  )

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Org Header */}
      <div className="card-accent p-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{organization?.name || 'Organizacion'}</h1>
            <p className="text-sm text-white-muted">{venues.length} locales · {staff.length} staff</p>
          </div>
        </div>
      </div>

      {/* Venues Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Locales</h2>
          <button onClick={() => setShowVenueForm(true)} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Nuevo local</button>
        </div>

        {showVenueForm && (
          <div className="card p-5 mb-4 space-y-3 border-primary/20">
            <h3 className="font-semibold text-white">{editingVenue ? 'Editar local' : 'Nuevo local'}</h3>

            {/* Image preview + URL */}
            <div className="space-y-2">
              <label className="text-xs text-white-muted flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Foto del local</label>
              {venueForm.image_url ? (
                <div className="relative rounded-xl overflow-hidden border border-black-border">
                  <div className="relative aspect-[16/9]">
                    <NextImage src={venueForm.image_url} alt="Preview" fill className="object-cover" />
                  </div>
                  <button
                    onClick={() => setVenueForm({ ...venueForm, image_url: '' })}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 border border-white/10 hover:bg-red-500/30 transition-colors"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : null}
              <input type="url" placeholder="URL de la foto (pega el enlace de la imagen)" value={venueForm.image_url} onChange={e => setVenueForm({ ...venueForm, image_url: e.target.value })} className={inputClass} />
            </div>

            <input type="text" placeholder="Nombre del local *" value={venueForm.name} onChange={e => setVenueForm({ ...venueForm, name: e.target.value })} className={inputClass} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" placeholder="Direccion" value={venueForm.address} onChange={e => setVenueForm({ ...venueForm, address: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Ciudad" value={venueForm.city} onChange={e => setVenueForm({ ...venueForm, city: e.target.value })} className={inputClass} />
            </div>
            <input type="number" placeholder="Capacidad" value={venueForm.capacity} onChange={e => setVenueForm({ ...venueForm, capacity: e.target.value })} className={inputClass} />
            <div className="flex gap-2 justify-end">
              <button onClick={resetVenueForm} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleSaveVenue} className="btn-primary text-sm"><Save className="w-4 h-4" /> Guardar</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {venues.map(v => (
            <div key={v.id} className="card overflow-hidden">
              {/* Venue image */}
              {v.image_url ? (
                <div className="relative aspect-[16/9] bg-black-card">
                  <NextImage src={v.image_url} alt={v.name} fill className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-sm font-bold text-white drop-shadow-lg">{v.name}</p>
                    <p className="text-[11px] text-white/70 drop-shadow">{v.address || v.city || ''}</p>
                  </div>
                </div>
              ) : null}
              <div className="p-4 flex items-center gap-3">
                {!v.image_url && (
                  <>
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{v.name}</p>
                      <p className="text-[11px] text-white-muted truncate">{v.address || v.city || 'Sin direccion'}</p>
                    </div>
                  </>
                )}
                {v.image_url && <div className="flex-1" />}
                {v.capacity && <span className="text-[10px] text-white-muted bg-white/5 px-2 py-1 rounded-full">{v.capacity} cap.</span>}
                <button onClick={() => { setEditingVenue(v); setVenueForm({ name: v.name, address: v.address || '', city: v.city || '', capacity: v.capacity?.toString() || '', image_url: v.image_url || '' }); setShowVenueForm(true) }} className="p-1.5 rounded-lg hover:bg-white/5"><Pencil className="w-3.5 h-3.5 text-white-muted" /></button>
                <button onClick={() => handleDeleteVenue(v.id)} className="p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </div>
            </div>
          ))}
          {venues.length === 0 && (
            <div className="col-span-2 card p-8 text-center">
              <MapPin className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay locales. Crea uno para asignar eventos.</p>
            </div>
          )}
        </div>
      </div>

      {/* Staff Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Staff</h2>
          <button onClick={() => setShowCreateStaff(true)} className="btn-primary text-sm"><UserPlus className="w-4 h-4" /> Nuevo staff</button>
        </div>

        {showCreateStaff && (
          <div className="card p-5 mb-4 space-y-3 border-primary/20">
            <h3 className="font-semibold text-white">Crear staff</h3>
            {/* Role selector */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {[
                { value: 'scanner', label: 'Scanner', color: 'blue' },
                { value: 'promoter', label: 'Promotor', color: 'amber' },
                { value: 'admin', label: 'Admin', color: 'primary' },
                { value: 'group_admin', label: 'Group Admin', color: 'violet' },
                { value: 'super_admin', label: 'Super Admin', color: 'amber' },
              ].map(r => {
                const active = newStaffRole === r.value
                const colorMap: Record<string, string> = {
                  blue: active ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : '',
                  amber: active ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : '',
                  primary: active ? 'border-primary/50 bg-primary/10 text-primary' : '',
                  violet: active ? 'border-violet-500/50 bg-violet-500/10 text-violet-400' : '',
                }
                return (
                  <button key={r.value} onClick={() => setNewStaffRole(r.value)} className={`py-2 rounded-xl text-xs font-medium border transition-all ${active ? colorMap[r.color] : 'border-black-border text-white-muted hover:text-white'}`}>
                    {r.label}
                  </button>
                )
              })}
            </div>
            <input type="text" placeholder="Nombre (opcional)" value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Email (puede ser inventado)" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputClass} />
            {/* Password field */}
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Contraseña (mín. 6 caracteres)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={inputClass}
              />
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white-muted hover:text-white p-1">
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-white-muted -mt-1">El usuario podrá entrar directamente con este email y contraseña. No se envía email de confirmación.</p>
            <div className="flex gap-2">
              <button onClick={handleCreateStaffMember} disabled={!newEmail || !newPassword || newPassword.length < 6 || creatingStaff} className="btn-primary flex-1 py-2.5 text-sm">{creatingStaff ? 'Creando...' : 'Crear'}</button>
              <button onClick={() => { setShowCreateStaff(false); setNewEmail(''); setNewName(''); setNewPassword(''); setNewStaffRole('scanner') }} className="btn-ghost px-4 py-2.5 text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {staff.length > 3 && <SearchInput value={staffSearch} onChange={setStaffSearch} placeholder="Buscar staff..." />}

        <div className="space-y-2 mt-3">
          {staff.filter(m => {
            if (!staffSearch.trim()) return true
            const q = staffSearch.toLowerCase()
            return (m.full_name || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
          }).map(member => {
            const roleLabel: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', group_admin: 'Group Admin', promoter: 'Promotor', scanner: 'Scanner' }
            const roleColor = member.role === 'super_admin' ? 'bg-amber-500/10 text-amber-400' : member.role === 'admin' ? 'bg-primary/10 text-primary' : member.role === 'group_admin' ? 'bg-violet-500/10 text-violet-400' : member.role === 'promoter' ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'
            const iconColor = member.role === 'super_admin' || member.role === 'admin' ? 'text-primary' : member.role === 'group_admin' ? 'text-violet-400' : 'text-blue-400'
            const isChangingPw = changingPasswordFor === member.id

            return (
              <div key={member.id} className="card overflow-hidden">
                <div className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${member.role === 'super_admin' || member.role === 'admin' ? 'bg-primary/15' : member.role === 'group_admin' ? 'bg-violet-500/15' : 'bg-blue-500/15'}`}>
                    <Shield className={`w-5 h-5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{member.full_name || 'Sin nombre'}</p>
                    <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-white-muted" /><p className="text-[11px] text-white-muted truncate">{member.email}</p></div>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${roleColor}`}>
                    {roleLabel[member.role] || member.role}
                  </span>
                  <button onClick={() => { setChangingPasswordFor(isChangingPw ? null : member.id); setChangePassword('') }} className="p-1.5 rounded-lg hover:bg-white/5" title="Cambiar contraseña">
                    <KeyRound className={`w-4 h-4 ${isChangingPw ? 'text-primary' : 'text-white-muted'}`} />
                  </button>
                  {member.id !== user?.id && (
                    <button onClick={() => handleRemoveStaff(member.id)} className="p-1.5 rounded-lg hover:bg-red-500/10" title="Eliminar"><Trash2 className="w-4 h-4 text-red-400" /></button>
                  )}
                </div>
                {/* Inline change password */}
                {isChangingPw && (
                  <div className="px-4 pb-4 flex items-center gap-2 border-t border-white/5 pt-3">
                    <div className="relative flex-1">
                      <input
                        type={showChangePassword ? 'text' : 'password'}
                        placeholder="Nueva contraseña (mín. 6)"
                        value={changePassword}
                        onChange={e => setChangePassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                      />
                      <button type="button" onClick={() => setShowChangePassword(!showChangePassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white-muted hover:text-white p-0.5">
                        {showChangePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleChangePassword(member.id)}
                      disabled={!changePassword || changePassword.length < 6 || savingPassword}
                      className="btn-primary text-xs px-3 py-2 rounded-lg"
                    >
                      {savingPassword ? '...' : 'Guardar'}
                    </button>
                    <button onClick={() => { setChangingPasswordFor(null); setChangePassword('') }} className="text-white-muted hover:text-white text-xs px-2 py-2">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {staff.length === 0 && (
            <div className="card p-8 text-center">
              <Users className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay staff. Crea un scanner para controlar la entrada.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
