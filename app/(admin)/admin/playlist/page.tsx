'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { FilterBar } from '@/components/admin/filter-bar'
import { Pagination } from '@/components/admin/pagination'
import { cn } from '@/lib/utils'
import {
  Music,
  ThumbsUp,
  CheckCircle,
  XCircle,
  Play,
  SkipForward,
  Trash2,
  ExternalLink,
  BarChart3,
  User,
} from 'lucide-react'
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

const FILTER_OPTIONS = [
  { key: 'all', label: 'Todas' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'rejected', label: 'Rechazadas' },
  { key: 'playing', label: 'Sonando' },
  { key: 'next', label: 'Siguiente' },
]

const PAGE_SIZE = 20

export default function PlaylistPage() {
  const { isAdmin, initialized } = useAuth()
  const { selectedEventId, events } = useAdminSelection()
  const { error: showError, success } = useToast()

  const [songs, setSongs] = useState<SongWithDetails[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [stats, setStats] = useState({ total: 0, totalVotes: 0, topSuggestor: '' })

  const userCacheRef = useRef<Record<string, string>>({})
  const selectedEvent = events.find(e => e.id === selectedEventId)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const fetchSongs = useCallback(async () => {
    if (!selectedEventId) { setSongs([]); setTotalCount(0); setLoading(false); return }
    setLoading(true)

    try {
      // Fetch songs
      let query = supabase
        .from('playlist_songs')
        .select('*', { count: 'exact' })
        .eq('event_id', selectedEventId)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as Song['status'])
      }

      if (search.trim()) {
        query = query.or(`title.ilike.%${search.trim()}%,artist.ilike.%${search.trim()}%`)
      }

      const from = (page - 1) * PAGE_SIZE
      query = query.range(from, from + PAGE_SIZE - 1)

      const { data, count, error } = await query
      if (error) throw error

      // Fetch votes for these songs
      const songIds = (data || []).map(s => s.id)
      let votesMap: Record<string, number> = {}
      if (songIds.length > 0) {
        const { data: votesData } = await supabase
          .from('playlist_votes')
          .select('song_id')
          .in('song_id', songIds)

        votesData?.forEach(v => {
          votesMap[v.song_id] = (votesMap[v.song_id] || 0) + 1
        })
      }

      // Resolve user names
      const userIds = [...new Set((data || []).map(s => s.added_by).filter(id => !userCacheRef.current[id]))]
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, full_name')
          .in('id', userIds)
        users?.forEach(u => { userCacheRef.current[u.id] = u.full_name || 'Usuario' })
      }

      const enriched: SongWithDetails[] = (data || []).map(s => ({
        ...s,
        votes: votesMap[s.id] || 0,
        addedByName: userCacheRef.current[s.added_by] || 'Usuario',
      }))

      // Sort by votes desc for display
      enriched.sort((a, b) => b.votes - a.votes)

      setSongs(enriched)
      setTotalCount(count || 0)

      // Stats
      if (page === 1 && !search && statusFilter === 'all') {
        const { count: allCount } = await supabase
          .from('playlist_songs')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', selectedEventId)

        const { data: allVotes } = await supabase
          .from('playlist_votes')
          .select('song_id')
          .in('song_id', (data || []).map(s => s.id))

        // Top suggestor
        const suggestorCount: Record<string, number> = {}
        ;(data || []).forEach(s => {
          suggestorCount[s.added_by] = (suggestorCount[s.added_by] || 0) + 1
        })
        const topId = Object.entries(suggestorCount).sort((a, b) => b[1] - a[1])[0]?.[0]

        setStats({
          total: allCount || 0,
          totalVotes: allVotes?.length || 0,
          topSuggestor: topId ? (userCacheRef.current[topId] || 'Usuario') : '-',
        })
      }
    } catch (err) {
      console.error('Error fetching songs:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedEventId, statusFilter, search, page])

  useEffect(() => { fetchSongs() }, [fetchSongs])
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const updateStatus = async (songId: string, newStatus: Song['status']) => {
    try {
      // If setting to "playing", reset any current playing song first
      if (newStatus === 'playing') {
        await supabase
          .from('playlist_songs')
          .update({ status: 'approved' })
          .eq('event_id', selectedEventId!)
          .eq('status', 'playing')
      }
      // If setting to "next", reset any current next song first
      if (newStatus === 'next') {
        await supabase
          .from('playlist_songs')
          .update({ status: 'approved' })
          .eq('event_id', selectedEventId!)
          .eq('status', 'next')
      }

      const { error } = await supabase
        .from('playlist_songs')
        .update({ status: newStatus })
        .eq('id', songId)
      if (error) throw error

      success(`Estado actualizado: ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
      await fetchSongs()
    } catch (err) {
      console.error('Error updating status:', err)
      showError('Error al actualizar')
    }
  }

  const handleDelete = async (songId: string) => {
    try {
      // Delete votes first
      await supabase.from('playlist_votes').delete().eq('song_id', songId)
      const { error } = await supabase.from('playlist_songs').delete().eq('id', songId)
      if (error) throw error
      success('Cancion eliminada')
      setConfirmDelete(null)
      await fetchSongs()
    } catch (err) {
      console.error('Error deleting:', err)
      showError('Error al eliminar')
    }
  }

  // Build filter options with counts
  const filterOptions = FILTER_OPTIONS.map(f => ({
    ...f,
    count: f.key === 'all' ? totalCount : undefined,
  }))

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Music className="w-6 h-6 text-primary" />
          Playlist
        </h1>
        <p className="text-sm text-white-muted mt-0.5">
          {selectedEvent ? (selectedEvent.group_name || selectedEvent.title) : 'Selecciona un instituto'}
        </p>
      </div>

      {!selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior.</p>
        </div>
      )}

      {selectedEventId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <Music className="w-5 h-5 mx-auto mb-1.5 text-primary" />
              <div className="text-xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-white-muted">Sugerencias</div>
            </div>
            <div className="card p-4 text-center">
              <ThumbsUp className="w-5 h-5 mx-auto mb-1.5 text-emerald-400" />
              <div className="text-xl font-bold text-white">{stats.totalVotes}</div>
              <div className="text-xs text-white-muted">Votos totales</div>
            </div>
            <div className="card p-4 text-center">
              <User className="w-5 h-5 mx-auto mb-1.5 text-amber-400" />
              <div className="text-sm font-bold text-white truncate">{stats.topSuggestor}</div>
              <div className="text-xs text-white-muted">Top suggestor</div>
            </div>
          </div>

          {/* Search + Filters */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por titulo o artista..."
          />
          <FilterBar
            filters={filterOptions}
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />

          {/* Songs list */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map(i => <div key={i} className="card h-16 animate-pulse" />)}
            </div>
          ) : songs.length === 0 ? (
            <div className="card p-8 text-center">
              <Music className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay canciones</p>
            </div>
          ) : (
            <div className="space-y-2">
              {songs.map(song => {
                const statusConf = STATUS_CONFIG[song.status] || STATUS_CONFIG.pending

                return (
                  <div
                    key={song.id}
                    className={cn(
                      'card p-4',
                      song.status === 'playing' && 'border-primary/30 bg-primary/[0.03]',
                      song.status === 'next' && 'border-blue-400/20 bg-blue-500/[0.02]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Votes */}
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex flex-col items-center justify-center flex-shrink-0">
                        <ThumbsUp className="w-3 h-3 text-white-muted mb-0.5" />
                        <span className="text-xs font-bold text-white">{song.votes}</span>
                      </div>

                      {/* Song info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-white truncate">{song.title}</p>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', statusConf.bg, statusConf.color)}>
                            {statusConf.label}
                          </span>
                        </div>
                        <p className="text-xs text-white-muted">{song.artist}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-white-muted">
                          <span>por {song.addedByName}</span>
                          {song.spotify_url && (
                            <a
                              href={song.spotify_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5"
                            >
                              <ExternalLink className="w-3 h-3" /> Spotify
                            </a>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {song.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateStatus(song.id, 'approved')}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 transition-colors flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Aprobar
                              </button>
                              <button
                                onClick={() => updateStatus(song.id, 'rejected')}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-1"
                              >
                                <XCircle className="w-3 h-3" /> Rechazar
                              </button>
                            </>
                          )}

                          {(song.status === 'approved' || song.status === 'next') && (
                            <button
                              onClick={() => updateStatus(song.id, 'playing')}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors flex items-center gap-1"
                            >
                              <Play className="w-3 h-3" /> Sonando
                            </button>
                          )}

                          {song.status === 'approved' && (
                            <button
                              onClick={() => updateStatus(song.id, 'next')}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/15 transition-colors flex items-center gap-1"
                            >
                              <SkipForward className="w-3 h-3" /> Siguiente
                            </button>
                          )}

                          {song.status === 'rejected' && (
                            <button
                              onClick={() => updateStatus(song.id, 'approved')}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15 transition-colors flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Aprobar
                            </button>
                          )}

                          {song.status === 'playing' && (
                            <button
                              onClick={() => updateStatus(song.id, 'approved')}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-white-muted hover:bg-white/10 transition-colors"
                            >
                              Dejar de sonar
                            </button>
                          )}

                          {confirmDelete === song.id ? (
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => handleDelete(song.id)}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-white-muted"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(song.id)}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1 ml-auto"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
