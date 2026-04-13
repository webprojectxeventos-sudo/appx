import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, serviceKey || anonKey)
}

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

    const { userId, eventId, addedBy } = await req.json()

    if (!userId || !eventId) {
      return NextResponse.json({ error: 'userId and eventId are required' }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId) || !uuidRegex.test(eventId)) {
      return NextResponse.json({ error: 'Invalid UUID format' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase.rpc('assign_user_to_event', {
      p_user_id: userId,
      p_event_id: eventId,
      p_added_by: addedBy || null,
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
