'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  CalendarClock,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Music,
  Utensils,
  Camera,
  Mic,
  Star,
  Gift,
  PartyPopper,
  GraduationCap,
  Bus,
  MapPin,
  Trophy,
  Heart,
  Sparkles,
  X,
  Eye,
  type LucideIcon,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type ScheduleItem = Database['public']['Tables']['event_schedule']['Row']

const ICON_OPTIONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'clock', icon: Clock, label: 'Reloj' },
  { key: 'music', icon: Music, label: 'Musica' },
  { key: 'utensils', icon: Utensils, label: 'Comida' },
  { key: 'camera', icon: Camera, label: 'Fotos' },
  { key: 'mic', icon: Mic, label: 'Micro' },
  { key: 'star', icon: Star, label: 'Estrella' },
  { key: 'gift', icon: Gift, label: 'Regalo' },
  { key: 'party-popper', icon: PartyPopper, label: 'Fiesta' },
  { key: 'graduation-cap', icon: GraduationCap, label: 'Graduacion' },
  { key: 'bus', icon: Bus, label: 'Transporte' },
  { key: 'map-pin', icon: MapPin, label: 'Ubicacion' },
  { key: 'trophy', icon: Trophy, label: 'Trofeo' },
  { key: 'heart', icon: Heart, label: 'Corazon' },
  { key: 'sparkles', icon: Sparkles, label: 'Especial' },
]

function getIconComponent(iconKey: string): LucideIcon {
  return ICON_OPTIONS.find(i => i.key === iconKey)?.icon || Clock
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

interface FormData {
  title: string
  description: string
  start_time: string
  end_time: string
  icon: string
}

const emptyForm: FormData = { title: '', description: '', start_time: '', end_time: '', icon: 'clock' }

export default function SchedulePage() {
  const { isAdmin, initialized } = useAuth()
  const { selectedEventId, events } = useAdminSelection()
  const { error: showError, success } = useToast()

  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const selectedEvent = events.find(e => e.id === selectedEventId)

  const fetchItems = useCallback(async () => {
    if (!selectedEventId) { setItems([]); setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('event_schedule')
        .select('*')
        .eq('event_id', selectedEventId)
        .order('start_time', { ascending: true })
      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error('Error fetching schedule:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedEventId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (item: ScheduleItem) => {
    setEditingId(item.id)
    setForm({
      title: item.title,
      description: item.description || '',
      start_time: item.start_time.slice(0, 16), // format for datetime-local
      end_time: item.end_time ? item.end_time.slice(0, 16) : '',
      icon: item.icon || 'clock',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_time || !selectedEventId) {
      showError('Titulo y hora de inicio son obligatorios')
      return
    }
    setSaving(true)
    try {
      const payload = {
        event_id: selectedEventId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        icon: form.icon,
      }

      if (editingId) {
        const { error } = await supabase.from('event_schedule').update(payload).eq('id', editingId)
        if (error) throw error
        success('Item actualizado')
      } else {
        const { error } = await supabase.from('event_schedule').insert(payload)
        if (error) throw error
        success('Item creado')
      }

      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
      await fetchItems()
    } catch (err) {
      console.error('Error saving:', err)
      showError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('event_schedule').delete().eq('id', id)
      if (error) throw error
      success('Item eliminado')
      setConfirmDelete(null)
      await fetchItems()
    } catch (err) {
      console.error('Error deleting:', err)
      showError('Error al eliminar')
    }
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarClock className="w-6 h-6 text-primary" />
            Programa
          </h1>
          <p className="text-sm text-white-muted mt-0.5">
            {selectedEvent ? (selectedEvent.group_name || selectedEvent.title) : 'Selecciona un instituto'}
          </p>
        </div>
        {selectedEventId && (
          <div className="flex gap-2">
            {items.length > 0 && (
              <button onClick={() => setShowPreview(!showPreview)} className="btn-ghost text-sm">
                <Eye className="w-4 h-4" /> {showPreview ? 'Editar' : 'Preview'}
              </button>
            )}
            <button onClick={openCreate} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>
        )}
      </div>

      {!selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior.</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-5 space-y-4 border-primary/20 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">{editingId ? 'Editar item' : 'Nuevo item'}</h3>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 rounded-lg hover:bg-white/5">
              <X className="w-4 h-4 text-white-muted" />
            </button>
          </div>

          <div>
            <label className="block text-xs text-white-muted mb-1">Titulo *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ej: Llegada y acreditacion"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs text-white-muted mb-1">Descripcion</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Detalles opcionales..."
              rows={2}
              className={cn(inputClass, 'resize-none')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white-muted mb-1">Hora inicio *</label>
              <input
                type="datetime-local"
                value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs text-white-muted mb-1">Hora fin</label>
              <input
                type="datetime-local"
                value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-white-muted mb-1">Icono</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.key}
                    onClick={() => setForm({ ...form, icon: opt.key })}
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center border transition-all',
                      form.icon === opt.key
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-black-border text-white-muted hover:border-white/15'
                    )}
                    title={opt.label}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="btn-ghost text-sm">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Preview mode */}
      {showPreview && items.length > 0 && selectedEventId && (
        <div className="card p-6 space-y-0">
          <h3 className="font-semibold text-white mb-4">Vista previa del programa</h3>
          <div className="relative pl-8">
            {/* Timeline line */}
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-primary/60 via-primary/30 to-transparent" />

            {items.map((item, i) => {
              const Icon = getIconComponent(item.icon)
              return (
                <div key={item.id} className="relative mb-6 last:mb-0">
                  {/* Timeline dot */}
                  <div className="absolute -left-5 top-1 w-5 h-5 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>

                  <div className="ml-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-xs text-primary font-medium">
                        {formatTime(item.start_time)}
                        {item.end_time && ` - ${formatTime(item.end_time)}`}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-white">{item.title}</h4>
                    {item.description && (
                      <p className="text-xs text-white-muted mt-0.5">{item.description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Edit list */}
      {!showPreview && selectedEventId && (
        <>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="card h-16 animate-pulse" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="card p-8 text-center">
              <CalendarClock className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay items en el programa. Crea el primero.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const Icon = getIconComponent(item.icon)
                return (
                  <div key={item.id} className="card p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.title}</p>
                      <p className="text-xs text-white-muted">
                        {formatTime(item.start_time)}
                        {item.end_time && ` - ${formatTime(item.end_time)}`}
                      </p>
                      {item.description && (
                        <p className="text-xs text-white-muted/60 truncate mt-0.5">{item.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-white-muted" />
                      </button>

                      {confirmDelete === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-[11px] font-medium px-2 py-1 rounded-lg bg-red-500/10 text-red-400"
                          >
                            Si
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white/5 text-white-muted"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(item.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
