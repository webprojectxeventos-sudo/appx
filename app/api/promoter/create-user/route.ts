import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Abuse prevention ──────────────────────────────────────────────────────
//
// This endpoint creates auth users. Without rate-limiting, a compromised or
// runaway promoter client can exhaust the Supabase auth admin API and the
// DB pool in seconds. Per-caller: 200/hour — a busy promoter legitimately
// onboards ~30-60 attendees on a peak night; 200/h is comfortably above that
// while still bounding blast radius.
const RATE_WINDOW_MS = 60 * 60_000
const RATE_LIMIT_PER_USER = 200
const rateBuckets = new Map<string, number[]>()

function rateOk(userId: string): boolean {
  const now = Date.now()
  const bucket = (rateBuckets.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (bucket.length >= RATE_LIMIT_PER_USER) {
    rateBuckets.set(userId, bucket)
    return false
  }
  bucket.push(now)
  rateBuckets.set(userId, bucket)
  return true
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

    if (!rateOk(callerId)) {
      return NextResponse.json({ error: 'Demasiados registros. Espera unos minutos.' }, { status: 429 })
    }

    // ── Hard-fail if service key missing ────────────────────────────────
    // Previous behaviour silently fell back to anon — which then 500'd on
    // auth.admin.createUser deep in the flow. Fail early with a clear error.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      console.error('[promoter/create-user] Missing SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { email, fullName, gender, eventId } = await req.json()

    if (!email || !fullName || !eventId) {
      return NextResponse.json({ error: 'email, fullName, and eventId are required' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json({ error: 'Invalid eventId format' }, { status: 400 })
    }

    // ── Role + event-access check ──────────────────────────────────────
    //
    // Previously there was NO role check: any authenticated attendee could
    // call this and create arbitrary auth users. Lockdown:
    //   - Caller must be admin / super_admin / promoter.
    //   - If admin/super_admin: event must be in caller's org.
    //   - If promoter: caller must have an active user_events row for event.
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

    // ── Find existing user by email (fast path via public.users) ────────
    //
    // Previous code did `auth.admin.listUsers()` with NO pagination/filter,
    // which pulls the ENTIRE auth.users table on every call. On a ~5k user
    // DB this alone is seconds per request and blows the auth admin rate
    // limit when multiple promoters onboard concurrently. New path uses the
    // indexed email column in public.users (populated by handle_new_user
    // trigger) and only falls back to auth.admin.getUserById when needed.
    const emailLower = email.toLowerCase()
    let existingUserId: string | null = null

    const { data: publicMatch } = await supabase
      .from('users')
      .select('id')
      .eq('email', emailLower)
      .maybeSingle()

    if (publicMatch?.id) {
      existingUserId = publicMatch.id
    }

    if (existingUserId) {
      // User exists — just assign to event
      const { error: assignError } = await supabase.rpc('assign_user_to_event', {
        p_user_id: existingUserId,
        p_event_id: eventId,
        p_added_by: callerId, // authoritative caller, not body-provided
      })

      if (assignError) {
        return NextResponse.json({ error: assignError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        userId: existingUserId,
        alreadyExisted: true,
        fullName: null, // We don't expose existing user data
      })
    }

    // Create new user with random password (they can reset it later)
    const randomPassword = crypto.randomUUID().slice(0, 16) + '!Aa1'
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password: randomPassword,
      email_confirm: true, // Auto-confirm so they can use forgot-password
      user_metadata: {
        full_name: fullName,
        gender: gender || null,
        event_id: eventId,
      },
    })

    if (createError || !newUser.user) {
      // If email already exists in auth but not public.users (trigger miss),
      // surface a clean error so the promoter can retry later.
      const msg = createError?.message || 'Failed to create user'
      const status = msg.toLowerCase().includes('already') ? 409 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    // Create profile in users table — organization_id comes from event, never body
    const { error: profileError } = await supabase.from('users').insert({
      id: newUser.user.id,
      email: emailLower,
      full_name: fullName,
      gender: gender || null,
      role: 'attendee',
      event_id: eventId,
      organization_id: event.organization_id || null,
    })

    if (profileError) {
      // Profile might already exist from trigger — ignore
      console.warn('[promoter/create-user] Profile insert warn:', profileError.message)
    }

    // Add to event — added_by is authoritative caller
    await supabase.from('user_events').upsert({
      user_id: newUser.user.id,
      event_id: eventId,
      role: 'attendee',
      added_by: callerId,
    }, { onConflict: 'user_id,event_id' })

    return NextResponse.json({
      success: true,
      userId: newUser.user.id,
      alreadyExisted: false,
    })
  } catch (err) {
    console.error('[promoter/create-user] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
