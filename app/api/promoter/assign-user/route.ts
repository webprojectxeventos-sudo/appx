import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    // Try middleware header first, fallback to JWT decode
    let callerId = req.headers.get('x-user-id')
    if (!callerId) {
      const auth = req.headers.get('Authorization')
      if (auth?.startsWith('Bearer ')) {
        try { const p = JSON.parse(atob(auth.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.exp * 1000 > Date.now()) callerId = p.sub } catch {}
      }
    }
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // ── Hard-fail if service key missing ────────────────────────────────
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      console.error('[promoter/assign-user] Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const { userId, eventId } = await req.json()

    if (!userId || !eventId) {
      return NextResponse.json({ error: 'userId and eventId are required' }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId) || !uuidRegex.test(eventId)) {
      return NextResponse.json({ error: 'Invalid UUID format' }, { status: 400 })
    }

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Role + event-access check ──────────────────────────────────────
    //
    // Previously no role check: any attendee could call this RPC for any
    // userId + eventId combination, silently adding themselves or others
    // to arbitrary events. Lockdown mirrors create-user:
    //   - super_admin: any event
    //   - admin: events in caller's org
    //   - promoter: only events the promoter is assigned to
    const { data: caller } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!caller) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })
    }

    const { data: event } = await supabase
      .from('events')
      .select('id, organization_id')
      .eq('id', eventId)
      .single()
    if (!event) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })
    }

    let allowed = false
    if (caller.role === 'super_admin') {
      allowed = true
    } else if (caller.role === 'admin' && caller.organization_id && caller.organization_id === event.organization_id) {
      allowed = true
    } else if (caller.role === 'promoter') {
      const { data: membership } = await supabase
        .from('user_events')
        .select('id')
        .eq('user_id', callerId)
        .eq('event_id', eventId)
        .eq('is_active', true)
        .maybeSingle()
      allowed = !!membership
    }
    if (!allowed) {
      return NextResponse.json({ error: 'No autorizado para este evento' }, { status: 403 })
    }

    // added_by is the authoritative caller, not whatever the client sent.
    const { data, error } = await supabase.rpc('assign_user_to_event', {
      p_user_id: userId,
      p_event_id: eventId,
      p_added_by: callerId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[promoter/assign-user] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
