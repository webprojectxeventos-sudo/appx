'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Trash2, ArrowRightLeft, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

type EventMutator = (prev: Event[]) => Event[]

interface GroupRowProps {
  event: Event
  otherVenues: Venue[]
  onRefresh: () => void
  onMutate?: (mutator: EventMutator) => void
  onSelect?: (event: Event) => void
}

export function GroupRow({ event, otherVenues, onRefresh, onMutate, onSelect }: GroupRowProps) {
  const { error: showError, success } = useToast()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(event.title)
  const [showMove, setShowMove] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const moveRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!showMove) return
    const handler = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setShowMove(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMove])

  const handleSave = async () => {
    const name = editName.trim()
    if (!name || name === event.title) { setEditing(false); return }
    setLoading(true)
    const { error } = await supabase.from('events').update({ title: name, group_name: name }).eq('id', event.id)
    setLoading(false)
    if (error) { showError('Error al renombrar'); return }
    setEditing(false)
    if (onMutate) {
      onMutate(prev => prev.map(e => e.id === event.id ? { ...e, title: name, group_name: name } : e))
    } else {
      onRefresh()
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Eliminar "${event.title}" y todos sus datos?`)) return
    // Optimistic: remove from UI immediately
    if (onMutate) onMutate(prev => prev.filter(e => e.id !== event.id))
    try {
      const res = await authFetch('/api/admin/delete-event', { eventId: event.id })
      const data = await res.json()
      if (!res.ok) {
        showError(data.error || 'Error al eliminar')
        // Rollback: re-add event on failure
        if (onMutate) onMutate(prev => [...prev, event].sort((a, b) => a.title.localeCompare(b.title)))
        return
      }
      success('Grupo eliminado')
    } catch {
      showError('Error de conexion al eliminar')
      if (onMutate) onMutate(prev => [...prev, event].sort((a, b) => a.title.localeCompare(b.title)))
    }
  }

  const handleMove = async (targetVenueId: string) => {
    setShowMove(false)
    setLoading(true)
    const { error } = await supabase.from('events').update({ venue_id: targetVenueId }).eq('id', event.id)
    setLoading(false)
    if (error) { showError('Error al mover'); return }
    success('Grupo movido')
    if (onMutate) {
      onMutate(prev => prev.map(e => e.id === event.id ? { ...e, venue_id: targetVenueId } : e))
    } else {
      onRefresh()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditing(false); setEditName(event.title) }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-white/[0.03] group transition-colors">
      {/* Name */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full bg-transparent text-white text-sm border-b border-primary/40 outline-none py-1"
              disabled={loading}
            />
            <button onClick={handleSave} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 shrink-0">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setEditing(false); setEditName(event.title) }} className="p-1.5 rounded-lg text-white-muted hover:bg-white/5 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onSelect?.(event)}
            className="text-sm font-medium text-white truncate block text-left hover:text-primary transition-colors cursor-pointer"
          >
            {event.title}
          </button>
        )}
      </div>

      {/* Event code badge */}
      <span className="text-[11px] font-mono text-white-muted bg-white/5 px-2 py-1 rounded-lg shrink-0 tracking-wide">
        {event.event_code}
      </span>

      {/* Actions — visible on hover (desktop), always on mobile */}
      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => { setEditing(true); setEditName(event.title) }}
          className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
          title="Renombrar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {otherVenues.length > 0 && (
          <div className="relative" ref={moveRef}>
            <button
              onClick={() => setShowMove(!showMove)}
              className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
              title="Mover a otro venue"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
            {showMove && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] py-1.5 rounded-xl border border-black-border bg-black-card shadow-2xl">
                <p className="px-4 py-1.5 text-[10px] text-white-muted uppercase tracking-wider font-medium">Mover a...</p>
                {otherVenues.map(v => (
                  <button
                    key={v.id}
                    onClick={() => handleMove(v.id)}
                    className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/5 active:bg-white/10 transition-colors"
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleDelete}
          className="p-1.5 rounded-lg text-white-muted hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
