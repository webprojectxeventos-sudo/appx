import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

// Admin tool: inspect and release a consumed access code.
//
// Used when a user registered with the wrong email and cannot access
// the self-service recovery flow. An admin can paste the code, see
// who used it, and wipe both the user account and the code usage
// so the user can register again.
//
// GET  — lookup a code → returns { code_id, used_by, user_email, event_title, used_at }
// POST — release a code → deletes the auth user associated + frees the code

const ADMIN_ROLES = ['super_admin', 'admin']

async function verifyCaller(request: NextRequest) {
  const callerId = getCallerId(request)
  if (!callerId) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !serviceKey || !anonKey) {
    return { error: NextResponse.json({ error: 'Configuracion del servidor incompleta' }, { status: 500 }) }
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
    return { error: NextResponse.json({ error: 'Se requiere rol admin o super_admin' }, { status: 403 }) }
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return { admin, callerProfile, callerId }
}

function cleanCode(raw: string | undefined): string | null {
  if (!raw) return null
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.length === 8 ? clean : null
}

// Lookup — does the code exist, is it used, and by whom?
export async function GET(request: NextRequest) {
  try {
    const verified = await verifyCaller(request)
    if ('error' in verified) return verified.error
    const { admin, callerProfile } = verified

    const code = cleanCode(request.nextUrl.searchParams.get('code') || undefined)
    if (!code) {
      return NextResponse.json({ error: 'Codigo invalido (debe tener 8 caracteres)' }, { status: 400 })
    }

    // Fetch the code row + associated event
    const { data: codeRow, error: codeError } = await admin
      .from('access_codes')
      .select('id, code, used_by, used_at, event_id, is_active, events!inner(id, title, group_name, organization_id)')
      .eq('code', code)
      .maybeSingle()

    if (codeError) {
      console.error('[release-code] code query error:', codeError.message)
      return NextResponse.json({ error: 'Error al buscar el codigo' }, { status: 500 })
    }
    if (!codeRow) {
      return NextResponse.json({ error: 'Codigo no encontrado' }, { status: 404 })
    }

    // Org isolation: admins can only touch codes in their own org
    type EventRef = { id: string; title: string; group_name: string | null; organization_id: string }
    const eventData = (Array.isArray(codeRow.events) ? codeRow.events[0] : codeRow.events) as EventRef | undefined
    if (!eventData || eventData.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Este codigo pertenece a otra organizacion' }, { status: 403 })
    }

    if (!codeRow.used_by) {
      return NextResponse.json({
        code: codeRow.code,
        isUsed: false,
        eventTitle: eventData.group_name || eventData.title,
      })
    }

    // Fetch the user that consumed it
    const { data: userRow } = await admin
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', codeRow.used_by)
      .maybeSingle()

    return NextResponse.json({
      code: codeRow.code,
      isUsed: true,
      usedAt: codeRow.used_at,
      eventTitle: eventData.group_name || eventData.title,
      user: userRow
        ? { id: userRow.id, email: userRow.email, fullName: userRow.full_name, role: userRow.role }
        : { id: codeRow.used_by, email: null, fullName: null, role: null },
    })
  } catch (err) {
    console.error('[release-code] GET error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// Release — delete the user and free the code
export async function POST(request: NextRequest) {
  try {
    const verified = await verifyCaller(request)
    if ('error' in verified) return verified.error
    const { admin, callerProfile } = verified

    const body = await request.json()
    const code = cleanCode(body.code as string | undefined)
    if (!code) {
      return NextResponse.json({ error: 'Codigo invalido (debe tener 8 caracteres)' }, { status: 400 })
    }

    // Find the code + verify org
    const { data: codeRow, error: codeError } = await admin
      .from('access_codes')
      .select('id, used_by, event_id, events!inner(organization_id)')
      .eq('code', code)
      .maybeSingle()

    if (codeError) {
      console.error('[release-code] code query error:', codeError.message)
      return NextResponse.json({ error: 'Error al buscar el codigo' }, { status: 500 })
    }
    if (!codeRow) {
      return NextResponse.json({ error: 'Codigo no encontrado' }, { status: 404 })
    }
    type EventOrg = { organization_id: string }
    const eventData = (Array.isArray(codeRow.events) ? codeRow.events[0] : codeRow.events) as EventOrg | undefined
    if (!eventData || eventData.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'Este codigo pertenece a otra organizacion' }, { status: 403 })
    }

    const userId = codeRow.used_by
    if (!userId) {
      return NextResponse.json({ error: 'Este codigo ya estaba libre' }, { status: 400 })
    }

    // Free the code FIRST (clears the FK reference)
    const { error: freeError } = await admin
      .from('access_codes')
      .update({ used_by: null, used_at: null })
      .eq('id', codeRow.id)

    if (freeError) {
      console.error('[release-code] free error:', freeError.message)
      return NextResponse.json({ error: 'Error al liberar el codigo' }, { status: 500 })
    }

    // Clean up related rows in parallel (attendee-only cleanup)
    await Promise.all([
      admin.from('poll_votes').delete().eq('user_id', userId),
      admin.from('message_reactions').delete().eq('user_id', userId),
      admin.from('playlist_votes').delete().eq('user_id', userId),
      admin.from('messages').delete().eq('user_id', userId),
      admin.from('drink_orders').delete().eq('user_id', userId),
      admin.from('tickets').delete().eq('user_id', userId),
      admin.from('user_events').delete().eq('user_id', userId),
      admin.from('push_subscriptions').delete().eq('user_id', userId),
    ])

    // Delete the profile row
    const { error: profileError } = await admin.from('users').delete().eq('id', userId)
    if (profileError) {
      console.warn('[release-code] profile delete warning:', profileError.message)
    }

    // Delete the auth user
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      console.error('[release-code] auth delete error:', authError.message)
      return NextResponse.json({ error: 'Codigo liberado pero no se pudo borrar la cuenta auth' }, { status: 500 })
    }

    return NextResponse.json({ success: true, freed: true })
  } catch (err) {
    console.error('[release-code] POST error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
