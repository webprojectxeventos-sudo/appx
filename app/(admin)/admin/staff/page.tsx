'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { UserPlus, Shield, Trash2, Users, Mail } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'

interface StaffMember {
  id: string
  email: string
  full_name: string | null
  role: 'scanner' | 'admin'
  created_at: string
}

export default function StaffPage() {
  const { organization, isAdmin, initialized } = useAuth()
  const { selectedEventId } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const fetchStaff = async () => {
    if (!selectedEventId) return
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .eq('event_id', selectedEventId)
      .in('role', ['scanner', 'admin'])
      .order('created_at', { ascending: false })

    if (data) setStaff(data as StaffMember[])
    setLoading(false)
  }

  useEffect(() => {
    if (selectedEventId) fetchStaff()
  }, [selectedEventId])

  const handleCreateScanner = async () => {
    if (!newEmail || !selectedEventId) return
    setCreating(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newEmail,
        password: crypto.randomUUID().slice(0, 12),
      })

      if (authError || !authData.user) {
        showError('Error al crear usuario: ' + (authError?.message || 'Unknown error'))
        return
      }

      const { error: profileError } = await supabase.from('users').insert({
        id: authData.user.id,
        email: newEmail,
        full_name: newName || null,
        role: 'scanner',
        event_id: selectedEventId,
      })

      if (profileError) {
        showError('Error al crear perfil: ' + profileError.message)
        return
      }

      success('Scanner creado correctamente')
      setNewEmail('')
      setNewName('')
      setShowCreate(false)
      fetchStaff()
    } catch (err) {
      console.error(err)
      showError('Error al crear scanner')
    } finally {
      setCreating(false)
    }
  }

  const handleRemoveScanner = async (userId: string) => {
    if (!confirm('Seguro que quieres eliminar este scanner?')) return

    await supabase.from('users').update({ role: 'attendee' }).eq('id', userId)
    fetchStaff()
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  if (!selectedEventId) {
    return (
      <div className="text-center py-12">
        <Users className="w-10 h-10 text-white-muted mx-auto mb-3" />
        <p className="text-white-muted">Selecciona un instituto en la barra superior</p>
        <p className="text-white-muted text-sm mt-1">Elige un evento para gestionar su staff</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4 h-20 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Staff</h1>
          <p className="text-sm text-white-muted mt-0.5">Gestiona los scanners del evento</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary px-4 py-2 text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Nuevo scanner
        </button>
      </div>

      {/* Create Scanner Form */}
      {showCreate && (
        <div className="card p-5 space-y-4 border-primary/20">
          <h3 className="font-semibold text-white">Crear nuevo scanner</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre (opcional)"
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email del scanner"
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateScanner}
              disabled={!newEmail || creating}
              className="btn-primary flex-1 py-2.5 text-sm"
            >
              {creating ? 'Creando...' : 'Crear scanner'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewEmail(''); setNewName('') }}
              className="btn-ghost px-4 py-2.5 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      {staff.length > 0 && (
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre o email..." />
      )}

      {/* Staff List */}
      <div className="space-y-2">
        {staff.filter(m => {
          if (!search.trim()) return true
          const q = search.toLowerCase()
          return (m.full_name || '').toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        }).map((member) => (
          <div key={member.id} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              member.role === 'admin' ? 'bg-primary/15' : 'bg-blue-500/15'
            }`}>
              <Shield className={`w-5 h-5 ${member.role === 'admin' ? 'text-primary' : 'text-blue-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {member.full_name || 'Sin nombre'}
              </p>
              <div className="flex items-center gap-1.5">
                <Mail className="w-3 h-3 text-white-muted" />
                <p className="text-[11px] text-white-muted truncate">{member.email}</p>
              </div>
            </div>
            <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${
              member.role === 'admin'
                ? 'bg-primary/10 text-primary'
                : 'bg-blue-500/10 text-blue-400'
            }`}>
              {member.role === 'admin' ? 'Admin' : 'Scanner'}
            </span>
            {member.role === 'scanner' && (
              <button
                onClick={() => handleRemoveScanner(member.id)}
                className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            )}
          </div>
        ))}

        {staff.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-white-muted mx-auto mb-3" />
            <p className="text-white-muted">No hay staff configurado</p>
            <p className="text-white-muted text-sm mt-1">Crea un scanner para controlar la entrada</p>
          </div>
        )}
      </div>
    </div>
  )
}
