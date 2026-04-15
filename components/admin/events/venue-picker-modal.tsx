'use client'

// Venue picker + inline creator.
//
// Replaces the absolute-positioned dropdown that got clipped inside the
// events board's md:overflow-x-auto flex row (setting one overflow axis
// forces the other to `auto`, which hides the dropdown). This is a real
// modal that escapes stacking contexts via a portal and works identically
// on mobile and desktop.
//
// Two jobs, one screen:
//   1. Pick an existing venue from the org's catalog
//   2. Create a brand-new venue inline without leaving the events page
//
// The form is collapsed behind a "Crear nuevo venue" card so the pick
// path stays one-tap. Creation auto-selects the new venue as the result.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Search, MapPin, Users, Check, Loader2, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Venue = Database['public']['Tables']['venues']['Row']

interface VenuePickerModalProps {
  open: boolean
  onClose: () => void
  availableVenues: Venue[] // venues that CAN be added (not already on date)
  organizationId: string
  /** Called when the user picks (existing or newly-created) a venue. */
  onPick: (venueId: string) => void
  /** Called after a successful venue insert so the parent can refresh its list. */
  onVenueCreated?: (venue: Venue) => void
}

export function VenuePickerModal({
  open,
  onClose,
  availableVenues,
  organizationId,
  onPick,
  onVenueCreated,
}: VenuePickerModalProps) {
  const { error: showError, success } = useToast()
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  // New venue form
  const [form, setForm] = useState({ name: '', city: '', capacity: '', image_url: '' })

  useEffect(() => { setMounted(true) }, [])

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearch('')
      setCreating(false)
      setSaving(false)
      setForm({ name: '', city: '', capacity: '', image_url: '' })
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Prevent body scroll while open
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open || !mounted) return null

  const filtered = search.trim()
    ? availableVenues.filter(v =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        (v.city || '').toLowerCase().includes(search.toLowerCase())
      )
    : availableVenues

  const handleCreate = async () => {
    if (!form.name.trim() || !organizationId) return
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      city: form.city.trim() || null,
      capacity: form.capacity ? parseInt(form.capacity) : null,
      image_url: form.image_url.trim() || null,
      organization_id: organizationId,
    }
    const { data, error } = await supabase
      .from('venues')
      .insert(payload)
      .select()
      .single()
    setSaving(false)

    if (error || !data) {
      showError(error?.message || 'No se pudo crear el venue')
      return
    }
    success(`Venue "${data.name}" creado`)
    onVenueCreated?.(data as Venue)
    onPick(data.id)
    onClose()
  }

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet — bottom-docked on mobile (easier to reach), centered on desktop */}
      <div
        className={cn(
          'fixed z-[110] bg-background border border-black-border shadow-2xl flex flex-col',
          // Mobile: bottom sheet, nearly full-height, rounded top corners
          'inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl animate-drawer-up',
          // Desktop: centered modal
          'md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:max-h-[85vh] md:rounded-2xl md:animate-scale-in'
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle — purely visual, signals "sheet" affordance */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {creating ? 'Nuevo venue' : 'Añadir venue'}
              </h2>
              <p className="text-[11px] text-white-muted">
                {creating ? 'Crea un local para tu organizacion' : 'Selecciona o crea uno nuevo'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!creating ? (
            <>
              {/* Search bar */}
              {availableVenues.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar venue..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>
              )}

              {/* Venue list */}
              {availableVenues.length === 0 ? (
                <div className="text-center py-6 px-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-7 h-7 text-white-muted" />
                  </div>
                  <p className="text-sm text-white font-medium mb-1">No hay venues disponibles</p>
                  <p className="text-xs text-white-muted">
                    Todos tus venues ya estan en esta fecha o aun no has creado ninguno.
                  </p>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-white-muted py-6">Sin resultados para &quot;{search}&quot;</p>
              ) : (
                <div className="space-y-2">
                  {filtered.map(v => (
                    <button
                      key={v.id}
                      onClick={() => { onPick(v.id); onClose() }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-black-border bg-white/[0.02] hover:border-primary/30 hover:bg-primary/5 active:scale-[0.99] transition-all group"
                    >
                      {/* Venue thumbnail */}
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                        {v.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
                        ) : (
                          <Building2 className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-semibold text-white truncate">{v.name}</p>
                        <div className="flex items-center gap-2.5 mt-0.5">
                          {v.city && (
                            <span className="text-[11px] text-white-muted flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              <span className="truncate">{v.city}</span>
                            </span>
                          )}
                          {v.capacity && (
                            <span className="text-[11px] text-white-muted flex items-center gap-1 shrink-0">
                              <Users className="w-3 h-3" />
                              {v.capacity}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-white/[0.03] group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                        <Plus className="w-4 h-4 text-white-muted group-hover:text-primary transition-colors" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Create new venue CTA */}
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/50 transition-all active:scale-[0.99] group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-white">Crear nuevo venue</p>
                  <p className="text-[11px] text-white-muted mt-0.5">
                    Añade un local que todavia no esta en tu organizacion
                  </p>
                </div>
              </button>
            </>
          ) : (
            <>
              {/* Inline create form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-white-muted mb-1.5">
                    Nombre <span className="text-primary">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ej: Pacha Madrid"
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-white-muted mb-1.5">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                    placeholder="Ej: Madrid"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-white-muted mb-1.5">
                    Aforo
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value.replace(/\D/g, '') }))}
                    placeholder="Ej: 500"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-white-muted mb-1.5">
                    Imagen (URL)
                  </label>
                  <input
                    type="url"
                    value={form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="https://..."
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {creating && (
          <div className="flex gap-2 p-4 border-t border-black-border shrink-0">
            <button
              onClick={() => setCreating(false)}
              disabled={saving}
              className="btn-ghost flex-1 text-sm py-3 disabled:opacity-40"
            >
              Volver
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              className="btn-primary flex-[1.5] text-sm py-3 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Crear venue
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  )

  return createPortal(content, document.body)
}
