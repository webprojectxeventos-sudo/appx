'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { Pencil, Plus, Trash2, X, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SearchInput } from '@/components/admin/search-input'
import { FilterBar } from '@/components/admin/filter-bar'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

export default function EventsPage() {
  const { user, organization, isSuperAdmin, isAdmin, initialized } = useAuth()
  const { venues: contextVenues } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [allVenues, setAllVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [formData, setFormData] = useState({
    title: '', description: '', date: '', location: '', cover_image_url: '',
    event_type: 'fiesta' as 'eso' | 'fiesta', venue_id: '' as string,
  })
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => { fetchEvents() }, [user])

  useEffect(() => {
    // Load all org venues for the form dropdown
    const loadVenues = async () => {
      if (!organization?.id) return
      const { data } = await supabase
        .from('venues')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name')
      if (data) setAllVenues(data)
    }
    loadVenues()
  }, [organization?.id])

  const fetchEvents = async () => {
    if (!user) return
    setLoading(true)
    try {
      let query = supabase.from('events').select('*').order('created_at', { ascending: false })
      if (isSuperAdmin && organization?.id) {
        query = query.eq('organization_id', organization.id)
      } else {
        query = query.eq('created_by', user.id)
      }
      const { data, error } = await query
      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      console.error('Error fetching events:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateEventCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    return code
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !formData.title || !formData.date) { showError('Completa los campos requeridos'); return }
    try {
      if (editingEvent) {
        const { error } = await supabase.from('events').update({
          title: formData.title, description: formData.description, date: formData.date,
          location: formData.location, cover_image_url: formData.cover_image_url, event_type: formData.event_type,
          venue_id: formData.venue_id || null,
        }).eq('id', editingEvent.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('events').insert({
          title: formData.title, description: formData.description, date: formData.date,
          location: formData.location, cover_image_url: formData.cover_image_url,
          event_type: formData.event_type, event_code: generateEventCode(), created_by: user.id,
          organization_id: organization?.id || null,
          venue_id: formData.venue_id || null,
        })
        if (error) throw error
      }
      resetForm()
      success(editingEvent ? 'Evento actualizado' : 'Evento creado')
      await fetchEvents()
    } catch (err) {
      console.error('Error saving event:', err)
      showError('Error al guardar el evento')
    }
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingEvent(null)
    setFormData({ title: '', description: '', date: '', location: '', cover_image_url: '', event_type: 'fiesta', venue_id: '' })
  }

  const handleEdit = (event: Event) => {
    setEditingEvent(event)
    setFormData({
      title: event.title, description: event.description || '', date: event.date,
      location: event.location || '', cover_image_url: event.cover_image_url || '',
      event_type: event.event_type || 'fiesta', venue_id: event.venue_id || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (eventId: string) => {
    if (!confirm('Seguro que quieres eliminar este evento?')) return
    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId)
      if (error) throw error
      success('Evento eliminado')
      await fetchEvents()
    } catch (err) {
      console.error('Error deleting event:', err)
      showError('Error al eliminar el evento')
    }
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const getVenueName = (venueId: string | null) => {
    if (!venueId) return null
    return allVenues.find(v => v.id === venueId)?.name || null
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  const filteredEvents = events.filter(ev => {
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!ev.title.toLowerCase().includes(q) && !ev.event_code.toLowerCase().includes(q) && !(ev.group_name || '').toLowerCase().includes(q)) return false
    }
    if (typeFilter !== 'all' && ev.event_type !== typeFilter) return false
    return true
  })

  const typeFilters = [
    { key: 'all', label: 'Todos', count: events.length },
    { key: 'fiesta', label: 'Fiesta', count: events.filter(e => e.event_type === 'fiesta').length },
    { key: 'eso', label: '4.ºESO', count: events.filter(e => e.event_type === 'eso').length },
  ]

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient-primary">Eventos</h1>
          <p className="text-sm text-white-muted mt-0.5">Gestiona tus eventos</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cerrar' : 'Crear'}
        </button>
      </div>

      {/* Search + Filters */}
      {!showForm && events.length > 0 && (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por titulo, codigo o grupo..." />
          <FilterBar filters={typeFilters} activeFilter={typeFilter} onFilterChange={setTypeFilter} />
        </>
      )}

      {/* Form */}
      {showForm && (
        <div className="card-accent p-5 animate-slide-up">
          <h2 className="text-lg font-bold text-white mb-4">
            {editingEvent ? 'Editar Evento' : 'Nuevo Evento'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white-muted mb-1.5">Titulo *</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Nombre del evento" className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-white-muted mb-1.5">Descripcion</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descripcion del evento" rows={3} className={cn(inputClass, 'resize-none')} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white-muted mb-1.5">Fecha y Hora *</label>
                <input type="datetime-local" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={inputClass} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-white-muted mb-1.5">Ubicacion</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Lugar del evento" className={inputClass} />
              </div>
            </div>
            {/* Venue selector */}
            {allVenues.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-white-muted mb-1.5">Venue (discoteca/finca)</label>
                <select
                  value={formData.venue_id}
                  onChange={(e) => setFormData({ ...formData, venue_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Sin venue asignado</option>
                  {allVenues.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-white-muted mb-1.5">Tipo de Evento</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['fiesta', 'eso'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, event_type: type })}
                    className={cn(
                      'px-4 py-3 rounded-xl text-sm font-medium text-center border transition-all',
                      formData.event_type === type
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-black-border bg-transparent text-white-muted hover:border-white/15'
                    )}
                  >
                    {type === 'fiesta' ? 'Fiesta (con alcohol)' : '4.ºESO (sin alcohol)'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white-muted mb-1.5">URL Imagen de Portada</label>
              <input type="text" value={formData.cover_image_url} onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })} placeholder="https://..." className={inputClass} />
            </div>
            <div className="flex gap-2.5 justify-end pt-2">
              <button type="button" onClick={resetForm} className="btn-ghost">Cancelar</button>
              <button type="submit" className="btn-primary">{editingEvent ? 'Actualizar' : 'Crear'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <div key={i} className="card h-52 animate-pulse" />)}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card-accent p-8 text-center">
          <p className="text-white-muted">{events.length === 0 ? 'No hay eventos. Crea tu primer evento para empezar.' : 'No hay eventos que coincidan con tu busqueda.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.map((event) => {
            const venueName = getVenueName(event.venue_id)
            return (
              <div key={event.id} className="card overflow-hidden">
                {event.cover_image_url && (
                  <div className="relative w-full h-36 overflow-hidden bg-black-card">
                    <Image src={event.cover_image_url} alt={event.title} fill className="object-cover" />
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-white line-clamp-2">{event.title}</h3>
                    <span className="text-[11px] font-bold text-white bg-primary px-2 py-0.5 rounded-full whitespace-nowrap">
                      {event.event_code}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-white-muted text-xs line-clamp-2">{event.description}</p>
                  )}
                  <div className="space-y-1 text-xs text-white-muted">
                    {venueName && (
                      <p className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-primary" />
                        <span className="text-primary font-medium">{venueName}</span>
                      </p>
                    )}
                    {event.location && <p><span className="text-primary font-medium">Ubicacion:</span> {event.location}</p>}
                    <p><span className="text-primary font-medium">Fecha:</span> {formatDate(event.date)}</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => handleEdit(event)} className="btn-ghost flex-1 text-xs py-2">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="px-3 py-2 rounded-xl text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
