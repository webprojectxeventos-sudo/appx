'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface RealtimeSubscription {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  schema?: string
  table: string
  filter?: string
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
}

interface UseRealtimeChannelOptions {
  /** Unique channel name (should include dynamic id) */
  channelName: string
  /** Array of postgres_changes subscriptions */
  subscriptions: RealtimeSubscription[]
  /** Whether the subscription is enabled (e.g. depends on event.id being loaded) */
  enabled?: boolean
  /** Pause when tab is hidden (default: true) */
  pauseOnHidden?: boolean
}

/**
 * Hook that manages a Supabase Realtime channel with:
 * - Automatic cleanup on unmount
 * - Visibility-based pause/resume to reduce connection costs
 * - Dynamic channel naming to prevent collisions
 */
export function useRealtimeChannel({
  channelName,
  subscriptions,
  enabled = true,
  pauseOnHidden = true,
}: UseRealtimeChannelOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  const subscribe = useCallback(() => {
    if (channelRef.current) return // Already subscribed

    let channel = supabase.channel(channelName)
    for (const sub of subscriptions) {
      channel = channel.on(
        'postgres_changes' as never,
        {
          event: sub.event,
          schema: sub.schema || 'public',
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        } as never,
        sub.callback as never,
      )
    }
    channel.subscribe()
    channelRef.current = channel
  }, [channelName, subscriptions])

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  // Main effect: subscribe when enabled, cleanup on unmount
  useEffect(() => {
    if (!enabled) return
    subscribe()
    return unsubscribe
  }, [enabled, subscribe, unsubscribe])

  // Visibility effect: pause when tab is hidden
  useEffect(() => {
    if (!pauseOnHidden || !enabled) return

    const handleVisibility = () => {
      if (document.hidden) {
        unsubscribe()
      } else {
        subscribe()
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [pauseOnHidden, enabled, subscribe, unsubscribe])
}
