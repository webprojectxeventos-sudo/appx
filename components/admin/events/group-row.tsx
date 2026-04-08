'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Trash2, ArrowRightLeft, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

interface GroupRowProps {
  event: Event
  otherVenues: Venue[]
  onRefresh: () => void
}

export function GroupRow({ event, otherVenues, onRefresh }: GroupRowProps) {
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

  // Close move dropdown on outside click
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
    onRefresh()
  }

  const handleDelete = async () => {
    if (!confirm(`Eliminar "${event.title}"?`)) return
    setLoading(true)
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    setLoading(false)
    if (error) { showError('Error al eliminar'); return }
    success('Grupo eliminado')
    onRefresh()
  }

  const handleMove = async (targetVenueId: string) => {
    setShowMove(false)
    setLoading(true)
    const { error } = await supabase.from('events').update({ venue_id: targetVenueId }).eq('id', event.id)
    setLoading(false)
    if (error) { showError('Error al mover'); return }
    success('Grupo movido')
    onRefresh()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { setEditing(false); setEditName(event.title) }
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-white/[0.03] group transition-colors">
      {/* Name */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              className="w-full bg-transparent text-white text-sm border-b border-primary/40 outline-none py-0.5"
              disabled={loading}
            />
            <button onClick={handleSave} className="text-emerald-400 hover:text-emerald-300 shrink-0">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setEditing(false); setEditName(event.title) }} className="text-white-muted hover:text-white shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-sm text-white truncate block">{event.title}</span>
        )}
      </div>

      {/* Event code badge */}
      <span className="text-[10px] font-mono text-white-muted bg-white/5 px-1.5 py-0.5 rounded shrink-0">
        {event.event_code}
      </span>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => { setEditing(true); setEditName(event.title) }}
          className="p-1 rounded text-white-muted hover:text-white hover:bg-white/5 transition-colors"
          title="Renombrar"
        >
          <Pencil className="w-3 h-3" />
        </button>

        {/* Move dropdown */}
        {otherVenues.length > 0 && (
          <div className="relative" ref={moveRef}>
            <button
              onClick={() => setShowMove(!showMove)}
              className="p-1 rounded text-white-muted hover:text-white hover:bg-white/5 transition-colors"
              title="Mover a otro venue"
            >
              <ArrowRightLeft className="w-3 h-3" />
            </button>
            {showMove && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[180px] py-1 rounded-xl border border-black-border bg-black-card shadow-xl">
                <p className="px-3 py-1.5 text-[10px] text-white-muted uppercase tracking-wider">Mover a...</p>
                {otherVenues.map(v => (
                  <button
                    key={v.id}
                    onClick={() => handleMove(v.id)}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors"
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
          className="p-1 rounded text-white-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Eliminar"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
