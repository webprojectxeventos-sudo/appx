import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_ROLES = ['super_admin', 'admin']

export async function POST(request: NextRequest) {
  try {
    const callerId = request.headers.get('x-user-id')
    if (!callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !serviceKey || !anonKey) {
      console.error('[delete-user] Missing env vars:', { url: !!url, serviceKey: !!serviceKey, anonKey: !!anonKey })
      return NextResponse.json({ error: 'Configuracion del servidor incompleta' }, { status: 500 })
    }

    // Verify caller is admin or super_admin
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Se requiere rol admin o super_admin' }, { status: 403 })
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
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })
    }

    if (mode === 'remove_from_event') {
      if (!eventId) {
        return NextResponse.json({ error: 'eventId required for remove_from_event mode' }, { status: 400 })
      }

      await supabaseAdmin.from('user_events').delete().eq('user_id', userId).eq('event_id', eventId)
      await supabaseAdmin.from('tickets').update({ status: 'cancelled' }).eq('user_id', userId).eq('event_id', eventId)
      await supabaseAdmin.from('drink_orders').delete().eq('user_id', userId).eq('event_id', eventId)

      // If this was their active event, clear it
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('event_id')
        .eq('id', userId)
        .single()

      if (profile?.event_id === eventId) {
        await supabaseAdmin.from('users').update({ event_id: null }).eq('id', userId)
      }

      return NextResponse.json({ success: true, mode: 'removed_from_event' })
    }

    if (mode === 'delete_user') {
      // Delete ALL related data in dependency order (handles FK constraints)
      // 1. Votes and reactions (leaf tables)
      await supabaseAdmin.from('poll_votes').delete().eq('user_id', userId)
      await supabaseAdmin.from('message_reactions').delete().eq('user_id', userId)
      await supabaseAdmin.from('playlist_votes').delete().eq('user_id', userId)

      // 2. Content tables
      await supabaseAdmin.from('messages').delete().eq('user_id', userId)
      await supabaseAdmin.from('drink_orders').delete().eq('user_id', userId)
      await supabaseAdmin.from('tickets').delete().eq('user_id', userId)
      await supabaseAdmin.from('playlist_songs').delete().eq('added_by', userId)
      await supabaseAdmin.from('photos').delete().eq('uploaded_by', userId)
      await supabaseAdmin.from('lost_found').delete().eq('user_id', userId)
      await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', userId)

      // 3. Membership
      await supabaseAdmin.from('user_events').delete().eq('user_id', userId)

      // 4. Nullify references that shouldn't cascade-delete the parent record
      await supabaseAdmin.from('access_codes').update({ used_by: null, used_at: null }).eq('used_by', userId)
      await supabaseAdmin.from('tickets').update({ scanned_by: null }).eq('scanned_by', userId)
      await supabaseAdmin.from('incidents').update({ resolved_by: null }).eq('resolved_by', userId)

      // 5. Delete user profile
      const { error: profileError } = await supabaseAdmin.from('users').delete().eq('id', userId)
      if (profileError) {
        console.error('[delete-user] Profile delete error:', profileError.message)
        return NextResponse.json({ error: `Error eliminando perfil: ${profileError.message}` }, { status: 500 })
      }

      // 6. Delete auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authError) {
        console.error('[delete-user] Auth delete error:', authError.message)
        // Profile already deleted — log but don't fail
      }

      return NextResponse.json({ success: true, mode: 'deleted' })
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (err) {
    console.error('[delete-user] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
