'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Building2, MapPin, Plus, Pencil, Trash2, Save, UserPlus, Shield, Mail, Users } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
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
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', capacity: '' })

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [showCreateStaff, setShowCreateStaff] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [creatingStaff, setCreatingStaff] = useState(false)

  useEffect(() => {
    if (!organization?.id) return
    fetchData()
  }, [organization?.id])

  const fetchData = async () => {
    if (!organization?.id) return
    setLoading(true)
    const [venueRes, staffRes] = await Promise.all([
      supabase.from('venues').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('users').select('id, email, full_name, role, created_at').eq('organization_id', organization.id).in('role', ['scanner', 'admin', 'super_admin']).order('created_at', { ascending: false }),
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
    setVenueForm({ name: '', address: '', city: '', capacity: '' })
  }

  // Staff
  const handleCreateScanner = async () => {
    if (!newEmail || !organization?.id) return
    setCreatingStaff(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmail,
        password: crypto.randomUUID().slice(0, 12),
      })
      if (authError || !authData.user) {
        showError('Error: ' + (authError?.message || 'Error desconocido'))
        return
      }
      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        email: newEmail,
        full_name: newName || null,
        role: 'scanner',
        organization_id: organization.id,
      })
      if (profileError) { showError('Error: ' + profileError.message); return }
      success('Scanner creado')
      setNewEmail('')
      setNewName('')
      setShowCreateStaff(false)
      fetchData()
    } catch (err) {
      showError('Error al crear scanner')
    } finally {
      setCreatingStaff(false)
    }
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
            <div key={v.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{v.name}</p>
                <p className="text-[11px] text-white-muted truncate">{v.address || v.city || 'Sin direccion'}</p>
              </div>
              {v.capacity && <span className="text-[10px] text-white-muted bg-white/5 px-2 py-1 rounded-full">{v.capacity} cap.</span>}
              <button onClick={() => { setEditingVenue(v); setVenueForm({ name: v.name, address: v.address || '', city: v.city || '', capacity: v.capacity?.toString() || '' }); setShowVenueForm(true) }} className="p-1.5 rounded-lg hover:bg-white/5"><Pencil className="w-3.5 h-3.5 text-white-muted" /></button>
              <button onClick={() => handleDeleteVenue(v.id)} className="p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
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
          <button onClick={() => setShowCreateStaff(true)} className="btn-primary text-sm"><UserPlus className="w-4 h-4" /> Nuevo scanner</button>
        </div>

        {showCreateStaff && (
          <div className="card p-5 mb-4 space-y-3 border-primary/20">
            <h3 className="font-semibold text-white">Crear scanner</h3>
            <input type="text" placeholder="Nombre (opcional)" value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} />
            <input type="email" placeholder="Email del scanner" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputClass} />
            <div className="flex gap-2">
              <button onClick={handleCreateScanner} disabled={!newEmail || creatingStaff} className="btn-primary flex-1 py-2.5 text-sm">{creatingStaff ? 'Creando...' : 'Crear'}</button>
              <button onClick={() => { setShowCreateStaff(false); setNewEmail(''); setNewName('') }} className="btn-ghost px-4 py-2.5 text-sm">Cancelar</button>
            </div>
          </div>
        )}

        {staff.length > 3 && <SearchInput value={staffSearch} onChange={setStaffSearch} placeholder="Buscar staff..." />}

        <div className="space-y-2 mt-3">
          {staff.filter(m => {
            if (!staffSearch.trim()) return true
            const q = staffSearch.toLowerCase()
            return (m.full_name || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
          }).map(member => (
            <div key={member.id} className="card p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${member.role === 'super_admin' || member.role === 'admin' ? 'bg-primary/15' : 'bg-blue-500/15'}`}>
                <Shield className={`w-5 h-5 ${member.role === 'super_admin' || member.role === 'admin' ? 'text-primary' : 'text-blue-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{member.full_name || 'Sin nombre'}</p>
                <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-white-muted" /><p className="text-[11px] text-white-muted truncate">{member.email}</p></div>
              </div>
              <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${member.role === 'super_admin' ? 'bg-amber-500/10 text-amber-400' : member.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-blue-500/10 text-blue-400'}`}>
                {member.role === 'super_admin' ? 'Super Admin' : member.role === 'admin' ? 'Admin' : 'Scanner'}
              </span>
              {member.role === 'scanner' && (
                <button onClick={() => handleRemoveStaff(member.id)} className="p-1.5 rounded-lg hover:bg-red-500/10"><Trash2 className="w-4 h-4 text-red-400" /></button>
              )}
            </div>
          ))}
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
