'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Music2, Heart, Plus, Trash2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Song {
  id: string
  title: string
  artist: string
  spotify_url: string | null
  added_by: string
  added_by_name: string
  votes: number
  user_voted: boolean
}

export default function PlaylistPage() {
  const { user, event, profile } = useAuth()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newArtist, setNewArtist] = useState('')
  const [newSpotify, setNewSpotify] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchSongs = useCallback(async () => {
    if (!event?.id || !user?.id) return

    const { data: songsData } = await supabase
      .from('playlist_songs')
      .select('id, title, artist, spotify_url, added_by')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })

    if (!songsData) { setLoading(false); return }

    const userIds = [...new Set(songsData.map((s) => s.added_by))]
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)
    const nameMap: Record<string, string> = {}
    users?.forEach((u) => (nameMap[u.id] = u.full_name || 'Anonimo'))

    const { data: allVotes } = await supabase
      .from('playlist_votes')
      .select('song_id, user_id')
      .in('song_id', songsData.map((s) => s.id))

    const voteCounts: Record<string, number> = {}
    const userVotes = new Set<string>()
    allVotes?.forEach((v) => {
      voteCounts[v.song_id] = (voteCounts[v.song_id] || 0) + 1
      if (v.user_id === user.id) userVotes.add(v.song_id)
    })

    const enriched: Song[] = songsData.map((s) => ({
      ...s,
      added_by_name: nameMap[s.added_by] || 'Anonimo',
      votes: voteCounts[s.id] || 0,
      user_voted: userVotes.has(s.id),
    }))

    // Sort by votes descending
    enriched.sort((a, b) => b.votes - a.votes)
    setSongs(enriched)
    setLoading(false)
  }, [event?.id, user?.id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      await fetchSongs()
    }
    load()
    return () => { cancelled = true }
  }, [fetchSongs])

  // Realtime
  useEffect(() => {
    if (!event?.id) return
    const channel = supabase
      .channel(`playlist-realtime-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_songs', filter: `event_id=eq.${event.id}` }, () => fetchSongs())
      // playlist_votes no tiene event_id — filtro server-side imposible.
      // Se filtra client-side: fetchSongs() filtra songs por event.id y luego votes por song_id
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_votes' }, () => fetchSongs())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, fetchSongs])

  const handleVote = async (songId: string, hasVoted: boolean) => {
    if (!user?.id) return
    if (hasVoted) {
      await supabase.from('playlist_votes').delete().eq('song_id', songId).eq('user_id', user.id)
    } else {
      await supabase.from('playlist_votes').insert({ song_id: songId, user_id: user.id })
    }
    fetchSongs()
  }

  const handleAdd = async () => {
    if (!newTitle || !newArtist || !user?.id || !event?.id) return
    setAdding(true)
    await supabase.from('playlist_songs').insert({
      event_id: event.id,
      title: newTitle,
      artist: newArtist,
      spotify_url: newSpotify || null,
      added_by: user.id,
    })
    setNewTitle('')
    setNewArtist('')
    setNewSpotify('')
    setShowAdd(false)
    setAdding(false)
    fetchSongs()
  }

  const handleDelete = async (songId: string) => {
    await supabase.from('playlist_songs').delete().eq('id', songId)
    fetchSongs()
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-fade-in">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card p-4 h-20 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-white">Playlist</h1>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary px-3 py-1.5 text-xs">
          <Plus className="w-3.5 h-3.5" />
          Sugerir
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="card p-4 space-y-3 border-primary/20">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nombre de la cancion"
            className="w-full px-4 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
          <input
            type="text"
            value={newArtist}
            onChange={(e) => setNewArtist(e.target.value)}
            placeholder="Artista"
            className="w-full px-4 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
          <input
            type="url"
            value={newSpotify}
            onChange={(e) => setNewSpotify(e.target.value)}
            placeholder="Link de Spotify (opcional)"
            className="w-full px-4 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
          <button onClick={handleAdd} disabled={!newTitle || !newArtist || adding} className="btn-primary w-full py-2.5 text-sm">
            {adding ? 'Anadiendo...' : 'Anadir cancion'}
          </button>
        </div>
      )}

      {/* Song List */}
      {songs.length === 0 ? (
        <div className="text-center py-12">
          <Music2 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">No hay canciones aun</p>
          <p className="text-white-muted text-sm mt-1">Se el primero en sugerir una!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {songs.map((song, i) => (
            <div key={song.id} className="card p-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-white-muted">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{song.title}</p>
                <p className="text-[11px] text-white-muted truncate">{song.artist} &middot; {song.added_by_name}</p>
              </div>
              {song.spotify_url && (
                <a href={song.spotify_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                onClick={() => handleVote(song.id, song.user_voted)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95',
                  song.user_voted
                    ? 'bg-primary/15 text-primary'
                    : 'bg-white/5 text-white-muted hover:text-white'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', song.user_voted && 'fill-primary')} />
                {song.votes}
              </button>
              {(song.added_by === user?.id || profile?.role === 'admin') && (
                <button onClick={() => handleDelete(song.id)} className="p-1.5 text-white-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
