import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

// Bulk soft-delete messages. Used for incident cleanup — takes either
// { eventId } (delete all messages in that event) or { messageIds } (delete a
// specific list). Soft-delete only: preserves the row for legal / forensic
// trail, just flips deleted_at + deleted_by.

const ALLOWED_ROLES = ['super_admin', 'admin']

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
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    // Only super_admin / admin can bulk-delete. group_admin can still delete one-at-a-time.
    if (!callerProfile || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Sin permisos para operaciones masivas' }, { status: 403 })
    }

    const body = await request.json()
    const { eventId, messageIds } = body as { eventId?: string; messageIds?: string[] }

    if (!eventId && (!messageIds || messageIds.length === 0)) {
      return NextResponse.json({ error: 'eventId o messageIds son obligatorios' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)
    const now = new Date().toISOString()

    // Cross-org guard: admins can only nuke messages inside events in their
    // own org. super_admin stays cross-org. Without this an admin in Org A
    // could hit this endpoint with eventId pointing to Org B and wipe the
    // other tenant's chat.
    if (eventId && callerProfile.role !== 'super_admin') {
      const { data: targetEvent } = await supabaseAdmin
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()
      if (!targetEvent) {
        return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
      }
      if (!callerProfile.organization_id || targetEvent.organization_id !== callerProfile.organization_id) {
        return NextResponse.json({ error: 'No tienes acceso a este evento' }, { status: 403 })
      }
    }

    // When messageIds is used without eventId, also verify every target
    // message belongs to an event in the caller's org (unless super_admin).
    if (!eventId && messageIds && messageIds.length > 0 && callerProfile.role !== 'super_admin') {
      if (!callerProfile.organization_id) {
        return NextResponse.json({ error: 'No tienes acceso' }, { status: 403 })
      }
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('id, event_id')
        .in('id', messageIds)
      const eventIds = [...new Set((msgs || []).map((m) => m.event_id))]
      if (eventIds.length > 0) {
        const { data: evs } = await supabaseAdmin
          .from('events')
          .select('id, organization_id')
          .in('id', eventIds)
        const outOfOrg = (evs || []).some((e) => e.organization_id !== callerProfile.organization_id)
        if (outOfOrg) {
          return NextResponse.json({ error: 'No tienes acceso a uno o varios de estos mensajes' }, { status: 403 })
        }
      }
    }

    let query = supabaseAdmin
      .from('messages')
      .update({ deleted_at: now, deleted_by: callerId })
      .is('deleted_at', null)

    if (eventId) query = query.eq('event_id', eventId)
    if (messageIds && messageIds.length > 0) query = query.in('id', messageIds)

    // .select() returns the updated rows; length gives us the count.
    const { data, error } = await query.select('id')

    if (error) {
      console.error('[chat-bulk-delete] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: data?.length || 0 })
  } catch (err) {
    console.error('[chat-bulk-delete] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
