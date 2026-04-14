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

  // Load secondary data in background — non-blocking, non-fatal
  // Each query sets state independently as it resolves
  const loadSecondaryData = useCallback((userId: string, profileData: UserProfile) => {
    // Event + Venue chain
    ;(async () => {
      try {
        if (!profileData.event_id) { setEvent(null); setVenue(null); return }
        const { data: eventData } = await supabase.from('events').select('*').eq('id', profileData.event_id).single()
        setEvent(eventData || null)
        if (eventData?.venue_id) {
          const { data: venueData } = await supabase.from('venues').select('*').eq('id', eventData.venue_id).single()
          setVenue(venueData || null)
        } else { setVenue(null) }
      } catch (err) { console.warn('[Auth] Event/venue load failed (non-fatal):', err) }
    })()

    // Organization
    ;(async () => {
      try {
        if (!profileData.organization_id) { setOrganization(null); return }
        const { data: orgData } = await supabase.from('organizations').select('*').eq('id', profileData.organization_id).single()
        setOrganization(orgData || null)
      } catch (err) { console.warn('[Auth] Org load failed (non-fatal):', err) }
    })()

    // Event memberships
    ;(async () => {
      try {
        const { data: memberships } = await supabase
          .from('user_events')
          .select('event_id, role, is_active')
          .eq('user_id', userId)
          .eq('is_active', true)
        if (memberships && memberships.length > 0) {
          const eventIds = memberships.map(m => m.event_id)
          const { data: eventsData } = await supabase.from('events').select('*').in('id', eventIds)
          const eventsMap: Record<string, Event> = {}
          eventsData?.forEach(e => { eventsMap[e.id] = e })
          setEvents(memberships.filter(m => eventsMap[m.event_id]).map(m => ({
            event_id: m.event_id, role: m.role, is_active: m.is_active, event: eventsMap[m.event_id],
          })))
        } else { setEvents([]) }
      } catch (err) { console.warn('[Auth] Memberships load failed (non-fatal):', err) }
    })()

    // Push notifications (fire-and-forget)
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
      import('@/lib/notifications').then(({ subscribeToPush }) => {
        subscribeToPush(userId).catch(() => {})
      }).catch(() => {})
    }
  }, [])

  const loadUserData = useCallback(async (authUser: User): Promise<boolean> => {
    if (loadedUserId.current === authUser.id) return true
    if (isLoadingRef.current) return false
    isLoadingRef.current = true

    try {
      // Load profile — this is the ONLY blocking query (15s timeout).
      // Once profile is loaded, loading=false can be set immediately.
      // Secondary data (event, venue, org) loads in background.
      const profilePromise = supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timeout (15s)')), 15_000)
      )

      const { data: profileData, error: profileError } = await Promise.race([
        profilePromise,
        timeoutPromise,
      ])

      if (profileError || !profileData) {
        console.error('[Auth] Could not load profile:', profileError?.message)
        // Attempt to auto-create profile for orphaned auth users (trigger may have failed)
        const meta = authUser.user_metadata || {}
        // Derive organization_id from event if possible
        let orgId: string | null = null
        if (meta.event_id) {
          const { data: ev } = await supabase.from('events').select('organization_id').eq('id', meta.event_id).single()
          if (ev) orgId = ev.organization_id
        }
        const { data: created, error: createErr } = await supabase.from('users').upsert({
          id: authUser.id,
          email: authUser.email || '',
          full_name: meta.full_name || meta.name || authUser.email?.split('@')[0] || '',
          gender: meta.gender || null,
          role: 'attendee',
          event_id: meta.event_id || null,
          organization_id: orgId,
        }, { onConflict: 'id' }).select().single()

        if (createErr || !created) {
          console.error('[Auth] Could not recover profile:', createErr?.message)
          return false
        }
        console.log('[Auth] Auto-created missing profile for', authUser.id)
        setProfile(created)
        loadedUserId.current = authUser.id

        // Also ensure user_events row exists
        if (meta.event_id) {
          await supabase.from('user_events').upsert({
            user_id: authUser.id,
            event_id: meta.event_id,
            role: 'attendee',
          }, { onConflict: 'user_id,event_id' }).then(() => {})
        }

        loadSecondaryData(authUser.id, created)
        return true
      }

      setProfile(profileData)
      loadedUserId.current = authUser.id

      // Fire secondary data loads in background — they set state as they resolve
      // If any hang or fail, the app still works (role checks only need profile)
      loadSecondaryData(authUser.id, profileData)

      return true
    } catch (err) {
      console.error('[Auth] Error loading user data:', err)
      return false
    } finally {
      isLoadingRef.current = false
    }
  }, [loadSecondaryData])

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

        // Set user + initialized BEFORE profile loads — layouts can render immediately.
        // `loading` stays true until profile is ready. Pages handle their own loading states.
        setUser(session.user)
        setInitialized(true)

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
          setInitialized(true) // Ensure initialized on all code paths
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
