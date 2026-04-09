'use client'

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'

type UserProfile = Database['public']['Tables']['users']['Row']
type Event = Database['public']['Tables']['events']['Row']
type Organization = Database['public']['Tables']['organizations']['Row']
type Venue = Database['public']['Tables']['venues']['Row']

interface UserEventMembership {
  event_id: string
  role: string
  is_active: boolean
  event: Event
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  event: Event | null              // Active event (backward compat)
  events: UserEventMembership[]    // All events user belongs to
  venue: Venue | null              // Venue of active event
  organization: Organization | null
  loading: boolean
  initialized: boolean
  isSuperAdmin: boolean
  isAdmin: boolean
  isGroupAdmin: boolean
  isPromoter: boolean
  isStaff: boolean // super_admin | admin | group_admin | scanner | promoter
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  switchEvent: (eventId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [event, setEvent] = useState<Event | null>(null)
  const [events, setEvents] = useState<UserEventMembership[]>([])
  const [venue, setVenue] = useState<Venue | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const loadedUserId = useRef<string | null>(null)
  const isLoadingRef = useRef(false)

  const loadUserData = useCallback(async (authUser: User): Promise<boolean> => {
    if (loadedUserId.current === authUser.id) return true
    if (isLoadingRef.current) return false
    isLoadingRef.current = true

    try {
      // 1. Load profile — NO timeout (Supabase cold start can take 10-15s on free tier)
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (profileError || !profileData) {
        console.error('[Auth] Could not load profile:', profileError?.message)
        return false
      }

      setProfile(profileData)

      // 2. Run ALL secondary queries in parallel — NO timeout, non-fatal
      const promises: Promise<void>[] = []

      promises.push((async () => {
        if (!profileData.event_id) { setEvent(null); setVenue(null); return }
        const { data: eventData } = await supabase.from('events').select('*').eq('id', profileData.event_id).single()
        setEvent(eventData || null)
        if (eventData?.venue_id) {
          const { data: venueData } = await supabase.from('venues').select('*').eq('id', eventData.venue_id).single()
          setVenue(venueData || null)
        } else {
          setVenue(null)
        }
      })())

      promises.push((async () => {
        if (!profileData.organization_id) { setOrganization(null); return }
        const { data: orgData } = await supabase.from('organizations').select('*').eq('id', profileData.organization_id).single()
        setOrganization(orgData || null)
      })())

      promises.push((async () => {
        const { data: memberships } = await supabase
          .from('user_events')
          .select('event_id, role, is_active')
          .eq('user_id', authUser.id)
          .eq('is_active', true)
        if (memberships && memberships.length > 0) {
          const eventIds = memberships.map(m => m.event_id)
          const { data: eventsData } = await supabase.from('events').select('*').in('id', eventIds)
          const eventsMap: Record<string, Event> = {}
          eventsData?.forEach(e => { eventsMap[e.id] = e })
          setEvents(memberships.filter(m => eventsMap[m.event_id]).map(m => ({
            event_id: m.event_id, role: m.role, is_active: m.is_active, event: eventsMap[m.event_id],
          })))
        } else {
          setEvents([])
        }
      })())

      // Secondary data failure is non-fatal — app works without event/venue/org
      try { await Promise.all(promises) } catch (err) {
        console.warn('[Auth] Secondary data partially failed (non-fatal):', err)
      }

      loadedUserId.current = authUser.id

      // Auto-subscribe to push notifications (fire-and-forget)
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        import('@/lib/notifications').then(({ subscribeToPush }) => {
          subscribeToPush(authUser.id).catch(() => {})
        }).catch(() => {})
      }

      return true
    } catch (err) {
      console.error('[Auth] Error loading user data:', err)
      return false
    } finally {
      isLoadingRef.current = false
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    loadedUserId.current = null
    await loadUserData(user)
  }, [user, loadUserData])

  const switchEvent = useCallback(async (eventId: string) => {
    if (!user) return
    await supabase.from('users').update({ event_id: eventId }).eq('id', user.id)
    loadedUserId.current = null
    await loadUserData(user)
  }, [user, loadUserData])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        // No timeout — Supabase cold start can take 10-15s on free tier
        const { data: { session } } = await supabase.auth.getSession()

        if (cancelled) return

        if (!session) {
          // No session — just mark as initialized. Each layout handles its own redirect.
          setLoading(false)
          setInitialized(true)
          return
        }

        setUser(session.user)
        const success = await loadUserData(session.user)

        // Retry once on failure (covers cold start where first query wakes the DB)
        if (!success && !cancelled) {
          console.log('[Auth] Retrying loadUserData after initial failure...')
          isLoadingRef.current = false // Reset guard so retry can proceed
          loadedUserId.current = null
          await loadUserData(session.user)
        }
      } catch (err) {
        console.error('[Auth] Init error:', err)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setInitialized(true)
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (authEvent, session) => {
        if (cancelled) return

        // Skip INITIAL_SESSION — init() handles the first load.
        // Skip TOKEN_REFRESHED — no need to reload data.
        if (authEvent === 'INITIAL_SESSION' || authEvent === 'TOKEN_REFRESHED') return

        if (authEvent === 'SIGNED_OUT' || !session) {
          setUser(null)
          setProfile(null)
          setEvent(null)
          setVenue(null)
          setEvents([])
          setOrganization(null)
          loadedUserId.current = null
          isLoadingRef.current = false
          setLoading(false)
          setInitialized(true)
          return
        }

        // SIGNED_IN from a different user (e.g. login after being on /login)
        // IMPORTANT: Do NOT await async work here — this callback runs inside
        // Supabase's navigator lock. Awaiting Supabase queries here causes a
        // deadlock because those queries also need the lock (to get the token).
        // Instead, set state and schedule loading outside the lock via setTimeout.
        if (session.user.id !== loadedUserId.current) {
          loadedUserId.current = null
          isLoadingRef.current = false
          setUser(session.user)
          setLoading(true)
          // Schedule data loading outside the auth lock
          setTimeout(async () => {
            if (cancelled) return
            await loadUserData(session.user)
            if (!cancelled) {
              setLoading(false)
              setInitialized(true)
            }
          }, 0)
        }
      }
    )

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    loadedUserId.current = null
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setEvent(null)
    setVenue(null)
    setEvents([])
    setOrganization(null)
    router.push('/login')
  }, [router])

  // Role helpers
  const role = profile?.role || 'attendee'
  const isSuperAdmin = role === 'super_admin'
  const isAdmin = role === 'admin' || role === 'super_admin'
  const isGroupAdmin = role === 'group_admin'
  const isPromoter = role === 'promoter'
  const isStaff = ['super_admin', 'admin', 'group_admin', 'scanner', 'promoter'].includes(role)

  return (
    <AuthContext.Provider value={{
      user, profile, event, events, venue, organization,
      loading, initialized,
      isSuperAdmin, isAdmin, isGroupAdmin, isPromoter, isStaff,
      signOut, refreshProfile, switchEvent,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
