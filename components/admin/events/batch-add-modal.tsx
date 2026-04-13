'use client'

import { useState } from 'react'
import { X, Upload, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

function generateEventCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

interface BatchAddModalProps {
  open: boolean
  onClose: () => void
  venueId: string
  venueName: string
  date: string
  eventType: 'eso' | 'fiesta'
  organizationId: string
  userId: string
  onCreated: () => void
}

export function BatchAddModal({
  open, onClose, venueId, venueName, date, eventType: defaultType, organizationId, userId, onCreated,
}: BatchAddModalProps) {
  const { error: showError, success } = useToast()
  const [text, setText] = useState('')
  const [eventType, setEventType] = useState<'eso' | 'fiesta'>(defaultType)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<number | null>(null)

  const names = text.split('\n').map(l => l.trim()).filter(Boolean)

  const handleSubmit = async () => {
    if (names.length === 0) return
    setLoading(true)
    const rows = names.map(name => ({
      title: name,
      group_name: name,
      date: date.includes('T') ? date : date + 'T22:00:00',
      venue_id: venueId,
      event_type: eventType,
      event_code: generateEventCode(),
      organization_id: organizationId,
      created_by: userId,
    }))

    const { error } = await supabase.from('events').insert(rows)
    setLoading(false)

    if (error) {
      showError('Error al crear grupos')
      return
    }

    setResult(names.length)
    success(`${names.length} grupos creados`)
    onCreated()

    setTimeout(() => {
      setText('')
      setResult(null)
      onClose()
    }, 1200)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black-border">
          <div>
            <h3 className="text-base font-bold text-white">Añadir en lote</h3>
            <p className="text-xs text-white-muted mt-0.5">{venueName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {result !== null ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-white font-medium">{result} grupos creados</p>
            </div>
          ) : (
            <>
              {/* Textarea */}
              <div>
                <label className="block text-sm font-medium text-white-muted mb-1.5">Nombres de grupo (uno por línea)</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"IES Cervantes\nIES Brianda de Mendoza\nIES Complutense"}
                  rows={8}
                  className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors resize-none"
                  disabled={loading}
                  autoFocus
                />
                {names.length > 0 && (
                  <p className="text-xs text-white-muted mt-1.5">
                    Se crearán <span className="text-white font-medium">{names.length}</span> grupos
                  </p>
                )}
              </div>

              {/* Event type selector */}
              <div className="grid grid-cols-2 gap-2">
                {(['fiesta', 'eso'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEventType(type)}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs font-medium border transition-all',
                      eventType === type
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-black-border text-white-muted hover:border-white/15'
                    )}
                  >
                    {type === 'fiesta' ? 'Fiesta (con alcohol)' : '4.ºESO (sin alcohol)'}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={onClose} className="btn-ghost text-sm">Cancelar</button>
                <button
                  onClick={handleSubmit}
                  disabled={names.length === 0 || loading}
                  className="btn-primary text-sm disabled:opacity-40"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {loading ? 'Creando...' : `Crear ${names.length || ''} grupos`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
