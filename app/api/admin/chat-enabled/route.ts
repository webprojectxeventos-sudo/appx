import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

// Per-event kill-switch endpoint. Flips events.chat_enabled.
//
// Using service role (instead of relying on the client's authenticated
// supabase call) is deliberate — admins expect this button to *always*
// work, and we don't want RLS edge cases (stale JWT, role mapping, etc.)
// to silently break an urgent moderation action while 400 kids are typing.

const ALLOWED_ROLES = ['super_admin', 'admin', 'group_admin']

export async function POST(request: NextRequest) {
  try {
    const callerId = getCallerId(request)
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !serviceKey || !anonKey) {
      return NextResponse.json({ error: 'Configuracion del servidor incompleta' }, { status: 500 })
    }

    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: request.headers.get('Authorization') || '' } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role')
      .eq('id', callerId)
      .single()

    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { eventId, enabled } = body as { eventId?: string; enabled?: boolean }

    if (!eventId || typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'eventId y enabled son obligatorios' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Group-admin scope guard: must be a member of the event to toggle it
    if (callerProfile.role === 'group_admin') {
      const { data: membership } = await supabaseAdmin
        .from('user_events')
        .select('id')
        .eq('user_id', callerId)
        .eq('event_id', eventId)
        .maybeSingle()
      if (!membership) {
        return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('events')
      .update({ chat_enabled: enabled })
      .eq('id', eventId)
      .select('id, chat_enabled')
      .single()

    if (error) {
      console.error('[chat-enabled] Update error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, event: data })
  } catch (err) {
    console.error('[chat-enabled] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
