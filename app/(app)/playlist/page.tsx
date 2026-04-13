'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Music2, Heart, Plus, Trash2, ExternalLink, X, Trophy, TrendingUp, Disc3 } from 'lucide-react'
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

const RANK_STYLES = [
  { bg: 'from-yellow-500/20 to-amber-600/10', border: 'border-yellow-500/30', shadow: 'shadow-[0_0_24px_rgba(234,179,8,0.12)]', badge: 'bg-gradient-to-br from-yellow-400 to-amber-500', text: 'text-yellow-400', label: '1' },
  { bg: 'from-gray-300/15 to-gray-400/5', border: 'border-gray-400/25', shadow: 'shadow-[0_0_20px_rgba(156,163,175,0.08)]', badge: 'bg-gradient-to-br from-gray-300 to-gray-400', text: 'text-gray-300', label: '2' },
  { bg: 'from-orange-600/15 to-amber-700/5', border: 'border-orange-600/25', shadow: 'shadow-[0_0_20px_rgba(194,120,62,0.08)]', badge: 'bg-gradient-to-br from-orange-400 to-amber-600', text: 'text-orange-400', label: '3' },
]

export default function PlaylistPage() {
  const { user, event, profile } = useAuth()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newArtist, setNewArtist] = useState('')
  const [newSpotify, setNewSpotify] = useState('')
  const [adding, setAdding] = useState(false)
  const [votingId, setVotingId] = useState<string | null>(null)

  const eventId = event?.id
  const userId = user?.id

  const fetchSongs = useCallback(async () => {
    if (!eventId || !userId) return

    const { data: songsData } = await supabase
      .from('playlist_songs')
      .select('id, title, artist, spotify_url, added_by')
      .eq('event_id', eventId)
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
    const userVoted = new Set<string>()
    allVotes?.forEach((v) => {
      voteCounts[v.song_id] = (voteCounts[v.song_id] || 0) + 1
      if (v.user_id === userId) userVoted.add(v.song_id)
    })

    const enriched: Song[] = songsData.map((s) => ({
      ...s,
      added_by_name: nameMap[s.added_by] || 'Anonimo',
      votes: voteCounts[s.id] || 0,
      user_voted: userVoted.has(s.id),
    }))

    enriched.sort((a, b) => b.votes - a.votes)
    setSongs(enriched)
    setLoading(false)
  }, [eventId, userId])

  useEffect(() => {
    fetchSongs()
  }, [fetchSongs])

  // Realtime
  useEffect(() => {
    if (!event?.id) return
    const channel = supabase
      .channel(`playlist-realtime-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_songs', filter: `event_id=eq.${event.id}` }, () => fetchSongs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playlist_votes' }, () => fetchSongs())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, fetchSongs])

  const handleVote = async (songId: string, hasVoted: boolean) => {
    if (!user?.id || votingId) return
    setVotingId(songId)

    // Optimistic update
    setSongs(prev => prev.map(s =>
      s.id === songId
        ? { ...s, user_voted: !hasVoted, votes: s.votes + (hasVoted ? -1 : 1) }
        : s
    ))

    if (hasVoted) {
      await supabase.from('playlist_votes').delete().eq('song_id', songId).eq('user_id', user.id)
    } else {
      await supabase.from('playlist_votes').insert({ song_id: songId, user_id: user.id })
    }
    setVotingId(null)
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
    setSongs(prev => prev.filter(s => s.id !== songId))
    await supabase.from('playlist_songs').delete().eq('id', songId)
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-fade-in">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-white/5 rounded-full w-2/3" />
                <div className="h-2.5 bg-white/5 rounded-full w-1/3" />
              </div>
              <div className="w-16 h-8 bg-white/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const topSongs = songs.slice(0, 3)
  const restSongs = songs.slice(3)

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Playlist</h1>
            <p className="text-[11px] text-white-muted">
              {songs.length > 0 ? `${songs.length} canciones` : 'Sugiere canciones para el evento'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95',
            showAdd
              ? 'bg-white/5 text-white-muted border border-white/10'
              : 'btn-primary shadow-[0_0_16px_rgba(228,30,43,0.25)]'
          )}
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cerrar' : 'Sugerir'}
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="card-glow p-5 space-y-3.5 animate-scale-in">
          <div className="flex items-center gap-2 mb-1">
            <Music2 className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-white">Nueva sugerencia</p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Nombre de la cancion"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
              />
            </div>
            <div className="relative">
              <input
                type="text"
                value={newArtist}
                onChange={(e) => setNewArtist(e.target.value)}
                placeholder="Artista"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
              />
            </div>
            <div className="relative">
              <input
                type="url"
                value={newSpotify}
                onChange={(e) => setNewSpotify(e.target.value)}
                placeholder="Link de Spotify (opcional)"
                className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
              />
              {newSpotify && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-400" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={!newTitle || !newArtist || adding}
            className="btn-primary w-full py-3 text-sm font-semibold shadow-[0_0_20px_rgba(228,30,43,0.2)] disabled:shadow-none"
          >
            {adding ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Anadiendo...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Anadir cancion
              </span>
            )}
          </button>
        </div>
      )}

      {/* Empty State */}
      {songs.length === 0 ? (
        <div className="card-glow p-8 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center mx-auto mb-4">
            <Disc3 className="w-8 h-8 text-primary/60 animate-[spin_8s_linear_infinite]" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">No hay canciones aun</h3>
          <p className="text-sm text-white-muted mb-5 max-w-[240px] mx-auto">
            Se el primero en sugerir una cancion para el evento
          </p>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="btn-primary px-6 py-2.5 text-sm font-semibold shadow-[0_0_20px_rgba(228,30,43,0.2)]"
            >
              <Plus className="w-4 h-4 mr-1.5 inline" />
              Sugerir cancion
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {topSongs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 mb-1">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <p className="text-xs font-semibold text-white-muted uppercase tracking-wider">Top canciones</p>
              </div>
              {topSongs.map((song, i) => {
                const rank = RANK_STYLES[i]
                return (
                  <div
                    key={song.id}
                    className={cn(
                      'relative rounded-2xl border p-4 transition-all',
                      `bg-gradient-to-r ${rank.bg} ${rank.border} ${rank.shadow}`,
                      'animate-slide-up'
                    )}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Rank badge */}
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                        rank.badge,
                        'shadow-lg'
                      )}>
                        <span className="text-sm font-black text-black">{rank.label}</span>
                      </div>

                      {/* Song info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{song.title}</p>
                        <p className="text-[11px] text-white-muted truncate mt-0.5">{song.artist} &middot; {song.added_by_name}</p>
                      </div>

                      {/* Spotify link */}
                      {song.spotify_url && (
                        <a
                          href={song.spotify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-green-400 hover:bg-green-500/10 rounded-xl transition-colors flex-shrink-0"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        </a>
                      )}

                      {/* Vote button */}
                      <button
                        onClick={() => handleVote(song.id, song.user_voted)}
                        disabled={votingId === song.id}
                        className={cn(
                          'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex-shrink-0',
                          song.user_voted
                            ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_12px_rgba(228,30,43,0.15)]'
                            : 'bg-white/[0.06] text-white-muted border border-white/[0.08] hover:border-white/15 hover:text-white'
                        )}
                      >
                        <Heart className={cn('w-3.5 h-3.5 transition-all', song.user_voted && 'fill-primary scale-110')} />
                        {song.votes}
                      </button>

                      {/* Delete */}
                      {(song.added_by === user?.id || profile?.role === 'admin') && (
                        <button
                          onClick={() => handleDelete(song.id)}
                          className="p-2 text-white-muted/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Rest of songs */}
          {restSongs.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1 mb-1 mt-2">
                <TrendingUp className="w-3.5 h-3.5 text-white-muted" />
                <p className="text-xs font-semibold text-white-muted uppercase tracking-wider">Todas las sugerencias</p>
              </div>
              {restSongs.map((song, i) => (
                <div
                  key={song.id}
                  className="card p-3.5 flex items-center gap-3 hover:border-white/[0.1] transition-all animate-slide-up"
                  style={{ animationDelay: `${(i + 3) * 50}ms` }}
                >
                  {/* Number */}
                  <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-white-muted">{i + 4}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{song.title}</p>
                    <p className="text-[11px] text-white-muted truncate mt-0.5">{song.artist} &middot; {song.added_by_name}</p>
                  </div>

                  {/* Spotify */}
                  {song.spotify_url && (
                    <a
                      href={song.spotify_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-green-400/70 hover:text-green-400 hover:bg-green-500/10 rounded-xl transition-colors flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Vote */}
                  <button
                    onClick={() => handleVote(song.id, song.user_voted)}
                    disabled={votingId === song.id}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 flex-shrink-0',
                      song.user_voted
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : 'bg-white/[0.04] text-white-muted border border-white/[0.06] hover:border-white/10 hover:text-white'
                    )}
                  >
                    <Heart className={cn('w-3 h-3 transition-all', song.user_voted && 'fill-primary')} />
                    {song.votes}
                  </button>

                  {/* Delete */}
                  {(song.added_by === user?.id || profile?.role === 'admin') && (
                    <button
                      onClick={() => handleDelete(song.id)}
                      className="p-1.5 text-white-muted/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
