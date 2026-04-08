'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { FilterBar } from '@/components/admin/filter-bar'
import { Pagination } from '@/components/admin/pagination'
import { cn } from '@/lib/utils'
import {
  Send,
  Megaphone,
  MessageCircle,
  Shield,
  Trash2,
  Pin,
  PinOff,
  VolumeX,
  Volume2,
  BarChart3,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type Message = Database['public']['Tables']['messages']['Row']

interface MessageWithUser extends Message {
  userName: string
  userAvatar: string | null
}

type ChatTab = 'instituto' | 'general' | 'moderacion'

const MOD_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'announcements', label: 'Anuncios' },
  { key: 'general', label: 'General' },
  { key: 'pinned', label: 'Fijados' },
]

const PAGE_SIZE = 30

export default function ChatPage() {
  const { user, isAdmin, isSuperAdmin, initialized } = useAuth()
  const { selectedEventId, selectedVenueId, events, venues } = useAdminSelection()
  const { error: showError, success } = useToast()

  const [messages, setMessages] = useState<MessageWithUser[]>([])
  const [activeTab, setActiveTab] = useState<ChatTab>('instituto')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  // Moderation state
  const [modSearch, setModSearch] = useState('')
  const [modFilter, setModFilter] = useState('all')
  const [modPage, setModPage] = useState(1)
  const [modTotal, setModTotal] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState({ total: 0, today: 0, pinned: 0 })

  // User name cache
  const userCacheRef = useRef<Record<string, { name: string; avatar: string | null }>>({})

  const selectedEvent = events.find(e => e.id === selectedEventId)
  const selectedVenue = venues.find(v => v.id === selectedVenueId)

  const modTotalPages = Math.ceil(modTotal / PAGE_SIZE)

  // Batch fetch user names
  const resolveUserNames = useCallback(async (msgs: Message[]): Promise<MessageWithUser[]> => {
    const unknownIds = msgs
      .map(m => m.user_id)
      .filter(id => !userCacheRef.current[id])
    const uniqueIds = [...new Set(unknownIds)]

    if (uniqueIds.length > 0) {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .in('id', uniqueIds)
      data?.forEach(u => {
        userCacheRef.current[u.id] = { name: u.full_name || 'Usuario', avatar: u.avatar_url }
      })
    }

    return msgs.map(m => ({
      ...m,
      userName: userCacheRef.current[m.user_id]?.name || 'Usuario',
      userAvatar: userCacheRef.current[m.user_id]?.avatar || null,
    }))
  }, [])

  // Fetch messages for instituto/general tabs
  const fetchMessages = useCallback(async () => {
    if (activeTab === 'moderacion') return
    if (activeTab === 'instituto' && !selectedEventId) { setMessages([]); return }
    if (activeTab === 'general' && !selectedVenueId) { setMessages([]); return }

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })

      if (activeTab === 'instituto') {
        query = query.eq('event_id', selectedEventId!).eq('is_announcement', true).eq('is_general', false)
      } else {
        query = query.eq('venue_id', selectedVenueId!).eq('is_general', true)
      }

      const { data, error } = await query
      if (error) throw error
      const enriched = await resolveUserNames(data || [])
      setMessages(enriched)
    } catch (err) {
      console.error('Error fetching messages:', err)
    }
  }, [activeTab, selectedEventId, selectedVenueId, resolveUserNames])

  // Fetch moderation messages
  const fetchModMessages = useCallback(async () => {
    if (activeTab !== 'moderacion') return
    if (!selectedVenueId && !selectedEventId) { setMessages([]); setModTotal(0); return }

    setLoading(true)
    try {
      // Get event IDs to query
      const targetEventIds = selectedEventId
        ? [selectedEventId]
        : events.map(e => e.id)

      if (targetEventIds.length === 0) { setMessages([]); setModTotal(0); setLoading(false); return }

      let query = supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      // Filter by venue's events or specific event
      if (selectedVenueId && !selectedEventId) {
        query = query.or(`venue_id.eq.${selectedVenueId},event_id.in.(${targetEventIds.join(',')})`)
      } else {
        query = query.eq('event_id', selectedEventId!)
      }

      // Sub-filters
      if (modFilter === 'announcements') query = query.eq('is_announcement', true)
      if (modFilter === 'general') query = query.eq('is_general', true)
      if (modFilter === 'pinned') query = query.eq('is_pinned', true)

      // Search
      if (modSearch.trim()) {
        query = query.ilike('content', `%${modSearch.trim()}%`)
      }

      const from = (modPage - 1) * PAGE_SIZE
      query = query.range(from, from + PAGE_SIZE - 1)

      const { data, count, error } = await query
      if (error) throw error

      const enriched = await resolveUserNames(data || [])
      setMessages(enriched)
      setModTotal(count || 0)

      // Stats (only on first load or filter changes)
      if (modPage === 1 && !modSearch) {
        const today = new Date().toISOString().split('T')[0]
        const pinnedCount = (data || []).filter(m => m.is_pinned).length

        // Get total count
        let totalQuery = supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
        if (selectedVenueId && !selectedEventId) {
          totalQuery = totalQuery.or(`venue_id.eq.${selectedVenueId},event_id.in.(${targetEventIds.join(',')})`)
        } else {
          totalQuery = totalQuery.eq('event_id', selectedEventId!)
        }
        const { count: totalAll } = await totalQuery

        // Today count
        let todayQuery = supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', today + 'T00:00:00')
        if (selectedVenueId && !selectedEventId) {
          todayQuery = todayQuery.or(`venue_id.eq.${selectedVenueId},event_id.in.(${targetEventIds.join(',')})`)
        } else {
          todayQuery = todayQuery.eq('event_id', selectedEventId!)
        }
        const { count: todayAll } = await todayQuery

        setStats({ total: totalAll || 0, today: todayAll || 0, pinned: pinnedCount })
      }
    } catch (err) {
      console.error('Error fetching mod messages:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, selectedVenueId, selectedEventId, events, modFilter, modSearch, modPage, resolveUserNames])

  // Load muted users for venue
  const fetchMutedUsers = useCallback(async () => {
    if (!selectedVenueId) return
    const eventIds = events.map(e => e.id)
    if (eventIds.length === 0) return

    const { data } = await supabase
      .from('user_events')
      .select('user_id')
      .in('event_id', eventIds)
      .eq('is_muted', true)

    if (data) {
      setMutedUsers(new Set(data.map(d => d.user_id)))
    }
  }, [selectedVenueId, events])

  useEffect(() => {
    if (activeTab === 'moderacion') {
      fetchModMessages()
      fetchMutedUsers()
    } else {
      fetchMessages()
    }
  }, [activeTab, fetchMessages, fetchModMessages, fetchMutedUsers])

  // Realtime for all tabs
  useEffect(() => {
    if (!selectedVenueId && !selectedEventId) return

    const channelName = `chat-admin-${selectedVenueId || selectedEventId}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        if (activeTab === 'moderacion') fetchModMessages()
        else fetchMessages()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedVenueId, selectedEventId, activeTab, fetchMessages, fetchModMessages])

  // Reset mod page on filter/search change
  useEffect(() => { setModPage(1) }, [modSearch, modFilter])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !content.trim()) { showError('Escribe un mensaje'); return }

    try {
      if (activeTab === 'instituto') {
        if (!selectedEventId) return
        const { error } = await supabase.from('messages').insert({
          event_id: selectedEventId,
          user_id: user.id,
          content: content.trim(),
          is_announcement: true,
          is_general: false,
        })
        if (error) throw error
      } else {
        if (!selectedVenueId) return
        const { error } = await supabase.from('messages').insert({
          venue_id: selectedVenueId,
          user_id: user.id,
          content: content.trim(),
          is_announcement: true,
          is_general: true,
        })
        if (error) throw error
      }
      setContent('')
      success(activeTab === 'instituto' ? 'Anuncio enviado' : 'Mensaje enviado')
    } catch (err) {
      console.error('Error sending:', err)
      showError('Error al enviar')
    }
  }

  // Moderation actions
  const handleDelete = async (msgId: string) => {
    try {
      const { error } = await supabase.from('messages').delete().eq('id', msgId)
      if (error) throw error
      success('Mensaje eliminado')
      setConfirmDelete(null)
    } catch (err) {
      console.error('Error deleting:', err)
      showError('Error al eliminar')
    }
  }

  const handleTogglePin = async (msg: MessageWithUser) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_pinned: !msg.is_pinned })
        .eq('id', msg.id)
      if (error) throw error
      success(msg.is_pinned ? 'Mensaje desfijado' : 'Mensaje fijado')
    } catch (err) {
      console.error('Error toggling pin:', err)
      showError('Error al fijar/desfijar')
    }
  }

  const handleToggleMute = async (userId: string) => {
    const eventIds = events.map(e => e.id)
    if (eventIds.length === 0) return

    const isMuted = mutedUsers.has(userId)

    try {
      const { error } = await supabase
        .from('user_events')
        .update({ is_muted: !isMuted })
        .eq('user_id', userId)
        .in('event_id', eventIds)
      if (error) throw error

      setMutedUsers(prev => {
        const next = new Set(prev)
        if (isMuted) next.delete(userId)
        else next.add(userId)
        return next
      })
      success(isMuted ? 'Usuario desilenciado' : 'Usuario silenciado')
    } catch (err) {
      console.error('Error toggling mute:', err)
      showError('Error al silenciar/desilenciar')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  const canSend = activeTab === 'instituto' ? !!selectedEventId : activeTab === 'general' ? !!selectedVenueId : false
  const showModeration = activeTab === 'moderacion' && (!!selectedVenueId || !!selectedEventId)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Chat</h1>
        <p className="text-sm mt-0.5 text-white-muted">Anuncios, chat general y moderacion</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-black-card border border-black-border w-fit">
        {([
          { key: 'instituto' as const, label: 'Anuncios', icon: Megaphone },
          { key: 'general' as const, label: 'General', icon: MessageCircle },
          { key: 'moderacion' as const, label: 'Moderacion', icon: Shield },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.key ? 'bg-primary text-white' : 'text-white-muted hover:text-white'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Context info */}
      {activeTab === 'instituto' && !selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior para enviar anuncios.</p>
        </div>
      )}
      {activeTab === 'general' && !selectedVenueId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un venue en la barra superior para gestionar el chat general.</p>
        </div>
      )}
      {activeTab === 'moderacion' && !selectedVenueId && !selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un venue o instituto para moderar mensajes.</p>
        </div>
      )}

      {/* ─── Moderation Tab ─── */}
      {showModeration && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <BarChart3 className="w-5 h-5 mx-auto mb-1.5 text-primary" />
              <div className="text-xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-white-muted">Total mensajes</div>
            </div>
            <div className="card p-4 text-center">
              <MessageCircle className="w-5 h-5 mx-auto mb-1.5 text-blue-400" />
              <div className="text-xl font-bold text-white">{stats.today}</div>
              <div className="text-xs text-white-muted">Hoy</div>
            </div>
            <div className="card p-4 text-center">
              <Pin className="w-5 h-5 mx-auto mb-1.5 text-amber-400" />
              <div className="text-xl font-bold text-white">{stats.pinned}</div>
              <div className="text-xs text-white-muted">Fijados</div>
            </div>
          </div>

          {/* Search + Filters */}
          <SearchInput
            value={modSearch}
            onChange={setModSearch}
            placeholder="Buscar en mensajes..."
          />
          <FilterBar
            filters={MOD_FILTERS}
            activeFilter={modFilter}
            onFilterChange={setModFilter}
          />

          {/* Messages */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <div key={i} className="card h-20 animate-pulse" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="card p-8 text-center">
              <MessageCircle className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay mensajes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(msg => {
                const isMuted = mutedUsers.has(msg.user_id)

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'card p-4',
                      msg.is_pinned && 'border-amber-400/20 bg-amber-500/[0.03]'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      {msg.userAvatar ? (
                        <Image src={msg.userAvatar} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold bg-primary/10 text-primary">
                          {msg.userName[0].toUpperCase()}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-white">{msg.userName}</span>
                          {isMuted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Silenciado</span>
                          )}
                          {msg.is_pinned && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">Fijado</span>
                          )}
                          {msg.is_announcement && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Anuncio</span>
                          )}
                          {msg.is_general && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">General</span>
                          )}
                          <span className="text-[10px] text-white-muted ml-auto">{formatDate(msg.created_at)}</span>
                        </div>

                        <p className="text-sm text-white/80 whitespace-pre-wrap break-words">{msg.content}</p>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => handleTogglePin(msg)}
                            className={cn(
                              'text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1',
                              msg.is_pinned
                                ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
                                : 'bg-white/5 text-white-muted hover:bg-white/10'
                            )}
                          >
                            {msg.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                            {msg.is_pinned ? 'Desfijar' : 'Fijar'}
                          </button>

                          <button
                            onClick={() => handleToggleMute(msg.user_id)}
                            className={cn(
                              'text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1',
                              isMuted
                                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15'
                                : 'bg-white/5 text-white-muted hover:bg-white/10'
                            )}
                          >
                            {isMuted ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                            {isMuted ? 'Desilenciar' : 'Silenciar'}
                          </button>

                          {confirmDelete === msg.id ? (
                            <div className="flex items-center gap-1 ml-auto">
                              <button
                                onClick={() => handleDelete(msg.id)}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-white-muted hover:bg-white/10 transition-colors"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(msg.id)}
                              className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1 ml-auto"
                            >
                              <Trash2 className="w-3 h-3" /> Eliminar
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
            currentPage={modPage}
            totalPages={modTotalPages}
            onPageChange={setModPage}
          />
        </>
      )}

      {/* ─── Instituto / General Tabs ─── */}
      {activeTab !== 'moderacion' && canSend && (
        <>
          {/* Send Form */}
          <div className="card-accent p-6 animate-slide-up">
            <label className="block text-sm font-semibold mb-4 text-white">
              {activeTab === 'instituto'
                ? `Anuncio para: ${selectedEvent?.group_name || selectedEvent?.title || 'Instituto'}`
                : `Chat general: ${selectedVenue?.name || 'Venue'}`}
            </label>
            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={activeTab === 'instituto' ? 'Escribe tu anuncio...' : 'Escribe un mensaje para el chat general...'}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors resize-none"
              />
              <div className="flex justify-end">
                <button type="submit" disabled={!content.trim()} className="btn-primary">
                  <Send className="w-4 h-4" />
                  {activeTab === 'instituto' ? 'Enviar Anuncio' : 'Enviar al General'}
                </button>
              </div>
            </form>
          </div>

          {/* Messages List */}
          <div className="flex items-center gap-2">
            {activeTab === 'instituto' ? <Megaphone className="w-5 h-5 text-primary" /> : <MessageCircle className="w-5 h-5 text-primary" />}
            <h2 className="text-lg font-semibold text-white">
              {activeTab === 'instituto' ? 'Anuncios' : 'Mensajes Generales'} ({messages.length})
            </h2>
          </div>

          {messages.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-white-muted">{activeTab === 'instituto' ? 'No hay anuncios aun.' : 'No hay mensajes en el chat general.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={message.id} className={cn('card p-4 animate-slide-up', message.is_pinned && 'border-amber-400/20')} style={{ animationDelay: `${index * 0.03}s` }}>
                  <div className="flex items-start gap-3 mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {message.userAvatar ? (
                        <Image src={message.userAvatar} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-semibold bg-primary text-white text-sm">
                          {message.userName[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-semibold text-sm">{message.userName}</p>
                        <p className="text-xs text-white-muted">{formatDate(message.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {message.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-400" />}
                      <span className={cn('text-xs px-2 py-1 rounded whitespace-nowrap font-medium text-white', message.is_general ? 'bg-purple-600' : 'bg-primary')}>
                        {message.is_general ? 'General' : 'Anuncio'}
                      </span>
                    </div>
                  </div>
                  <p className="text-white/80 whitespace-pre-wrap break-words text-sm">{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
