import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const callerId = request.headers.get('x-user-id')
    if (!callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Verify caller is super_admin
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: super_admin role required' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, eventId, mode } = body as {
      userId?: string
      eventId?: string
      mode?: 'remove_from_event' | 'delete_user'
    }

    if (!userId || !mode) {
      return NextResponse.json({ error: 'userId and mode are required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Verify target user belongs to same org
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetUser.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User belongs to a different organization' }, { status: 403 })
    }

    // Prevent deleting yourself
    if (userId === callerId) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
    }

    if (mode === 'remove_from_event') {
      if (!eventId) {
        return NextResponse.json({ error: 'eventId required for remove_from_event mode' }, { status: 400 })
      }

      // Remove from user_events
      await supabaseAdmin
        .from('user_events')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', eventId)

      // Cancel their ticket for this event
      await supabaseAdmin
        .from('tickets')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('event_id', eventId)

      // Remove drink orders for this event
      await supabaseAdmin
        .from('drink_orders')
        .delete()
        .eq('user_id', userId)
        .eq('event_id', eventId)

      // If this was their active event, clear it
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('event_id')
        .eq('id', userId)
        .single()

      if (profile?.event_id === eventId) {
        await supabaseAdmin
          .from('users')
          .update({ event_id: null })
          .eq('id', userId)
      }

      return NextResponse.json({ success: true, mode: 'removed_from_event' })
    }

    if (mode === 'delete_user') {
      // Delete all related data first (cascade-safe order)
      await supabaseAdmin.from('drink_orders').delete().eq('user_id', userId)
      await supabaseAdmin.from('tickets').delete().eq('user_id', userId)
      await supabaseAdmin.from('user_events').delete().eq('user_id', userId)
      await supabaseAdmin.from('poll_votes').delete().eq('user_id', userId)
      await supabaseAdmin.from('messages').delete().eq('user_id', userId)
      await supabaseAdmin.from('playlist_songs').delete().eq('user_id', userId)

      // Mark access codes as unused if used by this user
      await supabaseAdmin
        .from('access_codes')
        .update({ used_by: null, used_at: null })
        .eq('used_by', userId)

      // Delete profile
      await supabaseAdmin.from('users').delete().eq('id', userId)

      // Delete auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authError) {
        console.error('[delete-user] Auth delete error:', authError.message)
        // Profile already deleted, just log the auth error
      }

      return NextResponse.json({ success: true, mode: 'deleted' })
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (err) {
    console.error('[delete-user] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
