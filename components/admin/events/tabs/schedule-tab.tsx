'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  CalendarClock, Plus, Pencil, Trash2, Clock, Music, Utensils, Camera, Mic, Star,
  Gift, PartyPopper, GraduationCap, Bus, MapPin, Trophy, Heart, Sparkles, X,
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
  title: string; description: string; start_time: string; end_time: string; icon: string
}
const emptyForm: FormData = { title: '', description: '', start_time: '', end_time: '', icon: 'clock' }

interface ScheduleTabProps {
  eventId: string
}

export function ScheduleTab({ eventId }: ScheduleTabProps) {
  const { error: showError, success } = useToast()
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('event_schedule').select('*').eq('event_id', eventId).order('start_time', { ascending: true })
      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (item: ScheduleItem) => {
    setEditingId(item.id)
    setForm({ title: item.title, description: item.description || '', start_time: item.start_time.slice(0, 16), end_time: item.end_time ? item.end_time.slice(0, 16) : '', icon: item.icon || 'clock' })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_time) { showError('Titulo y hora son obligatorios'); return }
    setSaving(true)
    try {
      const payload = {
        event_id: eventId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        start_time: new Date(form.start_time).toISOString(),
        end_time: form.end_time ? new Date(form.end_time).toISOString() : null,
        icon: form.icon,
      }
      if (editingId) {
        const { error } = await supabase.from('event_schedule').update(payload).eq('id', editingId)
        if (error) throw error
        success('Actualizado')
      } else {
        const { error } = await supabase.from('event_schedule').insert(payload)
        if (error) throw error
        success('Creado')
      }
      setShowForm(false); setForm(emptyForm); setEditingId(null)
      await fetchItems()
    } catch (err) {
      showError('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('event_schedule').delete().eq('id', id)
      if (error) throw error
      success('Eliminado')
      setConfirmDelete(null)
      await fetchItems()
    } catch (err) {
      showError('Error al eliminar')
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40'

  if (loading) return <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{items.length} items</span>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-1.5"><Plus className="w-3 h-3" /> Nuevo</button>
      </div>

      {showForm && (
        <div className="p-4 rounded-xl border border-primary/20 bg-white/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">{editingId ? 'Editar' : 'Nuevo'}</span>
            <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 rounded hover:bg-white/5"><X className="w-3.5 h-3.5 text-white-muted" /></button>
          </div>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Titulo *" className={inputClass} />
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripcion..." rows={2} className={cn(inputClass, 'resize-none')} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-[10px] text-white-muted mb-1">Inicio *</label><input type="datetime-local" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className={inputClass} /></div>
            <div><label className="block text-[10px] text-white-muted mb-1">Fin</label><input type="datetime-local" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className={inputClass} /></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ICON_OPTIONS.map(opt => {
              const Icon = opt.icon
              return (
                <button key={opt.key} onClick={() => setForm({ ...form, icon: opt.key })} className={cn('w-8 h-8 rounded-lg flex items-center justify-center border', form.icon === opt.key ? 'border-primary bg-primary/10 text-primary' : 'border-black-border text-white-muted')} title={opt.label}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              )
            })}
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-2 text-sm">{saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-8 text-center">
          <CalendarClock className="w-8 h-8 text-white-muted mx-auto mb-2" />
          <p className="text-white-muted text-sm">Sin items en el programa</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {items.map(item => {
            const Icon = getIconComponent(item.icon)
            return (
              <div key={item.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.03]">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  <p className="text-[10px] text-white-muted">{formatTime(item.start_time)}{item.end_time && ` - ${formatTime(item.end_time)}`}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1 rounded hover:bg-white/5"><Pencil className="w-3 h-3 text-white-muted" /></button>
                  {confirmDelete === item.id ? (
                    <div className="flex gap-0.5">
                      <button onClick={() => handleDelete(item.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Si</button>
                      <button onClick={() => setConfirmDelete(null)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white-muted">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(item.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
