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
  isStaff: boolean // super_admin | admin | group_admin | scanner
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  switchEvent: (eventId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[Auth] Timeout: ${label} took >${ms}ms`)), ms)
    ),
  ])
}

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
      // 1. Load profile
      const profileResult = await withTimeout(
        supabase.from('users').select('*').eq('id', authUser.id).single().then(r => r) as Promise<{ data: UserProfile | null; error: { message: string } | null }>,
        8000,
        'loadProfile'
      )

      if (profileResult.error || !profileResult.data) {
        console.error('[Auth] Could not load profile:', profileResult.error?.message)
        return false
      }

      const profileData = profileResult.data
      setProfile(profileData)

      // 2. Load active event (from users.event_id — backward compat)
      if (profileData.event_id) {
        const eventResult = await withTimeout(
          supabase.from('events').select('*').eq('id', profileData.event_id).single().then(r => r) as Promise<{ data: Event | null; error: { message: string } | null }>,
          8000,
          'loadEvent'
        )
        const eventData = eventResult.data || null
        setEvent(eventData)

        // 2b. Load venue of active event
        if (eventData?.venue_id) {
          const venueResult = await withTimeout(
            supabase.from('venues').select('*').eq('id', eventData.venue_id).single().then(r => r) as Promise<{ data: Venue | null; error: { message: string } | null }>,
            8000,
            'loadVenue'
          )
          setVenue(venueResult.data || null)
        } else {
          setVenue(null)
        }
      } else {
        setEvent(null)
        setVenue(null)
      }

      // 3. Load organization (if user has one)
      if (profileData.organization_id) {
        const orgResult = await withTimeout(
          supabase.from('organizations').select('*').eq('id', profileData.organization_id).single().then(r => r) as Promise<{ data: Organization | null; error: { message: string } | null }>,
          8000,
          'loadOrg'
        )
        setOrganization(orgResult.data || null)
      } else {
        setOrganization(null)
      }

      // 4. Load all event memberships (from user_events)
      const { data: memberships } = await supabase
        .from('user_events')
        .select('event_id, role, is_active')
        .eq('user_id', authUser.id)
        .eq('is_active', true)

      if (memberships && memberships.length > 0) {
        const eventIds = memberships.map(m => m.event_id)
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)

        const eventsMap: Record<string, Event> = {}
        eventsData?.forEach(e => { eventsMap[e.id] = e })

        const enriched: UserEventMembership[] = memberships
          .filter(m => eventsMap[m.event_id])
          .map(m => ({
            event_id: m.event_id,
            role: m.role,
            is_active: m.is_active,
            event: eventsMap[m.event_id],
          }))

        setEvents(enriched)
      } else {
        setEvents([])
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
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          10000,
          'getSession'
        )

        if (cancelled) return

        if (!session) {
          setUser(null)
          setProfile(null)
          setEvent(null)
          setVenue(null)
          setEvents([])
          setOrganization(null)
          setLoading(false)
          setInitialized(true)
          router.push('/login')
          return
        }

        setUser(session.user)
        await loadUserData(session.user)
      } catch (err) {
        console.error('[Auth] Init error:', err)
        if (!cancelled) {
          router.push('/login')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setInitialized(true)
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (authEvent, session) => {
        if (cancelled) return

        if (authEvent === 'SIGNED_OUT' || !session) {
          setUser(null)
          setProfile(null)
          setEvent(null)
          setVenue(null)
          setEvents([])
          setOrganization(null)
          loadedUserId.current = null
          setLoading(false)
          router.push('/login')
          return
        }

        if (session.user.id !== loadedUserId.current) {
          setUser(session.user)
          setLoading(true)
          await loadUserData(session.user)
          if (!cancelled) setLoading(false)
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
  const isStaff = ['super_admin', 'admin', 'group_admin', 'scanner'].includes(role)

  return (
    <AuthContext.Provider value={{
      user, profile, event, events, venue, organization,
      loading, initialized,
      isSuperAdmin, isAdmin, isGroupAdmin, isStaff,
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
