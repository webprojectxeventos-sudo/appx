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
import { cn, toLocalDateKey } from '@/lib/utils'
import {
  Send, Radio, MessageCircle, Shield, ShieldOff, Trash2, Pin, PinOff, VolumeX, Volume2,
  Check, FileText, Bell, BellRing, Clock, Users, ChevronDown, Mail, UserCheck, Power, PowerOff,
} from 'lucide-react'
import { BanModal } from '@/components/admin/attendees/ban-modal'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type Message = Database['public']['Tables']['messages']['Row']
type MessageTemplate = Database['public']['Tables']['message_templates']['Row']
type BroadcastLog = Database['public']['Tables']['broadcast_log']['Row']
type ChatBan = Database['public']['Tables']['chat_bans']['Row']

interface MessageWithUser extends Message {
  userName: string
  userAvatar: string | null
  userEmail: string | null
  addedByName: string | null  // null = self-signup, else the admin who added them
}

type ActiveTab = 'broadcast' | 'moderation'

const PAGE_SIZE = 30

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
  const [bannedUsers, setBannedUsers] = useState<Map<string, ChatBan>>(new Map())
  const [showBans, setShowBans] = useState(false)
  const [banTarget, setBanTarget] = useState<{ userId: string; userName: string; eventIds: string[] } | null>(null)
  const [modLoading, setModLoading] = useState(false)

  const userCacheRef = useRef<Record<string, { name: string; avatar: string | null; email: string | null }>>({})
  // Cache of added_by keyed by `${user_id}:${event_id}` (since users can be added
  // to multiple events by different admins, we can't key by user alone).
  const addedByCacheRef = useRef<Record<string, string | null>>({})
  // Per-event chat_enabled state (kill-switch), hydrated from the events list
  const [chatDisabledEventIds, setChatDisabledEventIds] = useState<Set<string>>(new Set())
  const modTotalPages = Math.ceil(modTotal / PAGE_SIZE)

  // Version counter to prevent stale fetch responses from overwriting fresh data
  const fetchEventsVersion = useRef(0)

  // Fetch events — scoped by role
  const { events: userEvents } = useAuth()
  useEffect(() => {
    if (!user) return
    const version = ++fetchEventsVersion.current
    const fetchEv = async () => {
      if (isGroupAdmin && userEvents.length > 0) {
        const sorted = userEvents.map(m => m.event).sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )
        if (fetchEventsVersion.current !== version) return
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
      if (fetchEventsVersion.current !== version) return
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
  const dates = [...new Set(allEvents.map(e => toLocalDateKey(e.date)))].sort()

  // Auto-select date
  useEffect(() => {
    if (selectedDate && dates.includes(selectedDate)) return
    if (dates.length === 0) { setSelectedDate(null); return }
    const today = toLocalDateKey(new Date())
    setSelectedDate(dates.find(d => d >= today) || dates[dates.length - 1])
  }, [dates, selectedDate])

  // Events for date
  const eventsForDate = allEvents.filter(e => selectedDate && toLocalDateKey(e.date) === selectedDate)

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

  // Resolve user metadata (name, avatar, email, added_by)
  const resolveUserNames = useCallback(async (msgs: Message[]): Promise<MessageWithUser[]> => {
    // 1. Users: fetch anyone we haven't cached yet (name / avatar / email)
    const unknownUserIds = [...new Set(msgs.map(m => m.user_id).filter(id => !userCacheRef.current[id]))]
    if (unknownUserIds.length > 0) {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, avatar_url, email')
        .in('id', unknownUserIds)
      data?.forEach(u => {
        userCacheRef.current[u.id] = {
          name: u.full_name || 'Usuario',
          avatar: u.avatar_url,
          email: u.email,
        }
      })
    }

    // 2. Added_by: fetch user_events rows for (user_id, event_id) pairs we don't
    //    have. Then for each resolved user_events row, resolve the adder's name.
    const missingPairs: Array<{ uid: string; eid: string }> = []
    msgs.forEach(m => {
      if (!m.event_id) return
      const key = `${m.user_id}:${m.event_id}`
      if (!(key in addedByCacheRef.current)) {
        missingPairs.push({ uid: m.user_id, eid: m.event_id })
      }
    })

    if (missingPairs.length > 0) {
      // Split into parallel queries per event_id (users.in()-per-event) — keeps
      // things simple vs. constructing a complex OR filter.
      const byEvent: Record<string, string[]> = {}
      missingPairs.forEach(({ uid, eid }) => {
        byEvent[eid] = byEvent[eid] || []
        byEvent[eid].push(uid)
      })

      const membershipRows: Array<{ user_id: string; event_id: string; added_by: string | null }> = []
      await Promise.all(
        Object.entries(byEvent).map(async ([eid, uids]) => {
          const { data } = await supabase
            .from('user_events')
            .select('user_id, event_id, added_by')
            .eq('event_id', eid)
            .in('user_id', uids)
          if (data) membershipRows.push(...data)
        })
      )

      // Resolve adder names
      const adderIds = [...new Set(
        membershipRows.map(r => r.added_by).filter((x): x is string => !!x && !userCacheRef.current[x])
      )]
      if (adderIds.length > 0) {
        const { data } = await supabase.from('users').select('id, full_name, avatar_url, email').in('id', adderIds)
        data?.forEach(u => {
          userCacheRef.current[u.id] = {
            name: u.full_name || 'Usuario',
            avatar: u.avatar_url,
            email: u.email,
          }
        })
      }

      membershipRows.forEach(r => {
        const key = `${r.user_id}:${r.event_id}`
        addedByCacheRef.current[key] = r.added_by
          ? userCacheRef.current[r.added_by]?.name || null
          : null
      })
      // Also fill in "null" for any pair we asked about but didn't find (no row)
      missingPairs.forEach(({ uid, eid }) => {
        const key = `${uid}:${eid}`
        if (!(key in addedByCacheRef.current)) addedByCacheRef.current[key] = null
      })
    }

    return msgs.map(m => {
      const cache = userCacheRef.current[m.user_id]
      const addedKey = m.event_id ? `${m.user_id}:${m.event_id}` : null
      return {
        ...m,
        userName: cache?.name || 'Usuario',
        userAvatar: cache?.avatar || null,
        userEmail: cache?.email || null,
        addedByName: addedKey ? (addedByCacheRef.current[addedKey] ?? null) : null,
      }
    })
  }, [])

  // Fetch moderation messages.
  //
  // NOTE on deps: `activeEventIdsKey` is a stable string of all event IDs in
  // the current view. Using `activeEvents.length` here (the prior bug) meant
  // switching from one venue to another with the same event count would keep
  // the OLD event IDs in the closure — the UI looked like it changed but
  // kept showing messages from the old venue.
  const activeEventIdsKey = activeEvents.map(e => e.id).sort().join(',')
  const fetchModMessages = useCallback(async () => {
    if (activeTab !== 'moderation' || activeEventIdsKey === '') { setModMessages([]); setModTotal(0); return }
    setModLoading(true)
    try {
      const eventIds = activeEventIdsKey.split(',')
      let query = supabase.from('messages').select('*', { count: 'exact' }).in('event_id', eventIds).is('deleted_at', null).order('created_at', { ascending: false })
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
  }, [activeTab, activeEventIdsKey, modSearch, modPage, resolveUserNames])

  useEffect(() => { fetchModMessages() }, [fetchModMessages])
  useEffect(() => { setModPage(1) }, [modSearch])

  // Muted users + banned users. Same stale-dep fix as fetchModMessages —
  // closure must key on the actual IDs, not just the count.
  const fetchMutedAndBanned = useCallback(async () => {
    if (activeEventIdsKey === '') return
    const eventIds = activeEventIdsKey.split(',')
    const [mutedRes, bannedRes] = await Promise.all([
      supabase.from('user_events').select('user_id').in('event_id', eventIds).eq('is_muted', true),
      supabase.from('chat_bans').select('*').in('event_id', eventIds).eq('is_active', true),
    ])
    if (mutedRes.data) setMutedUsers(new Set(mutedRes.data.map(d => d.user_id)))
    if (bannedRes.data) {
      const map = new Map<string, ChatBan>()
      bannedRes.data.forEach(b => map.set(b.user_id, b))
      setBannedUsers(map)
    }
  }, [activeEventIdsKey])

  useEffect(() => { if (activeTab === 'moderation') fetchMutedAndBanned() }, [activeTab, fetchMutedAndBanned])

  // Hydrate kill-switch state from the events list (chat_enabled column).
  useEffect(() => {
    setChatDisabledEventIds(new Set(allEvents.filter(e => e.chat_enabled === false).map(e => e.id)))
  }, [allEvents])

  // Toggle kill-switch for an event. Routes through /api/admin/chat-enabled
  // (service role) instead of a direct supabase update — that way RLS edge
  // cases can never silently block an urgent moderation action.
  const handleToggleChatEnabled = async (eventId: string) => {
    const currentlyDisabled = chatDisabledEventIds.has(eventId)
    const nextEnabled = currentlyDisabled  // flip: disabled → enable
    try {
      const res = await authFetch('/api/admin/chat-enabled', { eventId, enabled: nextEnabled })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        console.error('[chat-enabled] HTTP', res.status, body)
        showError(body?.error || 'Error al cambiar el chat')
        return
      }
    } catch (err) {
      console.error('[chat-enabled] Network error:', err)
      showError('Error de red al cambiar el chat')
      return
    }
    setChatDisabledEventIds(prev => {
      const next = new Set(prev)
      if (nextEnabled) next.delete(eventId)
      else next.add(eventId)
      return next
    })
    // Keep allEvents in sync so the hydration effect doesn't fight us
    setAllEvents(prev => prev.map(e => e.id === eventId ? { ...e, chat_enabled: nextEnabled } : e))
    success(nextEnabled ? 'Chat reactivado' : 'Chat desactivado')
  }

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
    // Soft-delete: mark as deleted with audit trail
    const { error } = await supabase.from('messages').update({
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id || null,
    }).eq('id', msgId)
    if (error) { showError('Error al eliminar'); return }
    success('Eliminado')
    setConfirmDelete(null)
    fetchModMessages()
  }

  // Unban user
  const handleUnban = async (userId: string) => {
    const ban = bannedUsers.get(userId)
    if (!ban) return
    const { error } = await supabase.from('chat_bans').update({ is_active: false }).eq('id', ban.id)
    if (error) { showError('Error al desbanear'); return }
    setBannedUsers(prev => { const next = new Map(prev); next.delete(userId); return next })
    success('Ban eliminado')
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
          {/* Chat kill-switch — per active event. One row per event, one toggle
              each. Disabling instantly blocks /api/chat/send for that event. */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-black-border">
              <Power className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-white">Estado del chat</h3>
              <span className="text-[10px] text-white-muted ml-auto">
                Activa/desactiva al instante
              </span>
            </div>
            <div className="divide-y divide-black-border">
              {activeEvents.map(ev => {
                const isDisabled = chatDisabledEventIds.has(ev.id)
                return (
                  <div key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {ev.group_name || ev.title}
                      </p>
                      <p className={cn(
                        'text-[11px] mt-0.5 flex items-center gap-1',
                        isDisabled ? 'text-red-400' : 'text-emerald-400/80'
                      )}>
                        {isDisabled ? (
                          <><PowerOff className="w-2.5 h-2.5" /> Chat desactivado</>
                        ) : (
                          <><Power className="w-2.5 h-2.5" /> Chat activo</>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleChatEnabled(ev.id)}
                      className={cn(
                        'relative w-11 h-6 rounded-full transition-colors shrink-0',
                        isDisabled ? 'bg-white/10' : 'bg-primary shadow-[0_0_8px_rgba(228,30,43,0.3)]'
                      )}
                      aria-label={isDisabled ? 'Activar chat' : 'Desactivar chat'}
                    >
                      <div className={cn(
                        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                        !isDisabled && 'translate-x-5'
                      )} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <SearchInput value={modSearch} onChange={setModSearch} placeholder="Buscar en mensajes..." />

          {modLoading ? (
            <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="card h-20 animate-pulse" />)}</div>
          ) : modMessages.length === 0 ? (
            <div className="card p-8 text-center"><MessageCircle className="w-8 h-8 text-white-muted mx-auto mb-2" /><p className="text-white-muted text-sm">No hay mensajes</p></div>
          ) : (
            <div className="space-y-2">
              {modMessages.map(msg => {
                const isMuted = mutedUsers.has(msg.user_id)
                const isBanned = bannedUsers.has(msg.user_id)
                return (
                  <div key={msg.id} className={cn('card p-4', msg.is_pinned && 'border-amber-400/20', isBanned && 'border-red-500/15')}>
                    <div className="flex items-start gap-3">
                      {msg.userAvatar ? (
                        <Image src={msg.userAvatar} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold bg-primary/10 text-primary">{msg.userName[0].toUpperCase()}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium text-white">{msg.userName}</span>
                          {isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">BANEADO</span>}
                          {isMuted && !isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">Silenciado</span>}
                          {msg.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Fijado</span>}
                          <span className="text-[10px] text-white-muted ml-auto">{formatDate(msg.created_at)}</span>
                        </div>
                        {/* Identity row: email + added_by — critical for moderation
                            (ties an insulting message back to a real person so the
                            organizer can contact them or their school directly). */}
                        <div className="flex items-center gap-2.5 flex-wrap mb-1.5 text-[10px] text-white-muted">
                          {msg.userEmail && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[200px]">{msg.userEmail}</span>
                            </span>
                          )}
                          {msg.addedByName ? (
                            <span className="flex items-center gap-1 text-white/40">
                              <UserCheck className="w-2.5 h-2.5" />
                              anadido por {msg.addedByName}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-white/30">
                              <UserCheck className="w-2.5 h-2.5" />
                              auto-registro
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-white/80 whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <button onClick={() => handleTogglePin(msg)} className={cn('text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors', msg.is_pinned ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-white-muted hover:bg-white/10')}>
                            {msg.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />} {msg.is_pinned ? 'Desfijar' : 'Fijar'}
                          </button>
                          <button onClick={() => handleToggleMute(msg.user_id)} className={cn('text-[11px] font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors', isMuted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white-muted hover:bg-white/10')}>
                            {isMuted ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />} {isMuted ? 'Desilenciar' : 'Silenciar'}
                          </button>
                          {isBanned ? (
                            <button onClick={() => handleUnban(msg.user_id)} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/15 flex items-center gap-1 transition-colors">
                              <ShieldOff className="w-3 h-3" /> Desbanear
                            </button>
                          ) : (
                            <button onClick={() => setBanTarget({ userId: msg.user_id, userName: msg.userName, eventIds: activeEvents.map(e => e.id) })} className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-white/5 text-white-muted hover:bg-red-500/10 hover:text-red-400 flex items-center gap-1 transition-colors">
                              <Shield className="w-3 h-3" /> Banear
                            </button>
                          )}
                          {confirmDelete === msg.id ? (
                            <div className="flex gap-1 ml-auto">
                              <button onClick={() => handleDeleteMsg(msg.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400">Confirmar</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-white-muted">Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelete(msg.id)} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 text-red-400 hover:bg-red-500/10 flex items-center gap-1 ml-auto transition-colors">
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

          {/* Active bans section */}
          {bannedUsers.size > 0 && (
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowBans(!showBans)}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Shield className="w-4 h-4 text-red-400" />
                  Bans activos ({bannedUsers.size})
                </span>
                <ChevronDown className={cn('w-4 h-4 text-white-muted transition-transform', showBans && 'rotate-180')} />
              </button>
              {showBans && (
                <div className="border-t border-black-border divide-y divide-black-border">
                  {[...bannedUsers.entries()].map(([userId, ban]) => (
                    <div key={ban.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{userCacheRef.current[userId]?.name || userId.slice(0, 8)}</p>
                        <p className="text-[10px] text-white-muted mt-0.5">
                          {ban.reason && <span className="mr-2">{ban.reason}</span>}
                          {ban.expires_at
                            ? `Expira: ${new Date(ban.expires_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                            : 'Permanente'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnban(userId)}
                        className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/15 flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <ShieldOff className="w-3 h-3" /> Quitar ban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Ban Modal */}
      <BanModal
        open={!!banTarget}
        onClose={() => setBanTarget(null)}
        userId={banTarget?.userId || ''}
        userName={banTarget?.userName || ''}
        eventIds={banTarget?.eventIds || []}
        bannedBy={user?.id || ''}
        onBanned={fetchMutedAndBanned}
      />
    </div>
  )
}
