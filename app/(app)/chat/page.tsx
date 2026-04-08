'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { filterProfanity } from '@/lib/profanity-filter'
import { notifyAnnouncement, requestNotificationPermission } from '@/lib/notifications'
import type { Database } from '@/lib/types'
import { MessageCircle, Send, Megaphone, ChevronDown, Bell, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const REACTION_EMOJIS = ['🔥', '❤️', '🎉', '👏', '😂']

// Generate a consistent color from a user ID
function userColor(userId: string): string {
  const colors = [
    '#E57373', '#F06292', '#BA68C8', '#9575CD',
    '#7986CB', '#64B5F6', '#4FC3F7', '#4DD0E1',
    '#4DB6AC', '#81C784', '#AED581', '#DCE775',
    '#FFD54F', '#FFB74D', '#FF8A65', '#A1887F',
  ]
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

type Message = Database['public']['Tables']['messages']['Row']

interface ReactionCount {
  emoji: string
  count: number
  hasReacted: boolean
}

interface MessageWithData extends Message {
  sender_name: string | null
  reactions: ReactionCount[]
}

const MAX_MSG_LENGTH = 500
const COOLDOWN_MS = 3000         // 3s between messages
const SPAM_COOLDOWN_MS = 15000   // 15s if spamming
const RATE_LIMIT_COUNT = 10      // max messages per window
const RATE_LIMIT_WINDOW = 60000  // 1 minute window

type ChatTab = 'private' | 'general'

export default function ChatPage() {
  const { user, profile, event, venue, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<ChatTab>('private')
  const [messages, setMessages] = useState<MessageWithData[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [showReactionsFor, setShowReactionsFor] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [announcementToast, setAnnouncementToast] = useState<string | null>(null)
  const [notifPermission, setNotifPermission] = useState<'default' | 'granted' | 'denied'>('default')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Rate limiting refs (persist across renders, don't trigger re-renders)
  const sentTimestamps = useRef<number[]>([])
  const lastSentContent = useRef<string>('')
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const cooldownEnd = useRef(0)
  const prevAnnouncementCount = useRef(0)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstLoad = useRef(true)

  const startCooldown = useCallback((ms: number) => {
    cooldownEnd.current = Date.now() + ms
    setCooldownLeft(Math.ceil(ms / 1000))
    if (cooldownTimer.current) clearInterval(cooldownTimer.current)
    cooldownTimer.current = setInterval(() => {
      const remaining = cooldownEnd.current - Date.now()
      if (remaining <= 0) {
        setCooldownLeft(0)
        if (cooldownTimer.current) clearInterval(cooldownTimer.current)
        cooldownTimer.current = null
      } else {
        setCooldownLeft(Math.ceil(remaining / 1000))
      }
    }, 250)
  }, [])

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current)
      if (toastTimeout.current) clearTimeout(toastTimeout.current)
    }
  }, [])

  // Check notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission as 'default' | 'granted' | 'denied')
    }
  }, [])

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Show scroll-to-bottom button when user scrolls up
  const handleScroll = () => {
    const el = messagesContainerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    setShowScrollBtn(!isNearBottom)
  }

  // Close reaction picker when tapping outside
  useEffect(() => {
    if (!showReactionsFor) return
    const handler = (e: TouchEvent | MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-reaction-picker]') && !target.closest('[data-reaction-trigger]')) {
        setShowReactionsFor(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [showReactionsFor])

  // Fetch messages with sender names and reactions
  const fetchMessages = useCallback(async () => {
    if (!user?.id) return
    if (activeTab === 'private' && !event?.id) return
    if (activeTab === 'general' && !venue?.id) return

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })

      if (activeTab === 'private') {
        query = query.eq('event_id', event!.id).eq('is_general', false)
      } else {
        query = query.eq('venue_id', venue!.id).eq('is_general', true)
      }

      const { data: msgData, error: msgError } = await query

      if (msgError) {
        console.error('Error fetching messages:', msgError)
        return
      }

      if (!msgData || msgData.length === 0) {
        setMessages([])
        return
      }

      // Fetch all sender names in one query
      const userIds = [...new Set(msgData.map((m) => m.user_id))]
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', userIds)

      const nameMap: Record<string, string | null> = {}
      usersData?.forEach((u) => (nameMap[u.id] = u.full_name))

      // Fetch all reactions in one query (skip if no messages)
      let reactionsData: Database['public']['Tables']['message_reactions']['Row'][] = []
      const messageIds = msgData.map((m) => m.id)
      if (messageIds.length > 0) {
        const { data, error: reactError } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds)

        if (reactError) {
          console.error('Error fetching reactions:', reactError)
        } else {
          reactionsData = data || []
        }
      }

      // Group reactions by message
      const reactionsMap: Record<string, ReactionCount[]> = {}
      messageIds.forEach((id) => {
        const msgReactions = reactionsData.filter((r) => r.message_id === id)
        const emojiCounts: Record<string, { count: number; hasReacted: boolean }> = {}

        msgReactions.forEach((r) => {
          if (!emojiCounts[r.emoji]) {
            emojiCounts[r.emoji] = { count: 0, hasReacted: false }
          }
          emojiCounts[r.emoji].count++
          if (r.user_id === user.id) {
            emojiCounts[r.emoji].hasReacted = true
          }
        })

        reactionsMap[id] = Object.entries(emojiCounts).map(([emoji, data]) => ({
          emoji,
          ...data,
        }))
      })

      setMessages(
        msgData.map((m) => ({
          ...m,
          sender_name: nameMap[m.user_id] || null,
          reactions: reactionsMap[m.id] || [],
        }))
      )
    } catch (err) {
      console.error('Error fetching messages:', err)
    }
  }, [event?.id, venue?.id, user?.id, activeTab])

  // Detect new announcements and fire notification
  useEffect(() => {
    const announcements = messages.filter((m) => m.is_announcement)
    const count = announcements.length

    if (isFirstLoad.current) {
      // Don't notify on first load, just record the count
      prevAnnouncementCount.current = count
      isFirstLoad.current = false
      return
    }

    if (count > prevAnnouncementCount.current) {
      const latest = announcements[announcements.length - 1]
      if (latest) {
        notifyAnnouncement(latest.content)
        setAnnouncementToast(latest.content)
        if (toastTimeout.current) clearTimeout(toastTimeout.current)
        toastTimeout.current = setTimeout(() => setAnnouncementToast(null), 6000)
      }
    }
    prevAnnouncementCount.current = count
  }, [messages])

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission()
    setNotifPermission(granted ? 'granted' : 'denied')
  }

  // Initial fetch + realtime subscription
  useEffect(() => {
    if (activeTab === 'private' && !event?.id) return
    if (activeTab === 'general' && !venue?.id) return
    let cancelled = false

    setIsLoadingMessages(true)
    fetchMessages().finally(() => {
      if (!cancelled) setIsLoadingMessages(false)
    })

    const channelId = activeTab === 'private' ? `chat-private-${event?.id}` : `chat-general-${venue?.id}`
    const filter = activeTab === 'private'
      ? `event_id=eq.${event!.id}`
      : `venue_id=eq.${venue!.id}`

    const msgChannel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter,
        },
        () => fetchMessages()
      )
      .subscribe()

    const reactChannel = supabase
      .channel(`chat-reactions-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        () => fetchMessages()
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(reactChannel)
    }
  }, [event?.id, venue?.id, activeTab, fetchMessages])

  const handleSendMessage = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || !user?.id || isSending || cooldownLeft > 0) return
    if (activeTab === 'private' && !event?.id) return
    if (activeTab === 'general' && !venue?.id) return

    // Max length check
    if (trimmed.length > MAX_MSG_LENGTH) {
      setInputValue(trimmed.slice(0, MAX_MSG_LENGTH))
      return
    }

    // Anti-flood: block exact duplicate messages
    if (trimmed.toLowerCase() === lastSentContent.current.toLowerCase()) {
      startCooldown(COOLDOWN_MS)
      return
    }

    // Rate limit: check messages in last minute
    const now = Date.now()
    sentTimestamps.current = sentTimestamps.current.filter((t) => now - t < RATE_LIMIT_WINDOW)
    if (sentTimestamps.current.length >= RATE_LIMIT_COUNT) {
      startCooldown(SPAM_COOLDOWN_MS)
      return
    }

    setIsSending(true)
    try {
      const filteredContent = filterProfanity(trimmed)

      const insertData = activeTab === 'private'
        ? {
            content: filteredContent,
            user_id: user.id,
            event_id: event!.id,
            is_announcement: false,
            is_general: false,
          }
        : {
            content: filteredContent,
            user_id: user.id,
            venue_id: venue!.id,
            is_announcement: false,
            is_general: true,
          }

      const { error } = await supabase.from('messages').insert(insertData)

      if (error) {
        console.error('Error sending message:', error)
        return
      }

      setInputValue('')
      lastSentContent.current = trimmed.toLowerCase()
      sentTimestamps.current.push(now)
      startCooldown(COOLDOWN_MS)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!user?.id) return

    const message = messages.find((m) => m.id === messageId)
    const existing = message?.reactions.find((r) => r.emoji === emoji && r.hasReacted)

    try {
      if (existing) {
        await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', user.id)
          .eq('emoji', emoji)
      } else {
        await supabase.from('message_reactions').insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        })
      }
      setShowReactionsFor(null)
    } catch (err) {
      console.error('Error toggling reaction:', err)
    }
  }

  if (authLoading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black-border">
          <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            <div className="h-3 w-32 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'gap-2'}`}>
              {i % 2 !== 0 && <div className="w-7 h-7 rounded-full bg-white/5 animate-pulse flex-shrink-0" />}
              <div className={`h-10 rounded-2xl bg-white/5 animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-40'}`} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!event?.id) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0a0a]">
        <MessageCircle className="h-10 w-10 mb-3 text-white-muted" />
        <p className="text-white-muted text-sm">No hay evento disponible</p>
      </div>
    )
  }

  const getInitials = (name: string | null | undefined): string => {
    if (!name) return '?'
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  // Separate announcements and chat messages
  const announcements = messages.filter((m) => m.is_announcement)
  const chatMessages = messages.filter((m) => !m.is_announcement)

  return (
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
        style={{
          background: 'linear-gradient(180deg, rgba(17,17,17,0.98) 0%, rgba(10,10,10,0.95) 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #E41E2B 0%, #C41824 100%)' }}
        >
          <MessageCircle className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-semibold text-white truncate">Chat en Vivo</h1>
          <p className="text-[11px] text-gray-500 truncate">
            {activeTab === 'general' && venue ? venue.name : event.title}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#4CAF50' }} />
            <span className="text-[11px] text-gray-500">En directo</span>
          </div>
          {notifPermission === 'default' && (
            <button
              onClick={enableNotifications}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: 'rgba(228,30,43,0.12)', border: '1px solid rgba(228,30,43,0.25)' }}
              title="Activar notificaciones"
            >
              <Bell className="h-3.5 w-3.5 text-primary" />
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher — only show if venue exists */}
      {venue?.id && (
        <div
          className="flex-shrink-0 flex"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <button
            onClick={() => { setActiveTab('private'); setMessages([]) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors',
              activeTab === 'private'
                ? 'text-white border-b-2 border-primary'
                : 'text-gray-500 hover:text-gray-400'
            )}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Mi Instituto
          </button>
          <button
            onClick={() => { setActiveTab('general'); setMessages([]) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium transition-colors',
              activeTab === 'general'
                ? 'text-white border-b-2 border-purple-500'
                : 'text-gray-500 hover:text-gray-400'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            General
          </button>
        </div>
      )}

      {/* Announcement toast */}
      {announcementToast && (
        <div className="absolute top-16 left-3 right-3 z-40 animate-scale-in">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#1a1a1a]/95 backdrop-blur-2xl border border-primary/20 shadow-[0_8px_32px_rgba(228,30,43,0.12)]">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Megaphone className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-primary tracking-wide uppercase mb-0.5">Nuevo anuncio</p>
              <p className="text-[13px] text-white/90 leading-snug line-clamp-3">{announcementToast}</p>
            </div>
            <button
              onClick={() => setAnnouncementToast(null)}
              className="text-white/30 hover:text-white transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pinned Announcements Bar — only in private tab */}
      {activeTab === 'private' && announcements.length > 0 && (
        <div className="flex-shrink-0 overflow-hidden transition-all bg-gradient-to-b from-primary/[0.06] to-transparent border-b border-primary/10">
          <button
            onClick={() => setShowAllAnnouncements(!showAllAnnouncements)}
            className="w-full px-4 py-2.5 text-left active:bg-primary/5 transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Megaphone className="h-3 w-3 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/80 leading-snug line-clamp-2">
                  {announcements[announcements.length - 1].content}
                </p>
                {announcements.length > 1 && (
                  <p className="text-[10px] mt-0.5 text-primary/50">
                    {showAllAnnouncements ? 'Toca para cerrar' : `+${announcements.length - 1} anuncio${announcements.length - 1 > 1 ? 's' : ''} mas`}
                  </p>
                )}
              </div>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 flex-shrink-0 mt-0.5 transition-transform text-primary/40',
                  showAllAnnouncements && 'rotate-180'
                )}
              />
            </div>
          </button>

          {/* Expanded announcements list */}
          {showAllAnnouncements && (
            <div className="px-4 pb-3 space-y-2 animate-scale-in">
              {[...announcements].reverse().map((ann, i) => {
                const time = new Date(ann.created_at).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <div
                    key={ann.id}
                    className={cn(
                      'pl-6 py-2 border-l-2',
                      i === 0 ? 'border-l-primary/40' : 'border-l-white/[0.06]'
                    )}
                  >
                    <p className="text-[12px] text-white/70 leading-snug">{ann.content}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">{time}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 relative"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(228,30,43,0.015) 0%, transparent 70%)',
        }}
      >
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent" style={{ borderTopColor: '#E41E2B', borderRightColor: '#E41E2B' }} />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(228,30,43,0.08)' }}>
              <MessageCircle className="h-7 w-7" style={{ color: 'rgba(228,30,43,0.3)' }} />
            </div>
            <p className="text-gray-500 text-sm">No hay mensajes todavia</p>
            <p className="text-gray-700 text-xs mt-1">
              {activeTab === 'general' ? 'Escribe algo para todos los del venue' : 'Se el primero en escribir algo'}
            </p>
          </div>
        ) : (
          <>
            {/* Chat messages */}
            {chatMessages.map((message, idx) => {
              const isOwn = message.user_id === user?.id
              const prevMessage = idx > 0 ? chatMessages[idx - 1] : null
              const isConsecutive = prevMessage?.user_id === message.user_id
              const msgDate = new Date(message.created_at)
              const time = msgDate.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit',
              })
              const color = userColor(message.user_id)

              // Show date separator for different days
              const prevDate = prevMessage ? new Date(prevMessage.created_at) : null
              const isDifferentDay = !prevDate ||
                msgDate.toDateString() !== prevDate.toDateString()

              // Time gap > 10 min breaks consecutive grouping
              const timeDiff = prevMessage
                ? msgDate.getTime() - new Date(prevMessage.created_at).getTime()
                : Infinity
              const isTimeSeparated = timeDiff > 10 * 60 * 1000

              const showHeader = !isConsecutive || isTimeSeparated

              // Format date label
              const dateLabel = (() => {
                const today = new Date()
                const yesterday = new Date(today)
                yesterday.setDate(yesterday.getDate() - 1)
                if (msgDate.toDateString() === today.toDateString()) return 'Hoy'
                if (msgDate.toDateString() === yesterday.toDateString()) return 'Ayer'
                return msgDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
              })()

              return (
                <div key={message.id} className={cn(showHeader ? 'mt-2.5' : 'mt-[3px]')}>
                  {/* Date separator */}
                  {isDifferentDay && (
                    <div className="flex items-center justify-center my-3">
                      <span
                        className="text-[10px] font-medium px-3 py-1 rounded-full"
                        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
                      >
                        {dateLabel}
                      </span>
                    </div>
                  )}

                  <div className={cn('flex gap-1.5', isOwn ? 'flex-row-reverse' : 'flex-row')}>
                    {/* Avatar */}
                    {showHeader && !isOwn ? (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-auto mb-0.5"
                        style={{ backgroundColor: `${color}18`, border: `1.5px solid ${color}30` }}
                      >
                        <span className="text-[9px] font-bold" style={{ color }}>{getInitials(message.sender_name)}</span>
                      </div>
                    ) : !isOwn ? (
                      <div className="w-7 flex-shrink-0" />
                    ) : null}

                    {/* Message content */}
                    <div className={cn('max-w-[80%] min-w-[48px]')}>
                      {/* Sender name */}
                      {showHeader && !isOwn && (
                        <p className="text-[11px] font-medium mb-0.5 ml-0.5" style={{ color }}>
                          {message.sender_name || 'Usuario'}
                        </p>
                      )}

                      {/* Bubble */}
                      <div
                        className={cn(
                          'relative px-3 py-[7px] break-words',
                          isOwn
                            ? showHeader ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-r-sm'
                            : showHeader ? 'rounded-2xl rounded-bl-sm' : 'rounded-2xl rounded-l-sm',
                        )}
                        style={{
                          background: isOwn
                            ? 'linear-gradient(135deg, #E41E2B 0%, #C41824 100%)'
                            : 'rgba(255,255,255,0.08)',
                        }}
                        onDoubleClick={() =>
                          setShowReactionsFor(showReactionsFor === message.id ? null : message.id)
                        }
                      >
                        <p
                          className="text-[14px] leading-[1.4] inline"
                          style={{ color: isOwn ? '#fff' : '#eee' }}
                        >
                          {message.content}
                        </p>
                        <span
                          className={cn(
                            'text-[10px] ml-2 float-right mt-[5px] leading-none whitespace-nowrap',
                            isOwn ? 'text-white/50' : 'text-white/30'
                          )}
                        >
                          {time}
                        </span>
                      </div>

                      {/* Reactions row */}
                      {(message.reactions.length > 0 || showReactionsFor === message.id) && (
                        <div className={cn('flex items-center gap-1 mt-0.5 flex-wrap', isOwn && 'justify-end')}>
                          {message.reactions.map((r) => (
                            <button
                              key={r.emoji}
                              onClick={() => handleReaction(message.id, r.emoji)}
                              className="h-[22px] px-1.5 rounded-full text-[11px] flex items-center gap-0.5 active:scale-90 transition-transform"
                              style={{
                                backgroundColor: r.hasReacted ? 'rgba(212,168,67,0.18)' : 'rgba(255,255,255,0.05)',
                                border: r.hasReacted ? '1px solid rgba(212,168,67,0.3)' : '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              <span style={{ fontSize: '11px' }}>{r.emoji}</span>
                              <span className={r.hasReacted ? 'text-amber-400/70' : 'text-gray-600'} style={{ fontSize: '10px' }}>{r.count}</span>
                            </button>
                          ))}

                          {showReactionsFor === message.id && (
                            <div
                              data-reaction-picker
                              className="flex gap-0.5 px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(25,25,25,0.97)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}
                            >
                              {REACTION_EMOJIS.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => handleReaction(message.id, emoji)}
                                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-90 transition-all text-sm"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
        <div ref={messagesEndRef} />

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="fixed bottom-24 right-4 w-9 h-9 rounded-full flex items-center justify-center shadow-lg z-20 active:scale-90 transition-transform"
            style={{ backgroundColor: 'rgba(30,30,30,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <div
        className="flex-shrink-0 px-3 py-2.5 safe-area-bottom"
        style={{
          background: 'linear-gradient(180deg, rgba(15,15,15,0.95) 0%, rgba(10,10,10,0.98) 100%)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Character count warning */}
        {inputValue.length > MAX_MSG_LENGTH * 0.8 && (
          <div className="flex justify-end px-1 pb-1">
            <span className={cn(
              'text-[10px] font-medium',
              inputValue.length > MAX_MSG_LENGTH ? 'text-red-400' : 'text-white-muted'
            )}>
              {inputValue.length}/{MAX_MSG_LENGTH}
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div
            className="flex-1 rounded-2xl overflow-hidden transition-all"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <input
              type="text"
              placeholder={cooldownLeft > 0 ? `Espera ${cooldownLeft}s...` : 'Mensaje...'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.slice(0, MAX_MSG_LENGTH + 50))}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              maxLength={MAX_MSG_LENGTH + 50}
              className="w-full px-4 py-2.5 text-[14px] text-white placeholder:text-gray-600 bg-transparent focus:outline-none"
              style={{ caretColor: '#E41E2B' }}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isSending || cooldownLeft > 0 || inputValue.length > MAX_MSG_LENGTH}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
              cooldownLeft > 0
                ? 'opacity-50'
                : inputValue.trim() && inputValue.length <= MAX_MSG_LENGTH
                  ? 'opacity-100 active:scale-90'
                  : 'opacity-30'
            )}
            style={{
              background: cooldownLeft > 0
                ? 'rgba(255,255,255,0.1)'
                : inputValue.trim() && inputValue.length <= MAX_MSG_LENGTH
                  ? 'linear-gradient(135deg, #E41E2B 0%, #C41824 100%)'
                  : 'rgba(228,30,43,0.3)',
            }}
          >
            {cooldownLeft > 0 ? (
              <span className="text-[11px] font-bold text-white-muted">{cooldownLeft}</span>
            ) : (
              <Send className="h-4 w-4 text-white" strokeWidth={2.5} style={{ marginLeft: '1px' }} />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
