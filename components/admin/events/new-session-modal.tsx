'use client'

import { useState } from 'react'
import { X, CalendarPlus, Check, Clock, PartyPopper, GraduationCap, Plus, Building2, Loader2 } from 'lucide-react'
import { cn, toLocalDateKey } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Venue = Database['public']['Tables']['venues']['Row']

interface NewSessionModalProps {
  open: boolean
  onClose: () => void
  allVenues: Venue[]
  existingDates: string[]
  onCreated: (date: string, venueIds: string[], time: string, eventType: 'fiesta' | 'eso') => void
  /** Organization id — required to create new venues inline. */
  organizationId?: string
  /** Called after a new venue is inserted so the parent can merge it into allVenues. */
  onVenueCreated?: (venue: Venue) => void
}

export function NewSessionModal({
  open,
  onClose,
  allVenues,
  existingDates,
  onCreated,
  organizationId,
  onVenueCreated,
}: NewSessionModalProps) {
  const { error: showError, success } = useToast()
  // Default date: next Saturday (local timezone)
  const getNextSaturday = () => {
    const d = new Date()
    d.setDate(d.getDate() + (6 - d.getDay() + 7) % 7 || 7)
    return toLocalDateKey(d)
  }

  const [date, setDate] = useState(getNextSaturday)
  const [time, setTime] = useState('00:00')
  const [eventType, setEventType] = useState<'fiesta' | 'eso'>('fiesta')
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(new Set())

  // Inline create-venue flow
  const [creatingVenue, setCreatingVenue] = useState(false)
  const [savingVenue, setSavingVenue] = useState(false)
  const [venueForm, setVenueForm] = useState({ name: '', city: '', capacity: '' })

  const dateExists = existingDates.includes(date)

  const toggleVenue = (id: string) => {
    setSelectedVenueIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateVenue = async () => {
    if (!venueForm.name.trim() || !organizationId) return
    setSavingVenue(true)
    const { data, error } = await supabase
      .from('venues')
      .insert({
        name: venueForm.name.trim(),
        city: venueForm.city.trim() || null,
        capacity: venueForm.capacity ? parseInt(venueForm.capacity) : null,
        organization_id: organizationId,
      })
      .select()
      .single()
    setSavingVenue(false)
    if (error || !data) {
      showError(error?.message || 'No se pudo crear el venue')
      return
    }
    success(`Venue "${data.name}" creado`)
    onVenueCreated?.(data as Venue)
    // Auto-select the newly created venue so the user can submit immediately
    setSelectedVenueIds(prev => new Set([...prev, data.id]))
    setVenueForm({ name: '', city: '', capacity: '' })
    setCreatingVenue(false)
  }

  const handleSubmit = () => {
    if (!date) return
    onCreated(date, Array.from(selectedVenueIds), time, eventType)
    setSelectedVenueIds(new Set())
    setCreatingVenue(false)
    setVenueForm({ name: '', city: '', capacity: '' })
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black-border">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-primary" />
            <h3 className="text-base font-bold text-white">Nueva Sesión</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Date + Time row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-white-muted mb-1.5">Fecha</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
            <div className="w-[120px]">
              <label className="block text-sm font-medium text-white-muted mb-1.5">
                <Clock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                Hora
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
          </div>
          {dateExists && (
            <p className="text-xs text-amber-400 -mt-2">Esta fecha ya tiene eventos — se añadirán los venues seleccionados</p>
          )}

          {/* Event type */}
          <div>
            <label className="block text-sm font-medium text-white-muted mb-1.5">Tipo de evento</label>
            <div className="flex gap-2">
              <button
                onClick={() => setEventType('fiesta')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border',
                  eventType === 'fiesta'
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-black-border text-white-muted hover:border-white/20'
                )}
              >
                <PartyPopper className="w-4 h-4" />
                Fiesta
                <span className="text-[10px] opacity-60">(con alcohol)</span>
              </button>
              <button
                onClick={() => setEventType('eso')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all border',
                  eventType === 'eso'
                    ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                    : 'border-black-border text-white-muted hover:border-white/20'
                )}
              >
                <GraduationCap className="w-4 h-4" />
                ESO
                <span className="text-[10px] opacity-60">(sin alcohol)</span>
              </button>
            </div>
          </div>

          {/* Venue selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-white-muted">
                Venues ({selectedVenueIds.size} seleccionados)
              </label>
              {!creatingVenue && organizationId && (
                <button
                  onClick={() => setCreatingVenue(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Crear nuevo
                </button>
              )}
            </div>

            {/* Inline create-venue form */}
            {creatingVenue && (
              <div className="mb-3 p-3 rounded-xl border border-primary/30 bg-primary/[0.04] space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Nuevo venue</span>
                </div>
                <input
                  type="text"
                  value={venueForm.name}
                  onChange={e => setVenueForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nombre del venue *"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={venueForm.city}
                    onChange={e => setVenueForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Ciudad"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={venueForm.capacity}
                    onChange={e => setVenueForm(f => ({ ...f, capacity: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Aforo"
                    className="w-[90px] px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setCreatingVenue(false); setVenueForm({ name: '', city: '', capacity: '' }) }}
                    disabled={savingVenue}
                    className="btn-ghost flex-1 text-xs py-2"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateVenue}
                    disabled={!venueForm.name.trim() || savingVenue}
                    className="btn-primary flex-[1.5] text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {savingVenue ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    {savingVenue ? 'Creando...' : 'Crear y seleccionar'}
                  </button>
                </div>
              </div>
            )}

            {allVenues.length === 0 && !creatingVenue ? (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 text-center">
                <Building2 className="w-6 h-6 text-primary/60 mx-auto mb-2" />
                <p className="text-sm text-white font-medium mb-0.5">No hay venues todavia</p>
                <p className="text-[11px] text-white-muted mb-3">Crea tu primer venue para empezar</p>
                {organizationId && (
                  <button
                    onClick={() => setCreatingVenue(true)}
                    className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" />
                    Crear venue
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1 max-h-[240px] overflow-y-auto">
                {allVenues.map(v => {
                  const isSelected = selectedVenueIds.has(v.id)
                  return (
                    <button
                      key={v.id}
                      onClick={() => toggleVenue(v.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all',
                        isSelected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'border border-transparent hover:bg-white/[0.03]'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all',
                        isSelected ? 'bg-primary/20 border-primary/50' : 'border-black-border'
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-white block truncate">{v.name}</span>
                        {v.city && <span className="text-[11px] text-white-muted">{v.city}</span>}
                      </div>
                      {v.capacity && (
                        <span className="text-[10px] text-white-muted shrink-0">cap. {v.capacity}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
            <button
              onClick={handleSubmit}
              disabled={!date}
              className="btn-primary text-sm disabled:opacity-40"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              {dateExists ? 'Añadir venues' : 'Crear sesión'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
