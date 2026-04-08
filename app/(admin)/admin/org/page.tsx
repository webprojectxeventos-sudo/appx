'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Building2, MapPin, Plus, Users, Calendar, Pencil, Trash2, X, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']
type Organization = Database['public']['Tables']['organizations']['Row']

interface GroupEvent extends Event {
  attendeeCount: number
  ticketCount: number
}

export default function OrgPage() {
  const { user, organization, isSuperAdmin, initialized } = useAuth()
  const { error: showError, success } = useToast()
  const [venues, setVenues] = useState<Venue[]>([])
  const [events, setEvents] = useState<GroupEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showVenueForm, setShowVenueForm] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [venueForm, setVenueForm] = useState({ name: '', address: '', city: '', capacity: '' })
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({
    title: '', description: '', date: '', location: '', venue_id: '', group_name: '',
    event_type: 'fiesta' as 'eso' | 'fiesta', cover_image_url: '',
  })

  useEffect(() => {
    if (!organization?.id) return
    let cancelled = false
    fetchData().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [organization?.id])

  const fetchData = async () => {
    if (!organization?.id) return
    setLoading(true)

    const [venueRes, eventRes] = await Promise.all([
      supabase.from('venues').select('*').eq('organization_id', organization.id).order('name'),
      supabase.from('events').select('*').eq('organization_id', organization.id).order('date', { ascending: false }),
    ])

    setVenues(venueRes.data || [])

    // Enrich events with counts
    const eventsData = eventRes.data || []
    const enriched: GroupEvent[] = await Promise.all(
      eventsData.map(async (ev) => {
        const [att, tix] = await Promise.all([
          supabase.from('user_events').select('id', { count: 'exact', head: true }).eq('event_id', ev.id).eq('is_active', true),
          supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', ev.id),
        ])
        return { ...ev, attendeeCount: att.count || 0, ticketCount: tix.count || 0 }
      })
    )
    setEvents(enriched)
    setLoading(false)
  }

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

  const generateEventCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    return code
  }

  const handleCreateEvent = async () => {
    if (!eventForm.title || !eventForm.date || !user || !organization?.id) return
    const { error } = await supabase.from('events').insert({
      title: eventForm.title,
      description: eventForm.description || null,
      date: eventForm.date,
      location: eventForm.location || null,
      venue_id: eventForm.venue_id || null,
      group_name: eventForm.group_name || null,
      event_type: eventForm.event_type,
      cover_image_url: eventForm.cover_image_url || null,
      organization_id: organization.id,
      event_code: generateEventCode(),
      created_by: user.id,
    })
    if (error) { showError(error.message); return }
    success('Grupo creado correctamente')
    setShowEventForm(false)
    setEventForm({ title: '', description: '', date: '', location: '', venue_id: '', group_name: '', event_type: 'fiesta', cover_image_url: '' })
    fetchData()
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isSuperAdmin) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-64 bg-white/5 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="card h-32 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Org Header */}
      <div className="card-accent p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{organization?.name || 'Organizacion'}</h1>
            <p className="text-sm text-white-muted">{events.length} grupos · {venues.length} locales</p>
          </div>
        </div>
      </div>

      {/* Venues Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Locales</h2>
          <button onClick={() => setShowVenueForm(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Nuevo local
          </button>
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
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{v.name}</p>
                <p className="text-[11px] text-white-muted truncate">{v.address || v.city || 'Sin direccion'}</p>
              </div>
              {v.capacity && (
                <span className="text-[10px] text-white-muted bg-white/5 px-2 py-1 rounded-full">{v.capacity} cap.</span>
              )}
              <button onClick={() => { setEditingVenue(v); setVenueForm({ name: v.name, address: v.address || '', city: v.city || '', capacity: v.capacity?.toString() || '' }); setShowVenueForm(true) }} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <Pencil className="w-3.5 h-3.5 text-white-muted" />
              </button>
              <button onClick={() => handleDeleteVenue(v.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
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

      {/* Events / Groups Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Grupos / Eventos</h2>
          <button onClick={() => setShowEventForm(true)} className="btn-primary text-sm">
            <Plus className="w-4 h-4" /> Nuevo grupo
          </button>
        </div>

        {showEventForm && (
          <div className="card p-5 mb-4 space-y-3 border-primary/20">
            <h3 className="font-semibold text-white">Nuevo grupo / evento</h3>
            <input type="text" placeholder="Nombre del grupo (ej: IES Cervantes 4ºA) *" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Nombre corto del grupo (ej: Cervantes A)" value={eventForm.group_name} onChange={e => setEventForm({ ...eventForm, group_name: e.target.value })} className={inputClass} />
            <textarea placeholder="Descripcion" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={2} className={cn(inputClass, 'resize-none')} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white-muted mb-1">Fecha y hora *</label>
                <input type="datetime-local" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-white-muted mb-1">Local</label>
                <select value={eventForm.venue_id} onChange={e => setEventForm({ ...eventForm, venue_id: e.target.value })} className={inputClass}>
                  <option value="">Sin asignar</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <input type="text" placeholder="Ubicacion (texto libre)" value={eventForm.location} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} className={inputClass} />
            <div className="grid grid-cols-2 gap-2.5">
              {(['fiesta', 'eso'] as const).map((type) => (
                <button key={type} type="button" onClick={() => setEventForm({ ...eventForm, event_type: type })}
                  className={cn('px-4 py-3 rounded-xl text-sm font-medium text-center border transition-all',
                    eventForm.event_type === type ? 'border-primary bg-primary/12 text-primary' : 'border-black-border bg-transparent text-white-muted hover:border-white/15'
                  )}>
                  {type === 'fiesta' ? 'Fiesta (con alcohol)' : '4.ºESO (sin alcohol)'}
                </button>
              ))}
            </div>
            <input type="text" placeholder="URL imagen de portada" value={eventForm.cover_image_url} onChange={e => setEventForm({ ...eventForm, cover_image_url: e.target.value })} className={inputClass} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowEventForm(false)} className="btn-ghost text-sm">Cancelar</button>
              <button onClick={handleCreateEvent} className="btn-primary text-sm"><Plus className="w-4 h-4" /> Crear</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {events.map(ev => {
            const venue = venues.find(v => v.id === ev.venue_id)
            return (
              <div key={ev.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', ev.event_type === 'eso' ? 'bg-emerald-500/10' : 'bg-violet-500/10')}>
                    <Calendar className={cn('w-5 h-5', ev.event_type === 'eso' ? 'text-emerald-400' : 'text-violet-400')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-white truncate">{ev.title}</h3>
                      <span className="text-[10px] font-bold text-white bg-primary px-2 py-0.5 rounded-full flex-shrink-0">{ev.event_code}</span>
                    </div>
                    {ev.group_name && <p className="text-[11px] text-primary mb-1">{ev.group_name}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white-muted">
                      <span>{new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {venue && <span>{venue.name}</span>}
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {ev.attendeeCount}</span>
                    </div>
                  </div>
                  <span className={cn('text-[10px] font-medium px-2 py-1 rounded-full', ev.event_type === 'eso' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-violet-500/10 text-violet-400')}>
                    {ev.event_type === 'eso' ? 'ESO' : 'Fiesta'}
                  </span>
                </div>
              </div>
            )
          })}
          {events.length === 0 && (
            <div className="card p-8 text-center">
              <Calendar className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay grupos creados en esta organizacion.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
