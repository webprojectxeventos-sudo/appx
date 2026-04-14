'use client'

import { useState } from 'react'
import { Shield, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'

interface BanModalProps {
  open: boolean
  onClose: () => void
  userId: string
  userName: string
  eventIds: string[]
  bannedBy: string
  onBanned: () => void
}

const DURATION_OPTIONS = [
  { value: '1h', label: '1 hora' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 dias' },
  { value: 'permanent', label: 'Permanente' },
]

function getExpiresAt(duration: string): string | null {
  if (duration === 'permanent') return null
  const now = new Date()
  const map: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  return new Date(now.getTime() + (map[duration] || 0)).toISOString()
}

export function BanModal({ open, onClose, userId, userName, eventIds, bannedBy, onBanned }: BanModalProps) {
  const { error: showError, success } = useToast()
  const [duration, setDuration] = useState('24h')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleBan = async () => {
    if (!reason.trim()) {
      showError('La razon es obligatoria')
      return
    }
    setLoading(true)
    try {
      const expiresAt = getExpiresAt(duration)
      // Upsert ban for each event
      for (const eventId of eventIds) {
        const { error } = await supabase
          .from('chat_bans')
          .upsert({
            user_id: userId,
            event_id: eventId,
            banned_by: bannedBy,
            reason: reason.trim(),
            expires_at: expiresAt,
            is_active: true,
            banned_at: new Date().toISOString(),
          }, { onConflict: 'user_id,event_id' })
        if (error) throw error
      }
      success(`${userName} baneado del chat`)
      setReason('')
      setDuration('24h')
      onBanned()
      onClose()
    } catch (err) {
      console.error('Ban error:', err)
      showError('Error al banear usuario')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card p-0 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-red-400" />
            </div>
            <h3 className="font-bold text-white text-sm">Banear del chat</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300/80">
              <span className="font-semibold text-white">{userName}</span> no podra enviar mensajes en el chat durante la duracion del ban.
            </p>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs text-white-muted mb-2 font-medium">Duracion</label>
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={cn(
                    'px-3 py-2.5 rounded-xl text-xs font-medium border transition-all text-center',
                    duration === opt.value
                      ? opt.value === 'permanent'
                        ? 'bg-red-500/15 text-red-400 border-red-500/30'
                        : 'bg-primary/12 text-primary border-primary/30'
                      : 'border-black-border text-white-muted hover:border-white/15'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs text-white-muted mb-2 font-medium">Razon *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Describe el motivo del ban..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-white-muted border border-black-border rounded-xl hover:bg-white/5 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleBan}
              disabled={loading || !reason.trim()}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500/80 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {loading ? 'Baneando...' : 'Confirmar ban'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
