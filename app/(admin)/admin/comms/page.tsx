'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { Pagination } from '@/components/admin/pagination'
import { cn } from '@/lib/utils'
import {
  Send, Radio, MessageCircle, Shield, Trash2, Pin, PinOff, VolumeX, Volume2,
  Check, FileText, Bell, BellRing, Clock, Users,
} from 'lucide-react'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Message = Database['public']['Tables']['messages']['Row']
type MessageTemplate = Database['public']['Tables']['message_templates']['Row']
type BroadcastLog = Database['public']['Tables']['broadcast_log']['Row']

interface MessageWithUser extends Message {
  userName: string
  userAvatar: string | null
}

type ActiveTab = 'broadcast' | 'moderation'

const PAGE_SIZE = 30

function formatDateStr(dateStr: string): string {
  return new Date(dateStr).toISOString().split('T')[0]
}

export default function CommsPage() {
  const { user, organization, isSuperAdmin, isAdmin, isGroupAdmin, initialized } = useAuth()
  const { allVenues } = useAdminSelection()
  const { error: showError, success } = useToast()

  // Local data
  const [allEvents, setAllEvents] = useState<Event[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('broadcast')

  // Inline selectors
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)

  // Broadcast state
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [selectAll, setSelectAll] = useState(false)
  const [sendPush, setSendPush] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastLog[]>([])

  // Moderation state
  const [modMessages, setModMessages] = useState<MessageWithUser[]>([])
  const [modSearch, setModSearch] = useState('')
  const [modPage, setModPage] = useState(1)
  const [modTotal, setModTotal] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set())
  const [modLoading, setModLoading] = useState(false)

  const userCacheRef = useRef<Record<string, { name: string; avatar: string | null }>>({})
  const modTotalPages = Math.ceil(modTotal / PAGE_SIZE)

  // Fetch events — scoped by role
  const { events: userEvents } = useAuth()
  useEffect(() => {
    if (!user) return
    const fetchEv = async () => {
      if (isGroupAdmin && userEvents.length > 0) {
        const sorted = userEvents.map(m => m.event).sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        setAllEvents(sorted)
        return
      }
      if (!organization?.id) return
      let query = supabase.from('events').select('*').order('date', { ascending: true })
      if (isSuperAdmin) {
        query = query.eq('organization_id', organization.id)
      } else {
        query = query.eq('created_by', user.id)
      }
      const { data } = await query
      setAllEvents(data || [])
    }
    fetchEv()
  }, [user?.id, organization?.id, isSuperAdmin, isGroupAdmin, userEvents])

  // Fetch templates & broadcast history
  useEffect(() => {
    if (!organization?.id) return
    const fetch = async () => {
      const [tmplRes, logRes] = await Promise.all([
        supabase.from('message_templates').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
        supabase.from('broadcast_log').select('*').eq('organization_id', organization.id).order('sent_at', { ascending: false }).limit(20),
      ])
      setTemplates(tmplRes.data || [])
      setBroadcasts(logRes.data || [])
    }
    fetch()
  }, [organization?.id])

  // Derived: dates
  const dates = [...new Set(allEvents.map(e => formatDateStr(e.date)))].sort()

  // Auto-select date
  useEffect(() => {
    if (selectedDate && dates.includes(selectedDate)) return
    if (dates.length === 0) { setSelectedDate(null); return }
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(dates.find(d => d >= today) || dates[dates.length - 1])
  }, [dates, selectedDate])

  // Events for date
  const eventsForDate = allEvents.filter(e => selectedDate && formatDateStr(e.date) === selectedDate)

  // Venues for date
  const venueIdsForDate = new Set(eventsForDate.map(e => e.venue_id).filter(Boolean))
  const venuesForDate = allVenues.filter(v => venueIdsForDate.has(v.id))

  // Active events (filtered by venue)
  const activeEvents = selectedVenueId
    ? eventsForDate.filter(e => e.venue_id === selectedVenueId)
    : eventsForDate

  // Reset selections on date change
  useEffect(() => { setSelectedVenueId(null); setSelectedEventIds([]); setSelectAll(false) }, [selectedDate])
  useEffect(() => { setSelectedEventIds([]); setSelectAll(false) }, [selectedVenueId])

  // Resolve user names
  const resolveUserNames = useCallback(async (msgs: Message[]): Promise<MessageWithUser[]> => {
    const unknownIds = [...new Set(msgs.map(m => m.user_id).filter(id => !userCacheRef.current[id]))]
    if (unknownIds.length > 0) {
      const { data } = await supabase.from('users').select('id, full_name, avatar_url').in('id', unknownIds)
      data?.forEach(u => { userCacheRef.current[u.id] = { name: u.full_name || 'Usuario', avatar: u.avatar_url } })
    }
    return msgs.map(m => ({
      ...m,
      userName: userCacheRef.current[m.user_id]?.name || 'Usuario',
      userAvatar: userCacheRef.current[m.user_id]?.avatar || null,
    }))
  }, [])

  // Fetch moderation messages
  const fetchModMessages = useCallback(async () => {
    if (activeTab !== 'moderation' || activeEvents.length === 0) { setModMessages([]); setModTotal(0); return }
    setModLoading(true)
    try {
      const eventIds = activeEvents.map(e => e.id)
      let query = supabase.from('messages').select('*', { count: 'exact' }).in('event_id', eventIds).order('created_at', { ascending: false })
      if (modSearch.trim()) query = query.ilike('content', `%${modSearch.trim()}%`)
      const from = (modPage - 1) * PAGE_SIZE
      query = query.range(from, from + PAGE_SIZE - 1)
      const { data, count, error } = await query
      if (error) throw error
      const enriched = await resolveUserNames(data || [])
      setModMessages(enriched)
      setModTotal(count || 0)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setModLoading(false)
    }
  }, [activeTab, activeEvents.length, modSearch, modPage, resolveUserNames])

  useEffect(() => { fetchModMessages() }, [fetchModMessages])
  useEffect(() => { setModPage(1) }, [modSearch])

  // Muted users
  const fetchMutedUsers = useCallback(async () => {
    const eventIds = activeEvents.map(e => e.id)
    if (eventIds.length === 0) return
    const { data } = await supabase.from('user_events').select('user_id').in('event_id', eventIds).eq('is_muted', true)
    if (data) setMutedUsers(new Set(data.map(d => d.user_id)))
  }, [activeEvents.length])

  useEffect(() => { if (activeTab === 'moderation') fetchMutedUsers() }, [activeTab, fetchMutedUsers])

  // Broadcast handlers
  const toggleEvent = (id: string) => setSelectedEventIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const handleSelectAll = () => {
    if (selectAll) { setSelectedEventIds([]) } else { setSelectedEventIds(activeEvents.map(e => e.id)) }
    setSelectAll(!selectAll)
  }

  const handleSendBroadcast = async () => {
    if (!message.trim() || selectedEventIds.length === 0 || !user || !organization?.id) return
    setSending(true)
    try {
      const inserts = selectedEventIds.map(eventId => ({ event_id: eventId, user_id: user.id, content: message.trim(), is_announcement: true }))
      const { error: msgError } = await supabase.from('messages').insert(inserts)
      if (msgError) throw msgError
      await supabase.from('broadcast_log').insert({ organization_id: organization.id, event_ids: selectedEventIds, content: message.trim(), sent_by: user.id })

      if (sendPush) {
        try {
          await authFetch('/api/push', { title: 'Anuncio', body: message.trim().slice(0, 200), url: '/chat', event_ids: selectedEventIds })
        } catch {}
      }

      success('Comunicado enviado')
      setMessage('')
      setSelectedEventIds([])
      setSelectAll(false)
      setSendPush(false)
      // Refresh broadcasts
      const { data: logData } = await supabase.from('broadcast_log').select('*').eq('organization_id', organization.id).order('sent_at', { ascending: false }).limit(20)
      setBroadcasts(logData || [])
    } catch (err) {
      showError('Error al enviar')
    } finally {
      setSending(false)
    }
  }

  // Moderation actions
  const handleDeleteMsg = async (msgId: string) => {
    const { error } = await supabase.from('messages').delete().eq('id', msgId)
    if (error) { showError('Error al eliminar'); return }
    success('Eliminado')
    setConfirmDelete(null)
    fetchModMessages()
  }

  const handleTogglePin = async (msg: MessageWithUser) => {
    const { error } = await supabase.from('messages').update({ is_pinned: !msg.is_pinned }).eq('id', msg.id)
    if (error) { showError('Error'); return }
    success(msg.is_pinned ? 'Desfijado' : 'Fijado')
    fetchModMessages()
  }

  const handleToggleMute = async (userId: string) => {
    const eventIds = activeEvents.map(e => e.id)
    if (eventIds.length === 0) return
    const isMuted = mutedUsers.has(userId)
    const { error } = await supabase.from('user_events').update({ is_muted: !isMuted }).eq('user_id', userId).in('event_id', eventIds)
    if (error) { showError('Error'); return }
    setMutedUsers(prev => { const next = new Set(prev); if (isMuted) next.delete(userId); else next.add(userId); return next })
    success(isMuted ? 'Desilenciado' : 'Silenciado')
  }

  const formatDate = (ds: string) => new Date(ds).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin && !isGroupAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with inline selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Comunicacion</h1>
          <p className="text-sm text-white-muted mt-0.5">Comunicados, anuncios y moderacion</p>
        </div>
        <div className="flex items-center gap-2">
          {dates.length > 0 && (
            <select value={selectedDate || ''} onChange={e => setSelectedDate(e.target.value || null)} className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40">
              {dates.map(d => <option key={d} value={d} className="bg-[#1a1a1a]">{new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}
            </select>
          )}
          {venuesForDate.length > 0 && (
            <select value={selectedVenueId || ''} onChange={e => setSelectedVenueId(e.target.value || null)} className="px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-xs focus:outline-none focus:border-primary/40">
              <option value="" className="bg-[#1a1a1a]">Todos los venues</option>
              {venuesForDate.map(v => <option key={v.id} value={v.id} className="bg-[#1a1a1a]">{v.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-black-card border border-black-border w-fit">
        <button onClick={() => setActiveTab('broadcast')} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'broadcast' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>
          <Radio className="w-4 h-4" /> Comunicados
        </button>
        <button onClick={() => setActiveTab('moderation')} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all', activeTab === 'moderation' ? 'bg-primary text-white' : 'text-white-muted hover:text-white')}>
          <Shield className="w-4 h-4" /> Moderacion
        </button>
      </div>

      {activeEvents.length === 0 && (
        <div className="card p-8 text-center"><p className="text-white-muted">No hay eventos para esta fecha.</p></div>
      )}

      {/* Broadcast Tab */}
      {activeTab === 'broadcast' && activeEvents.length > 0 && (
        <>
          <div className="card-accent p-5 space-y-4">
            <div className="flex items-center gap-2"><Radio className="w-5 h-5 text-primary" /><h2 className="text-base font-bold text-white">Nuevo comunicado</h2></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white-muted">Destinatarios</label>
                <button onClick={handleSelectAll} className="text-xs text-primary hover:underline">{selectAll ? 'Deseleccionar' : 'Seleccionar todos'}</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeEvents.map(ev => {
                  const sel = selectedEventIds.includes(ev.id)
                  return (
                    <button key={ev.id} onClick={() => toggleEvent(ev.id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all', sel ? 'border-primary bg-primary/12 text-primary' : 'border-black-border text-white-muted hover:border-white/15')}>
                      {sel && <Check className="w-3 h-3" />} {ev.group_name || ev.title}
                    </button>
                  )
                })}
              </div>
            </div>

            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Escribe el comunicado..." rows={4} className={cn(inputClass, 'resize-none')} />

            {templates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                  <button key={t.id} onClick={() => setMessage(t.content)} className="px-3 py-1.5 rounded-lg text-xs border border-black-border text-white-muted hover:border-primary/30 hover:text-primary transition-all">
                    <FileText className="w-3 h-3 inline mr-1" /> {t.title}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setSendPush(!sendPush)} className={cn('relative w-11 h-6 rounded-full transition-colors', sendPush ? 'bg-primary' : 'bg-white/10')}>
                <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', sendPush && 'translate-x-5')} />
              </button>
              <span className={cn('text-sm flex items-center gap-2', sendPush ? 'text-white' : 'text-white-muted')}>
                {sendPush ? <BellRing className="w-4 h-4 text-primary" /> : <Bell className="w-4 h-4" />} Push notification
              </span>
            </label>

            <button onClick={handleSendBroadcast} disabled={!message.trim() || selectedEventIds.length === 0 || sending} className="btn-primary w-full py-3 text-sm">
              <Send className="w-4 h-4" /> {sending ? 'Enviando...' : `Enviar a ${selectedEventIds.length} grupo(s)`}
            </button>
          </div>

          {/* Broadcast History */}
          <div>
            <h2 className="text-base font-bold text-white mb-3">Historial</h2>
            <div className="space-y-2">
              {broadcasts.map(b => {
                const targetEvents = allEvents.filter(e => b.event_ids.includes(e.id))
                return (
                  <div key={b.id} className="card p-4 space-y-2">
                    <p className="text-sm text-white">{b.content}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[10px] text-white-muted"><Users className="w-3 h-3" /><span>{targetEvents.map(e => e.group_name || e.title).join(', ')}</span></div>
                      <span className="text-[10px] text-white-muted flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(b.sent_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                )
              })}
              {broadcasts.length === 0 && <div className="card p-8 text-center"><Radio className="w-8 h-8 text-white-muted mx-auto mb-2" /><p className="text-white-muted text-sm">Sin comunicados.</p></div>}
            </div>
          </div>
        </>
      )}

      {/* Moderation Tab */}
      {activeTab === 'moderation' && activeEvents.length > 0 && (
        <>
          <SearchInput value={modSearch} onChange={setModSearch} placeholder="Buscar en mensajes..." />

          {modLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="card h-20 animate-pulse" />)}</div>
          ) : modMessages.length === 0 ? (
            <div className="card p-8 text-center"><MessageCircle className="w-8 h-8 text-white-muted mx-auto mb-2" /><p className="text-white-muted text-sm">No hay mensajes</p></div>
          ) : (
            <div className="space-y-2">
              {modMessages.map(msg => {
                const isMuted = mutedUsers.has(msg.user_id)
                return (
                  <div key={msg.id} className={cn('card p-4', msg.is_pinned && 'border-amber-400/20')}>
                    <div className="flex items-start gap-3">
                      {msg.userAvatar ? (
                        <Image src={msg.userAvatar} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold bg-primary/10 text-primary">{msg.userName[0].toUpperCase()}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-white">{msg.userName}</span>
                          {isMuted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">Silenciado</span>}
                          {msg.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Fijado</span>}
                          <span className="text-[10px] text-white-muted ml-auto">{formatDate(msg.created_at)}</span>
                        </div>
                        <p className="text-sm text-white/80 whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button onClick={() => handleTogglePin(msg)} className={cn('text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors', msg.is_pinned ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-white-muted hover:bg-white/10')}>
                            {msg.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />} {msg.is_pinned ? 'Desfijar' : 'Fijar'}
                          </button>
                          <button onClick={() => handleToggleMute(msg.user_id)} className={cn('text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors', isMuted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white-muted hover:bg-white/10')}>
                            {isMuted ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />} {isMuted ? 'Desilenciar' : 'Silenciar'}
                          </button>
                          {confirmDelete === msg.id ? (
                            <div className="flex gap-1 ml-auto">
                              <button onClick={() => handleDeleteMsg(msg.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400">Confirmar</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white-muted">Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(msg.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-red-400 hover:bg-red-500/10 flex items-center gap-1 ml-auto">
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

          <Pagination currentPage={modPage} totalPages={modTotalPages} onPageChange={setModPage} />
        </>
      )}
    </div>
  )
}
