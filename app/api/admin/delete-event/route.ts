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
      return NextResponse.json({ error: 'Configuracion del servidor incompleta' }, { status: 500 })
    }

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
    const { eventId } = body as { eventId?: string }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Verify the event belongs to same org
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('id, organization_id, title')
      .eq('id', eventId)
      .single()

    if (!event) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    if (event.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Evento de otra organizacion' }, { status: 403 })
    }

    // Delete all event-related data in dependency order
    // 1. Votes and reactions on event content
    await supabaseAdmin.from('poll_votes').delete().in(
      'poll_id',
      (await supabaseAdmin.from('polls').select('id').eq('event_id', eventId)).data?.map(p => p.id) || []
    )

    // 2. Polls
    await supabaseAdmin.from('polls').delete().eq('event_id', eventId)

    // 3. Messages and reactions
    const { data: msgIds } = await supabaseAdmin.from('messages').select('id').eq('event_id', eventId)
    if (msgIds && msgIds.length > 0) {
      const ids = msgIds.map(m => m.id)
      // Batch delete reactions
      const BATCH = 80
      for (let i = 0; i < ids.length; i += BATCH) {
        await supabaseAdmin.from('message_reactions').delete().in('message_id', ids.slice(i, i + BATCH))
      }
    }
    await supabaseAdmin.from('messages').delete().eq('event_id', eventId)

    // 4. Playlist votes then songs
    const { data: songIds } = await supabaseAdmin.from('playlist_songs').select('id').eq('event_id', eventId)
    if (songIds && songIds.length > 0) {
      const ids = songIds.map(s => s.id)
      const BATCH = 80
      for (let i = 0; i < ids.length; i += BATCH) {
        await supabaseAdmin.from('playlist_votes').delete().in('song_id', ids.slice(i, i + BATCH))
      }
    }
    await supabaseAdmin.from('playlist_songs').delete().eq('event_id', eventId)

    // 5. Other event data
    await supabaseAdmin.from('drink_orders').delete().eq('event_id', eventId)
    await supabaseAdmin.from('tickets').delete().eq('event_id', eventId)
    await supabaseAdmin.from('photos').delete().eq('event_id', eventId)
    await supabaseAdmin.from('lost_found').delete().eq('event_id', eventId)
    await supabaseAdmin.from('incidents').delete().eq('event_id', eventId)
    await supabaseAdmin.from('access_codes').delete().eq('event_id', eventId)
    await supabaseAdmin.from('event_schedule').delete().eq('event_id', eventId)

    // 6. User-event memberships
    await supabaseAdmin.from('user_events').delete().eq('event_id', eventId)

    // 7. Clear event_id on users who had this as active event
    await supabaseAdmin.from('users').update({ event_id: null }).eq('event_id', eventId)

    // 8. Delete the event itself
    const { error: eventError } = await supabaseAdmin.from('events').delete().eq('id', eventId)
    if (eventError) {
      console.error('[delete-event] Event delete error:', eventError.message)
      return NextResponse.json({ error: `Error eliminando evento: ${eventError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, title: event.title })
  } catch (err) {
    console.error('[delete-event] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
