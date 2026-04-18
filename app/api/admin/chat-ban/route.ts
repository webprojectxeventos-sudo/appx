import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

const ALLOWED_ROLES = ['super_admin', 'admin', 'group_admin']

const DURATION_MAP: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

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

    // Verify caller role
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, eventId, reason, duration } = body as {
      userId?: string
      eventId?: string
      reason?: string
      duration?: string // '1h' | '6h' | '24h' | '7d' | 'permanent'
    }

    if (!userId || !eventId) {
      return NextResponse.json({ error: 'userId y eventId son obligatorios' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Cross-org authorization check.
    //
    // - super_admin: anywhere.
    // - admin: only events in their own organization. Previously absent —
    //   an admin from Org A could ban users in Org B events by POSTing any
    //   eventId. Now we load the event and compare organization_id.
    // - group_admin: must have an explicit user_events membership for the event.
    if (callerProfile.role !== 'super_admin') {
      const { data: targetEvent } = await supabaseAdmin
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()
      if (!targetEvent) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
      }

      if (callerProfile.role === 'admin') {
        if (!callerProfile.organization_id || targetEvent.organization_id !== callerProfile.organization_id) {
          return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
        }
      } else if (callerProfile.role === 'group_admin') {
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
    }

    // Prevent banning yourself
    if (userId === callerId) {
      return NextResponse.json({ error: 'No puedes banearte a ti mismo' }, { status: 400 })
    }

    // Calculate expiration
    const expiresAt = duration && duration !== 'permanent' && DURATION_MAP[duration]
      ? new Date(Date.now() + DURATION_MAP[duration]).toISOString()
      : null

    // Upsert ban
    const { error } = await supabaseAdmin
      .from('chat_bans')
      .upsert({
        user_id: userId,
        event_id: eventId,
        banned_by: callerId,
        reason: reason || null,
        expires_at: expiresAt,
        is_active: true,
        banned_at: new Date().toISOString(),
      }, { onConflict: 'user_id,event_id' })

    if (error) {
      console.error('[chat-ban] Upsert error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'banned' })
  } catch (err) {
    console.error('[chat-ban] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
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

    // Verify caller role
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, eventId } = body as { userId?: string; eventId?: string }

    if (!userId || !eventId) {
      return NextResponse.json({ error: 'userId y eventId son obligatorios' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Same cross-org authorization as POST — keep these paths in sync.
    if (callerProfile.role !== 'super_admin') {
      const { data: targetEvent } = await supabaseAdmin
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()
      if (!targetEvent) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
      }

      if (callerProfile.role === 'admin') {
        if (!callerProfile.organization_id || targetEvent.organization_id !== callerProfile.organization_id) {
          return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
        }
      } else if (callerProfile.role === 'group_admin') {
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
    }

    // Deactivate ban
    const { error } = await supabaseAdmin
      .from('chat_bans')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('event_id', eventId)

    if (error) {
      console.error('[chat-ban] Unban error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'unbanned' })
  } catch (err) {
    console.error('[chat-ban] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
