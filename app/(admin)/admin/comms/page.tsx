'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { cn, toLocalDateKey } from '@/lib/utils'
import {
  Send, Radio, MessageCircle, Shield, ShieldOff, Trash2, Pin, PinOff, VolumeX, Volume2,
  Check, FileText, Bell, BellRing, Clock, Users, ChevronDown, Mail, UserCheck, Power, PowerOff,
  Download, Loader2, Lock, Globe, Calendar, MapPin, ChevronRight,
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
  // Context labels so the moderator can tell WHERE the message was sent. General
  // chat is venue-wide; private chat is scoped to a single event ("instituto").
  // Both live in the same `messages` table — distinguished by is_general.
  contextLabel: string        // Group name (private) or venue name (general)
  contextType: 'private' | 'general'
}

type ActiveTab = 'broadcast' | 'moderation'

// Page size for the moderation list. Bumped from 30 to 50 because "load more"
// lets admins pull the whole chat without clicking through pages.
const PAGE_SIZE = 50

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
  const [modTotal, setModTotal] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set())
  const [bannedUsers, setBannedUsers] = useState<Map<string, ChatBan>>(new Map())
  const [showBans, setShowBans] = useState(false)
  const [banTarget, setBanTarget] = useState<{ userId: string; userName: string; eventIds: string[] } | null>(null)
  const [modLoading, setModLoading] = useState(false)
  // Separate flag for "load more" spinner — we want the existing messages to
  // stay visible while the next page loads, not get replaced by skeletons.
  const [modLoadingMore, setModLoadingMore] = useState(false)
  // Filter to a single person across the whole chat. Critical for forensic
  // exports — admin can isolate every message a specific user sent before
  // hitting "Descargar" to get a person-scoped TXT.
  const [userIdFilter, setUserIdFilter] = useState<string | null>(null)
  const [userIdFilterName, setUserIdFilterName] = useState<string | null>(null)

  const userCacheRef = useRef<Record<string, { name: string; avatar: string | null; email: string | null }>>({})
  // Cache of added_by keyed by `${user_id}:${event_id}` (since users can be added
  // to multiple events by different admins, we can't key by user alone).
  const addedByCacheRef = useRef<Record<string, string | null>>({})
  // Per-event chat_enabled state (kill-switch), hydrated from the events list
  const [chatDisabledEventIds, setChatDisabledEventIds] = useState<Set<string>>(new Set())
  // Tracks which events are currently being exported (to show a spinner). Set
  // of event IDs, not a single boolean, so the admin can fire multiple
  // parallel exports without breaking the UI.
  // Special key `general:<venueId>` marks an in-flight export of the
  // venue-wide general chat (which has no event_id).
  const [exportingEventIds, setExportingEventIds] = useState<Set<string>>(new Set())

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

  // Resolve user metadata (name, avatar, email, added_by). Returns rows
  // without the context fields — those get layered on by fetchModMessages,
  // since they're a per-call concern (the same cached user can show up in
  // both private and general chats).
  const resolveUserNames = useCallback(async (msgs: Message[]): Promise<Omit<MessageWithUser, 'contextLabel' | 'contextType'>[]> => {
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
  // Scope includes BOTH:
  //   - Private/institute chat scoped to each active event (event_id IN …)
  //   - General/venue-wide chat for each venue the active events live at
  //     (is_general=true AND venue_id IN …)
  // Previously only private messages were shown, which hid half the moderation
  // surface — incidents in the general chat were invisible to admins here.
  //
  // `offset` param drives "load more": pass 0 to reset, pass current length to
  // append. Keeps the list growing as the admin scrolls, no pagination clicks.
  //
  // NOTE on deps: `activeEventIdsKey`/`activeVenueIdsKey` are stable strings
  // of all IDs in the current view. Using counts here (a prior bug) meant
  // switching from one venue to another with the same event count would keep
  // the OLD IDs in the closure — the UI looked like it changed but kept
  // showing messages from the old venue.
  const activeEventIdsKey = activeEvents.map(e => e.id).sort().join(',')
  const activeVenueIdsKey = [...new Set(activeEvents.map(e => e.venue_id).filter((v): v is string => !!v))].sort().join(',')

  // Map event_id → display label so the badge on each message row can tell the
  // admin WHICH group the message belongs to.
  const eventLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    allEvents.forEach(e => { map[e.id] = e.group_name || e.title })
    return map
  }, [allEvents])

  const venueLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    allVenues.forEach(v => { map[v.id] = v.name })
    return map
  }, [allVenues])

  const fetchModMessages = useCallback(async (offset: number) => {
    if (activeTab !== 'moderation' || activeEventIdsKey === '') {
      setModMessages([]); setModTotal(0); return
    }
    if (offset === 0) setModLoading(true)
    else setModLoadingMore(true)
    try {
      const eventIds = activeEventIdsKey.split(',')
      const venueIds = activeVenueIdsKey ? activeVenueIdsKey.split(',') : []

      // Build PostgREST OR clause: private event messages OR venue-wide general
      // messages. `and(...)` nests an AND inside the top-level OR.
      const orParts: string[] = [`event_id.in.(${eventIds.join(',')})`]
      if (venueIds.length) {
        orParts.push(`and(is_general.eq.true,venue_id.in.(${venueIds.join(',')}))`)
      }

      let query = supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .or(orParts.join(','))
        .order('created_at', { ascending: false })

      if (modSearch.trim()) query = query.ilike('content', `%${modSearch.trim()}%`)
      if (userIdFilter) query = query.eq('user_id', userIdFilter)
      query = query.range(offset, offset + PAGE_SIZE - 1)

      const { data, count, error } = await query
      if (error) throw error

      const rawEnriched = await resolveUserNames(data || [])
      // Layer contextLabel/contextType on top. Done here (not in resolveUserNames)
      // so we can keep that function pure + cache-friendly across tabs.
      const enriched: MessageWithUser[] = rawEnriched.map(m => ({
        ...m,
        contextLabel: m.is_general && m.venue_id
          ? (venueLabelMap[m.venue_id] || 'Venue')
          : (m.event_id ? (eventLabelMap[m.event_id] || 'Grupo') : 'Grupo'),
        contextType: m.is_general ? 'general' : 'private',
      }))
      setModMessages(prev => offset === 0 ? enriched : [...prev, ...enriched])
      setModTotal(count || 0)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setModLoading(false)
      setModLoadingMore(false)
    }
  }, [activeTab, activeEventIdsKey, activeVenueIdsKey, modSearch, userIdFilter, resolveUserNames, eventLabelMap, venueLabelMap])

  // First fetch + refetch on filter change (always from offset 0)
  useEffect(() => { fetchModMessages(0) }, [fetchModMessages])

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

  // Load more → fetch the NEXT slice starting where the list currently ends
  const handleLoadMore = useCallback(() => {
    if (modLoadingMore || modLoading) return
    fetchModMessages(modMessages.length)
  }, [fetchModMessages, modMessages.length, modLoadingMore, modLoading])

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

  // ── Export chat transcript per group (event) ──────────────────────────
  //
  // Downloads every message for a single event as a readable TXT transcript:
  // header with event metadata, participants ranked by volume, then the full
  // timeline with [ANUNCIO] / [FIJADO] / [ELIMINADO] flags.
  //
  // Soft-deleted messages are INCLUDED with an [ELIMINADO] tag — an admin
  // triaging an incident after the fact needs to know what was said even if
  // it's been pulled from the live chat. For routine exports this is almost
  // always a no-op (most chats have zero deleted messages).
  //
  // Paginates in chunks of 1000 (PostgREST's hard ceiling) — handles events
  // with arbitrarily large backlogs without sweeping them under the rug.
  const handleExportGroup = useCallback(async (ev: Event) => {
    if (exportingEventIds.has(ev.id)) return
    setExportingEventIds(prev => { const next = new Set(prev); next.add(ev.id); return next })
    try {
      // 1. Fetch all messages for this event (paginated, include deleted)
      const CHUNK = 1000
      const allMsgs: Message[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('event_id', ev.id)
          .order('created_at', { ascending: true })
          .range(from, from + CHUNK - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allMsgs.push(...data)
        if (data.length < CHUNK) break
        from += CHUNK
      }

      if (allMsgs.length === 0) {
        showError('Este grupo no tiene mensajes')
        return
      }

      // 2. Resolve user metadata (name + email)
      const userIds = [...new Set(allMsgs.map(m => m.user_id))]
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)
      const userMap: Record<string, { name: string; email: string | null }> = {}
      usersData?.forEach(u => {
        userMap[u.id] = { name: u.full_name || 'Usuario', email: u.email }
      })

      // 3. Build participant stats (ranked by message volume)
      const countByUser: Record<string, number> = {}
      allMsgs.forEach(m => { countByUser[m.user_id] = (countByUser[m.user_id] || 0) + 1 })
      const participants = userIds
        .map(uid => ({ uid, count: countByUser[uid] || 0, ...userMap[uid] }))
        .sort((a, b) => b.count - a.count)

      // 4. Resolve venue name (for the header)
      const venueName = allVenues.find(v => v.id === ev.venue_id)?.name || '-'

      // 5. Build the transcript
      const separator = '═'.repeat(63)
      const groupLabel = ev.group_name || ev.title
      const now = new Date()
      const exportedAt = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      const eventDate = new Date(ev.date).toLocaleString('es-ES', {
        timeZone: 'Europe/Madrid',
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })

      const lines: string[] = [
        separator,
        `CHAT — ${groupLabel}`,
        separator,
        '',
        `Evento:         ${ev.title}`,
        `Grupo:          ${ev.group_name || '-'}`,
        `Venue:          ${venueName}`,
        `Fecha evento:   ${eventDate}`,
        `Exportado:      ${exportedAt}`,
        `Mensajes:       ${allMsgs.length}`,
        `Participantes:  ${participants.length}`,
        `Estado del chat: ${ev.chat_enabled === false ? 'DESACTIVADO' : 'Activo'}`,
        '',
        '── Participantes (ordenados por volumen de mensajes) ──',
        '',
      ]
      for (const p of participants) {
        const emailStr = p.email ? ` <${p.email}>` : ''
        lines.push(`  ${String(p.count).padStart(3, ' ')}×  ${p.name}${emailStr}`)
      }
      lines.push('', separator, 'TIMELINE', separator, '')

      for (const m of allMsgs) {
        const u = userMap[m.user_id]
        const time = new Date(m.created_at).toLocaleString('es-ES', {
          timeZone: 'Europe/Madrid',
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        const flags = [
          m.is_announcement && '[ANUNCIO]',
          m.is_pinned && '[FIJADO]',
          m.deleted_at && '[ELIMINADO]',
        ].filter(Boolean).join(' ')
        const name = u?.name || 'Usuario'
        const emailStr = u?.email ? ` <${u.email}>` : ''
        // Email on the SAME line as the name — police/admin needs to trace each
        // individual message back to a person without hunting in the header.
        lines.push(`[${time}] ${name}${emailStr}${flags ? ' ' + flags : ''}`)
        // Indent message body 3 spaces so it reads as a block under the header
        m.content.split('\n').forEach(line => lines.push(`   ${line}`))
        lines.push('')
      }

      // 6. Download as TXT. Slug the group name for the filename so it works
      //    cleanly across OSes (Windows hates most special chars in filenames).
      const slug = groupLabel
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'grupo'
      const dateStamp = toLocalDateKey(ev.date)
      const filename = `chat-${slug}-${dateStamp}.txt`

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      success(`${allMsgs.length} mensajes exportados`)
    } catch (err) {
      console.error('[export group]', err)
      showError('Error al exportar el chat')
    } finally {
      setExportingEventIds(prev => { const next = new Set(prev); next.delete(ev.id); return next })
    }
  }, [allVenues, exportingEventIds, showError, success])

  // Export the venue-wide GENERAL chat (is_general=true, per venue).
  // Mirrors handleExportGroup but scopes the fetch to (venue_id, is_general=true)
  // and keys the spinner with `general:<venueId>` so it doesn't collide with
  // per-event exports in the same UI.
  const handleExportGeneralChat = useCallback(async (venueId: string) => {
    const key = `general:${venueId}`
    if (exportingEventIds.has(key)) return
    const venue = allVenues.find(v => v.id === venueId)
    if (!venue) {
      showError('Venue no encontrado')
      return
    }
    setExportingEventIds(prev => { const next = new Set(prev); next.add(key); return next })
    try {
      const CHUNK = 1000
      const allMsgs: Message[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('venue_id', venueId)
          .eq('is_general', true)
          .order('created_at', { ascending: true })
          .range(from, from + CHUNK - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allMsgs.push(...data)
        if (data.length < CHUNK) break
        from += CHUNK
      }

      if (allMsgs.length === 0) {
        showError('El chat general de este venue no tiene mensajes')
        return
      }

      const userIds = [...new Set(allMsgs.map(m => m.user_id))]
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)
      const userMap: Record<string, { name: string; email: string | null }> = {}
      usersData?.forEach(u => {
        userMap[u.id] = { name: u.full_name || 'Usuario', email: u.email }
      })

      const countByUser: Record<string, number> = {}
      allMsgs.forEach(m => { countByUser[m.user_id] = (countByUser[m.user_id] || 0) + 1 })
      const participants = userIds
        .map(uid => ({ uid, count: countByUser[uid] || 0, ...userMap[uid] }))
        .sort((a, b) => b.count - a.count)

      const separator = '═'.repeat(63)
      const now = new Date()
      const exportedAt = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })

      const lines: string[] = [
        separator,
        `CHAT GENERAL — ${venue.name}`,
        separator,
        '',
        `Venue:          ${venue.name}`,
        `Tipo:           General (venue-wide, todos los grupos)`,
        `Exportado:      ${exportedAt}`,
        `Mensajes:       ${allMsgs.length}`,
        `Participantes:  ${participants.length}`,
        '',
        '── Participantes (ordenados por volumen de mensajes) ──',
        '',
      ]
      for (const p of participants) {
        const emailStr = p.email ? ` <${p.email}>` : ''
        lines.push(`  ${String(p.count).padStart(3, ' ')}×  ${p.name}${emailStr}`)
      }
      lines.push('', separator, 'TIMELINE', separator, '')

      for (const m of allMsgs) {
        const u = userMap[m.user_id]
        const time = new Date(m.created_at).toLocaleString('es-ES', {
          timeZone: 'Europe/Madrid',
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        const flags = [
          m.is_announcement && '[ANUNCIO]',
          m.is_pinned && '[FIJADO]',
          m.deleted_at && '[ELIMINADO]',
        ].filter(Boolean).join(' ')
        const name = u?.name || 'Usuario'
        const emailStr = u?.email ? ` <${u.email}>` : ''
        lines.push(`[${time}] ${name}${emailStr}${flags ? ' ' + flags : ''}`)
        m.content.split('\n').forEach(line => lines.push(`   ${line}`))
        lines.push('')
      }

      const slug = venue.name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'venue'
      const filename = `chat-general-${slug}-${toLocalDateKey(new Date())}.txt`

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      success(`${allMsgs.length} mensajes exportados`)
    } catch (err) {
      console.error('[export general]', err)
      showError('Error al exportar el chat general')
    } finally {
      setExportingEventIds(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }, [allVenues, exportingEventIds, showError, success])

  // Export everything matching the current FILTERED view: same event + venue
  // scope as the moderation list, plus optional user-id and content-search
  // filters. Critical for the "give me everything user X said in this venue"
  // forensic export — the per-event/per-venue exports above are too coarse for
  // that. Output is a single consolidated TXT spanning all visible chats.
  const handleExportFilteredView = useCallback(async () => {
    const key = userIdFilter ? `filtered:${userIdFilter}` : 'filtered:all'
    if (exportingEventIds.has(key)) return
    if (activeEvents.length === 0) {
      showError('Selecciona al menos un evento')
      return
    }
    setExportingEventIds(prev => { const next = new Set(prev); next.add(key); return next })
    try {
      const eventIds = activeEvents.map(e => e.id)
      const venueIds = [...new Set(activeEvents.map(e => e.venue_id).filter((v): v is string => !!v))]

      const orParts: string[] = [`event_id.in.(${eventIds.join(',')})`]
      if (venueIds.length) {
        orParts.push(`and(is_general.eq.true,venue_id.in.(${venueIds.join(',')}))`)
      }

      const CHUNK = 1000
      const allMsgs: Message[] = []
      let from = 0
      while (true) {
        let q = supabase
          .from('messages')
          .select('*')
          .or(orParts.join(','))
          .order('created_at', { ascending: true })
          .range(from, from + CHUNK - 1)
        if (userIdFilter) q = q.eq('user_id', userIdFilter)
        if (modSearch.trim()) q = q.ilike('content', `%${modSearch.trim()}%`)
        const { data, error } = await q
        if (error) throw error
        if (!data || data.length === 0) break
        allMsgs.push(...data)
        if (data.length < CHUNK) break
        from += CHUNK
      }

      if (allMsgs.length === 0) {
        showError('No hay mensajes que coincidan con el filtro')
        return
      }

      const userIds = [...new Set(allMsgs.map(m => m.user_id))]
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)
      const userMap: Record<string, { name: string; email: string | null }> = {}
      usersData?.forEach(u => {
        userMap[u.id] = { name: u.full_name || 'Usuario', email: u.email }
      })

      const countByUser: Record<string, number> = {}
      allMsgs.forEach(m => { countByUser[m.user_id] = (countByUser[m.user_id] || 0) + 1 })
      const participants = userIds
        .map(uid => ({ uid, count: countByUser[uid] || 0, ...userMap[uid] }))
        .sort((a, b) => b.count - a.count)

      const separator = '═'.repeat(63)
      const now = new Date()
      const exportedAt = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
      const filterDesc: string[] = []
      if (userIdFilterName) filterDesc.push(`Usuario: ${userIdFilterName}`)
      if (modSearch.trim()) filterDesc.push(`Texto: "${modSearch.trim()}"`)
      const eventLabels = activeEvents.map(e => e.group_name || e.title).join(', ')
      const venueLabels = venueIds.map(vid => venueLabelMap[vid]).filter(Boolean).join(', ')

      const lines: string[] = [
        separator,
        userIdFilterName
          ? `CHAT FILTRADO — ${userIdFilterName}`
          : `CHAT FILTRADO — Vista actual`,
        separator,
        '',
        `Exportado:      ${exportedAt}`,
        `Mensajes:       ${allMsgs.length}`,
        `Participantes:  ${participants.length}`,
        `Eventos:        ${eventLabels || '-'}`,
        `Venues:         ${venueLabels || '-'}`,
        ...(filterDesc.length ? [`Filtros:        ${filterDesc.join(' · ')}`] : []),
        '',
        '── Participantes (ordenados por volumen de mensajes) ──',
        '',
      ]
      for (const p of participants) {
        const emailStr = p.email ? ` <${p.email}>` : ''
        lines.push(`  ${String(p.count).padStart(3, ' ')}×  ${p.name}${emailStr}`)
      }
      lines.push('', separator, 'TIMELINE', separator, '')

      for (const m of allMsgs) {
        const u = userMap[m.user_id]
        const time = new Date(m.created_at).toLocaleString('es-ES', {
          timeZone: 'Europe/Madrid',
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
        const ctx = m.is_general && m.venue_id
          ? `GENERAL · ${venueLabelMap[m.venue_id] || 'Venue'}`
          : (m.event_id ? `PRIVADO · ${eventLabelMap[m.event_id] || 'Grupo'}` : '?')
        const flags = [
          m.is_announcement && '[ANUNCIO]',
          m.is_pinned && '[FIJADO]',
          m.deleted_at && '[ELIMINADO]',
        ].filter(Boolean).join(' ')
        const name = u?.name || 'Usuario'
        const emailStr = u?.email ? ` <${u.email}>` : ''
        lines.push(`[${time}] [${ctx}] ${name}${emailStr}${flags ? ' ' + flags : ''}`)
        m.content.split('\n').forEach(line => lines.push(`   ${line}`))
        lines.push('')
      }

      const slug = (userIdFilterName || 'vista-filtrada')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'filtrado'
      const filename = `chat-filtrado-${slug}-${toLocalDateKey(new Date())}.txt`

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      success(`${allMsgs.length} mensajes exportados`)
    } catch (err) {
      console.error('[export filtered]', err)
      showError('Error al exportar la vista filtrada')
    } finally {
      setExportingEventIds(prev => { const next = new Set(prev); next.delete(key); return next })
    }
  }, [activeEvents, userIdFilter, userIdFilterName, modSearch, exportingEventIds, eventLabelMap, venueLabelMap, showError, success])

  // Export every active event's chat sequentially. We pause 250ms between
  // downloads because some browsers (Safari, older Firefox) throttle rapid
  // consecutive downloads as a phishing mitigation — a small gap makes the
  // whole batch reliable without user intervention.
  // Also downloads each active venue's general chat at the end.
  const handleExportAllGroups = useCallback(async () => {
    for (const ev of activeEvents) {
      await handleExportGroup(ev)
      await new Promise(r => setTimeout(r, 250))
    }
    const venueIds = [...new Set(activeEvents.map(e => e.venue_id).filter((v): v is string => !!v))]
    for (const vid of venueIds) {
      await handleExportGeneralChat(vid)
      await new Promise(r => setTimeout(r, 250))
    }
  }, [activeEvents, handleExportGroup, handleExportGeneralChat])

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
    // Optimistic: drop the message from the visible list without refetching.
    // The list stays scrolled where the admin left it.
    setModMessages(prev => prev.filter(m => m.id !== msgId))
    setModTotal(prev => Math.max(0, prev - 1))
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
    const nextPinned = !msg.is_pinned
    const { error } = await supabase.from('messages').update({ is_pinned: nextPinned }).eq('id', msg.id)
    if (error) { showError('Error'); return }
    success(msg.is_pinned ? 'Desfijado' : 'Fijado')
    // Optimistic in-place toggle — keeps list stable, no jumpy refetch.
    setModMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_pinned: nextPinned } : m))
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Comunicacion</h1>
        <p className="text-sm text-white-muted mt-0.5">Comunicados, anuncios y moderacion</p>
      </div>

      {/* Day + Venue navigation — pill rails instead of cramped dropdowns.
          Horizontally scrollable so it scales to many dates/venues without
          collapsing into a menu. Always visible so the admin can pivot
          between days/venues without hunting for the filters. */}
      {dates.length > 0 && (
        <div className="space-y-2.5">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-white-muted uppercase tracking-wider mb-1.5 px-0.5">
              <Calendar className="w-3 h-3" /> Dia
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
              {dates.map(d => {
                const isSel = selectedDate === d
                const dateObj = new Date(d + 'T12:00:00')
                const today = toLocalDateKey(new Date())
                const isToday = d === today
                const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'short' })
                const dayNum = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className={cn(
                      'shrink-0 flex flex-col items-center gap-0.5 px-3.5 py-2 rounded-xl border transition-all min-w-[64px]',
                      isSel
                        ? 'border-primary bg-primary/12 text-primary'
                        : 'border-black-border text-white-muted hover:border-white/15 hover:text-white'
                    )}
                  >
                    <span className={cn('text-[10px] uppercase font-semibold leading-tight', isSel ? 'text-primary/80' : 'text-white/40')}>
                      {isToday ? 'Hoy' : weekday}
                    </span>
                    <span className="text-xs font-bold leading-tight">{dayNum}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {venuesForDate.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-white-muted uppercase tracking-wider mb-1.5 px-0.5">
                <MapPin className="w-3 h-3" /> Venue
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
                <button
                  onClick={() => setSelectedVenueId(null)}
                  className={cn(
                    'shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    selectedVenueId === null
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-black-border text-white-muted hover:border-white/15 hover:text-white'
                  )}
                >
                  Todos
                </button>
                {venuesForDate.map(v => {
                  const isSel = selectedVenueId === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVenueId(v.id)}
                      className={cn(
                        'shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                        isSel
                          ? 'border-primary bg-primary/12 text-primary'
                          : 'border-black-border text-white-muted hover:border-white/15 hover:text-white'
                      )}
                    >
                      {v.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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

          {/* Export chat per group — one TXT per event, or batch-download all.
              Lives under the kill-switch because that's where admins go when
              something needs after-the-fact triage and the transcript matters. */}
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-black-border">
              <Download className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-white">Exportar conversaciones</h3>
              {activeEvents.length > 1 && (
                <button
                  onClick={handleExportAllGroups}
                  disabled={exportingEventIds.size > 0}
                  className="ml-auto text-[11px] font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Descarga un TXT por cada grupo, uno detras de otro"
                >
                  {exportingEventIds.size > 0 ? `Descargando ${exportingEventIds.size}...` : 'Descargar todos'}
                </button>
              )}
              <span className={cn(
                'text-[10px] text-white-muted',
                activeEvents.length > 1 ? '' : 'ml-auto'
              )}>
                Transcripcion completa · TXT
              </span>
            </div>
            <div className="divide-y divide-black-border">
              {/* Per-event PRIVATE chats (institute group) */}
              {activeEvents.map(ev => {
                const isExporting = exportingEventIds.has(ev.id)
                return (
                  <div key={ev.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Lock className="w-2.5 h-2.5 text-white/40 shrink-0" />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-white/40">Privado</span>
                      </div>
                      <p className="text-sm text-white truncate">
                        {ev.group_name || ev.title}
                      </p>
                      <p className="text-[11px] text-white-muted mt-0.5">
                        {new Date(ev.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleExportGroup(ev)}
                      disabled={isExporting}
                      className={cn(
                        'text-[11px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 transition-colors',
                        isExporting
                          ? 'bg-white/5 text-white-muted cursor-wait'
                          : 'bg-primary/10 text-primary hover:bg-primary/15',
                      )}
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Descargando
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          Descargar
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
              {/* Per-venue GENERAL chats (venue-wide, all groups). Same row UI
                  but keyed by `general:<venueId>` to avoid collision with the
                  per-event spinner. THIS is the chat the user said wasn't
                  appearing — it has no event_id, so the per-event loop above
                  never produced a row for it. */}
              {[...new Set(activeEvents.map(e => e.venue_id).filter((v): v is string => !!v))].map(vid => {
                const venue = allVenues.find(v => v.id === vid)
                if (!venue) return null
                const key = `general:${vid}`
                const isExporting = exportingEventIds.has(key)
                return (
                  <div key={key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Globe className="w-2.5 h-2.5 text-emerald-400/70 shrink-0" />
                        <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-400/70">General · Venue</span>
                      </div>
                      <p className="text-sm text-white truncate">
                        Chat general — {venue.name}
                      </p>
                      <p className="text-[11px] text-white-muted mt-0.5">
                        Todos los grupos del venue
                      </p>
                    </div>
                    <button
                      onClick={() => handleExportGeneralChat(vid)}
                      disabled={isExporting}
                      className={cn(
                        'text-[11px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 transition-colors',
                        isExporting
                          ? 'bg-white/5 text-white-muted cursor-wait'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/15',
                      )}
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Descargando
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          Descargar
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <SearchInput value={modSearch} onChange={setModSearch} placeholder="Buscar en mensajes..." />

          {/* Active user filter — appears only when admin has clicked a name.
              Lets the admin isolate every message a single person sent (across
              private + general). Critical for forensic exports. */}
          {userIdFilter && (
            <div className="card p-3 flex items-center gap-2 flex-wrap border-primary/30 bg-primary/5">
              <span className="text-[11px] text-white-muted">Filtrando mensajes de</span>
              <span className="text-sm font-semibold text-primary">{userIdFilterName || 'Usuario'}</span>
              <button
                onClick={handleExportFilteredView}
                disabled={exportingEventIds.size > 0}
                className="ml-auto text-[11px] font-medium px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {exportingEventIds.has(`filtered:${userIdFilter}`) ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Exportando</>
                ) : (
                  <><Download className="w-3 h-3" /> Exportar TXT</>
                )}
              </button>
              <button
                onClick={() => { setUserIdFilter(null); setUserIdFilterName(null) }}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-white/5 text-white-muted hover:bg-white/10 hover:text-white transition-colors"
              >
                Quitar filtro
              </button>
            </div>
          )}

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
                          {/* Click name → filter to this user across the whole
                              chat. Cursor is a pointer + underline-on-hover so
                              the affordance is obvious. */}
                          <button
                            onClick={() => { setUserIdFilter(msg.user_id); setUserIdFilterName(msg.userName) }}
                            className="text-sm font-medium text-white hover:text-primary hover:underline transition-colors"
                            title="Filtrar mensajes de este usuario"
                          >
                            {msg.userName}
                          </button>
                          {isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold">BANEADO</span>}
                          {isMuted && !isBanned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400">Silenciado</span>}
                          {msg.is_pinned && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Fijado</span>}
                          <span className="text-[10px] text-white-muted ml-auto">{formatDate(msg.created_at)}</span>
                        </div>
                        {/* Context badge — tells the moderator at a glance
                            which chat (private group vs venue-wide general)
                            this message belongs to. Without it, two messages
                            from the same person in different chats look
                            identical. */}
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                            msg.contextType === 'general'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-white/5 text-white/70'
                          )}>
                            {msg.contextType === 'general' ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            {msg.contextType === 'general' ? 'GENERAL' : 'PRIVADO'}
                            <span className="text-white/50 font-normal">·</span>
                            <span className="font-medium truncate max-w-[180px]">{msg.contextLabel}</span>
                          </span>
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

          {/* Counter + "Cargar más" — replaces page-by-page pagination. The
              admin scrolls one continuous list and pulls more when they hit
              the end; far less friction than clicking through pages. */}
          {modMessages.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-[11px] text-white-muted">
                Mostrando <span className="text-white font-medium">{modMessages.length}</span> de <span className="text-white font-medium">{modTotal}</span> mensajes
              </span>
              {modMessages.length < modTotal && (
                <button
                  onClick={handleLoadMore}
                  disabled={modLoadingMore}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/5 text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5 transition-colors"
                >
                  {modLoadingMore ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Cargando</>
                  ) : (
                    <>Cargar más <ChevronRight className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>
          )}

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
