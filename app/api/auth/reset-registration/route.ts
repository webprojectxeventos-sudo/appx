import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Abuse prevention ──────────────────────────────────────────────────────
//
// Without rate limiting, an attacker can hit this endpoint with arbitrary
// emails to probe which are unconfirmed accounts. Each call also does an
// expensive paginated scan of auth.users (fallback), so throttling matters
// for service stability too.
//
// Window: 10 attempts per IP per 10 minutes. Legitimate use is 1-2 attempts
// by a confused user; anything above that is almost certainly abuse.
const RATE_WINDOW_MS = 10 * 60_000
const RATE_LIMIT_PER_IP = 10
const ipBuckets = new Map<string, number[]>()

function checkIpRate(ip: string): boolean {
  const now = Date.now()
  const bucket = ipBuckets.get(ip) || []
  const fresh = bucket.filter((t) => now - t < RATE_WINDOW_MS)
  if (fresh.length >= RATE_LIMIT_PER_IP) {
    ipBuckets.set(ip, fresh)
    return false
  }
  fresh.push(now)
  ipBuckets.set(ip, fresh)

  if (ipBuckets.size > 2000) {
    for (const [k, times] of ipBuckets.entries()) {
      const last = times[times.length - 1] ?? 0
      if (now - last > RATE_WINDOW_MS) ipBuckets.delete(k)
    }
  }
  return true
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

// Self-service recovery for users who registered with the wrong email.
//
// A user is stuck if they typed their email wrong at registration:
//   1. The auth user was created with the wrong email
//   2. The access code was consumed (trigger marks access_codes.used_by)
//   3. They cannot re-register (code is gone) or log in (email unconfirmed)
//
// This endpoint lets them unstick themselves by proving identity with:
//   - The access code they used
//   - The wrong email they typed
//   - The password they set
//
// If all match AND the account is unconfirmed, we delete the auth user
// and free the access code so they can register again with the correct email.
//
// Security:
//   - Only works on unconfirmed accounts (email_confirmed_at IS NULL)
//   - Requires all three factors — code + email + password
//   - Password is verified via signInWithPassword (Supabase returns
//     "Email not confirmed" if the password is correct but the email
//     hasn't been confirmed yet, which is exactly our case)
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    if (!checkIpRate(ip)) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera 10 minutos y prueba de nuevo.' },
        { status: 429 },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anonKey || !serviceKey) {
      console.error('[reset-registration] Missing env vars')
      return NextResponse.json({ error: 'Configuracion del servidor incompleta' }, { status: 500 })
    }

    const body = await request.json()
    const rawEmail = (body.email as string | undefined)?.trim().toLowerCase()
    const password = body.password as string | undefined
    const rawCode = (body.accessCode as string | undefined)?.trim().toUpperCase().replace(/-/g, '')

    if (!rawEmail || !password || !rawCode) {
      return NextResponse.json({ error: 'Faltan datos (email, contrasena y codigo)' }, { status: 400 })
    }

    if (rawCode.length !== 8) {
      return NextResponse.json({ error: 'El codigo debe tener 8 caracteres' }, { status: 400 })
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1) Find the auth user by email.
    //
    // Fast path: look up id in public.users (indexed on email via the
    // handle_new_user trigger). One call. Fallback: paginate auth.users if
    // the public row is missing for some reason (e.g. trigger hiccup).
    type TargetUser = { id: string; email?: string; email_confirmed_at?: string | null; user_metadata?: Record<string, unknown> }
    let targetUser: TargetUser | null = null

    const { data: publicUser } = await admin
      .from('users')
      .select('id')
      .eq('email', rawEmail)
      .maybeSingle()

    if (publicUser?.id) {
      const { data, error } = await admin.auth.admin.getUserById(publicUser.id)
      if (!error && data.user) {
        targetUser = {
          id: data.user.id,
          email: data.user.email,
          email_confirmed_at: data.user.email_confirmed_at,
          user_metadata: data.user.user_metadata as Record<string, unknown> | undefined,
        }
      }
    }

    // Fallback: auth.users paginated scan if fast path missed.
    if (!targetUser) {
      let page = 1
      const perPage = 100
      while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
        if (error) {
          console.error('[reset-registration] listUsers error:', error.message)
          return NextResponse.json({ error: 'Error al buscar la cuenta' }, { status: 500 })
        }
        const found = data.users.find(u => u.email?.toLowerCase() === rawEmail)
        if (found) {
          targetUser = {
            id: found.id,
            email: found.email,
            email_confirmed_at: found.email_confirmed_at,
            user_metadata: found.user_metadata as Record<string, unknown> | undefined,
          }
          break
        }
        if (data.users.length < perPage) break
        page++
      }
    }

    if (!targetUser) {
      return NextResponse.json({ error: 'No encontramos una cuenta con ese email' }, { status: 404 })
    }

    // 2) Only unconfirmed accounts can be recovered this way.
    //    Confirmed accounts must use password reset (forgot-password).
    if (targetUser.email_confirmed_at) {
      return NextResponse.json({
        error: 'Esta cuenta ya esta confirmada. Usa "Olvidaste tu contrasena?" en el login.',
      }, { status: 403 })
    }

    // 3) Verify the access code matches the one this user registered with.
    //    This is stored in user_metadata by the register flow.
    const metadataCode = (targetUser.user_metadata?.access_code as string | undefined)?.toUpperCase().replace(/-/g, '')
    if (!metadataCode || metadataCode !== rawCode) {
      return NextResponse.json({
        error: 'El codigo no coincide con el que se uso al registrarse',
      }, { status: 403 })
    }

    // 4) Verify the password by attempting signInWithPassword on a clean client.
    //    Expected outcomes:
    //    - "Email not confirmed" → password is correct (but email unconfirmed, which is our case)
    //    - "Invalid login credentials" → wrong password → reject
    //    - success → also OK (confirmation may be disabled)
    const anonClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInError } = await anonClient.auth.signInWithPassword({ email: rawEmail, password })
    if (signInError) {
      const msg = signInError.message.toLowerCase()
      const passwordOk = msg.includes('not confirmed') || msg.includes('email not confirmed')
      if (!passwordOk) {
        return NextResponse.json({ error: 'Contrasena incorrecta' }, { status: 403 })
      }
      // passwordOk === true: the server only blocked us because of confirmation,
      // which proves the password itself is right. Proceed.
    } else {
      // Unexpected but fine — sign out the ephemeral session immediately.
      await anonClient.auth.signOut()
    }

    // 5) All checks passed — delete the auth user and free the access code.
    //    Order matters: free the code BEFORE deleting the user (FK cleanup),
    //    though the delete-user flow also handles this as a safety net.
    const { error: freeError } = await admin
      .from('access_codes')
      .update({ used_by: null, used_at: null })
      .eq('used_by', targetUser.id)

    if (freeError) {
      console.error('[reset-registration] Free code error:', freeError.message)
      // Continue — deleting the user will cascade anyway via FK
    }

    // Clean up the public.users row (handle_new_user trigger creates it).
    // If this fails (e.g. the row doesn't exist) we can still proceed to delete auth.
    const { error: profileError } = await admin.from('users').delete().eq('id', targetUser.id)
    if (profileError) {
      console.warn('[reset-registration] Profile delete warning:', profileError.message)
    }

    // Also clean up any user_events rows (attendee memberships)
    await admin.from('user_events').delete().eq('user_id', targetUser.id)

    // Finally delete the auth user
    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUser.id)
    if (deleteError) {
      console.error('[reset-registration] deleteUser error:', deleteError.message)
      return NextResponse.json({ error: 'Error al eliminar la cuenta antigua' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[reset-registration] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
