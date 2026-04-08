'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { Music, ThumbsUp, CheckCircle, XCircle, Play, SkipForward, Trash2, ExternalLink } from 'lucide-react'
import type { Database } from '@/lib/types'

type Song = Database['public']['Tables']['playlist_songs']['Row']

interface SongWithDetails extends Song {
  votes: number
  addedByName: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  approved: { label: 'Aprobada', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  rejected: { label: 'Rechazada', color: 'text-red-400', bg: 'bg-red-500/10' },
  playing: { label: 'Sonando', color: 'text-primary', bg: 'bg-primary/10' },
  next: { label: 'Siguiente', color: 'text-blue-400', bg: 'bg-blue-500/10' },
}

interface PlaylistTabProps {
  eventId: string
}

export function PlaylistTab({ eventId }: PlaylistTabProps) {
  const { error: showError, success } = useToast()
  const [songs, setSongs] = useState<SongWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const userCacheRef = useRef<Record<string, string>>({})

  const fetchSongs = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('playlist_songs')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
      if (error) throw error

      const songIds = (data || []).map(s => s.id)
      let votesMap: Record<string, number> = {}
      if (songIds.length > 0) {
        const { data: votesData } = await supabase.from('playlist_votes').select('song_id').in('song_id', songIds)
        votesData?.forEach(v => { votesMap[v.song_id] = (votesMap[v.song_id] || 0) + 1 })
      }

      const userIds = [...new Set((data || []).map(s => s.added_by).filter(id => !userCacheRef.current[id]))]
      if (userIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)
        users?.forEach(u => { userCacheRef.current[u.id] = u.full_name || 'Usuario' })
      }

      const enriched: SongWithDetails[] = (data || []).map(s => ({
        ...s,
        votes: votesMap[s.id] || 0,
        addedByName: userCacheRef.current[s.added_by] || 'Usuario',
      }))
      enriched.sort((a, b) => b.votes - a.votes)
      setSongs(enriched)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { fetchSongs() }, [fetchSongs])

  const updateStatus = async (songId: string, newStatus: Song['status']) => {
    try {
      if (newStatus === 'playing') {
        await supabase.from('playlist_songs').update({ status: 'approved' }).eq('event_id', eventId).eq('status', 'playing')
      }
      if (newStatus === 'next') {
        await supabase.from('playlist_songs').update({ status: 'approved' }).eq('event_id', eventId).eq('status', 'next')
      }
      const { error } = await supabase.from('playlist_songs').update({ status: newStatus }).eq('id', songId)
      if (error) throw error
      success(`Estado: ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      await fetchSongs()
    } catch (err) {
      showError('Error al actualizar')
    }
  }

  const handleDelete = async (songId: string) => {
    try {
      await supabase.from('playlist_votes').delete().eq('song_id', songId)
      const { error } = await supabase.from('playlist_songs').delete().eq('id', songId)
      if (error) throw error
      success('Eliminada')
      setConfirmDelete(null)
      await fetchSongs()
    } catch (err) {
      showError('Error al eliminar')
    }
  }

  if (loading) return <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="space-y-3">
      <span className="text-sm text-white font-medium">{songs.length} canciones</span>

      {songs.length === 0 ? (
        <div className="py-8 text-center">
          <Music className="w-8 h-8 text-white-muted mx-auto mb-2" />
          <p className="text-white-muted text-sm">Sin canciones</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[450px] overflow-y-auto">
          {songs.map(song => {
            const sc = STATUS_CONFIG[song.status] || STATUS_CONFIG.pending
            return (
              <div key={song.id} className={cn('p-3 rounded-xl border border-black-border bg-white/[0.02]', song.status === 'playing' && 'border-primary/30')}>
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex flex-col items-center justify-center shrink-0">
                    <ThumbsUp className="w-2.5 h-2.5 text-white-muted" />
                    <span className="text-[10px] font-bold text-white">{song.votes}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-sm font-medium text-white truncate">{song.title}</p>
                      <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', sc.bg, sc.color)}>{sc.label}</span>
                    </div>
                    <p className="text-[11px] text-white-muted">{song.artist}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white-muted">
                      <span>por {song.addedByName}</span>
                      {song.spotify_url && (
                        <a href={song.spotify_url} target="_blank" rel="noopener noreferrer" className="text-emerald-400 flex items-center gap-0.5">
                          <ExternalLink className="w-2.5 h-2.5" /> Spotify
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {song.status === 'pending' && (
                        <>
                          <button onClick={() => updateStatus(song.id, 'approved')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" /> Aprobar</button>
                          <button onClick={() => updateStatus(song.id, 'rejected')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 flex items-center gap-0.5"><XCircle className="w-2.5 h-2.5" /> Rechazar</button>
                        </>
                      )}
                      {(song.status === 'approved' || song.status === 'next') && (
                        <button onClick={() => updateStatus(song.id, 'playing')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-primary/10 text-primary flex items-center gap-0.5"><Play className="w-2.5 h-2.5" /> Sonando</button>
                      )}
                      {song.status === 'approved' && (
                        <button onClick={() => updateStatus(song.id, 'next')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 flex items-center gap-0.5"><SkipForward className="w-2.5 h-2.5" /> Siguiente</button>
                      )}
                      {song.status === 'rejected' && (
                        <button onClick={() => updateStatus(song.id, 'approved')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" /> Aprobar</button>
                      )}
                      {song.status === 'playing' && (
                        <button onClick={() => updateStatus(song.id, 'approved')} className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-white/5 text-white-muted">Parar</button>
                      )}
                      {confirmDelete === song.id ? (
                        <div className="flex gap-1 ml-auto">
                          <button onClick={() => handleDelete(song.id)} className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400">Si</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 text-white-muted">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(song.id)} className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 text-red-400 ml-auto"><Trash2 className="w-2.5 h-2.5" /></button>
                      )}
                    </div>
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
