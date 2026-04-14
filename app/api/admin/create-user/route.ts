import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

const VALID_ROLES = ['attendee', 'admin', 'group_admin', 'scanner', 'promoter', 'super_admin']

export async function POST(request: NextRequest) {
  try {
    const callerId = getCallerId(request)
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Verify the caller is super_admin
    const authHeader = request.headers.get('Authorization') || ''
    const supabaseUser = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: callerProfile } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', callerId)
      .single()

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: super_admin role required' }, { status: 403 })
    }

    // Parse body
    const body = await request.json()
    const { email, password, fullName, role, gender } = body as {
      email?: string
      password?: string
      fullName?: string
      role?: string
      gender?: string
    }

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'email, password y role son obligatorios' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'La contrasena debe tener al menos 6 caracteres' }, { status: 400 })
    }

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: `Rol invalido. Roles validos: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    // Basic email format check (loose — super admin can use invented emails)
    if (!email.includes('@') || email.length < 5) {
      return NextResponse.json({ error: 'Formato de email invalido' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Check if email already exists in users table
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existingUser) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }

    // Create auth user with admin API (no confirmation email, auto-verified)
    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || null,
        gender: gender || null,
      },
    })

    if (createError) {
      console.error('[create-user] Auth error:', createError.message)
      // Handle duplicate in auth (edge case if user exists in auth but not in users table)
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email en el sistema de autenticacion' }, { status: 409 })
      }
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }

    if (!newAuthUser?.user?.id) {
      return NextResponse.json({ error: 'Error inesperado al crear usuario' }, { status: 500 })
    }

    // The `handle_new_user` Supabase trigger auto-creates the `public.users` row
    // when `auth.admin.createUser` runs, so we must UPDATE (not INSERT) to fill in
    // role, full_name, gender, and organization_id.
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .update({
        full_name: fullName || null,
        gender: gender || null,
        role,
        organization_id: callerProfile.organization_id,
      })
      .eq('id', newAuthUser.user.id)

    if (profileError) {
      console.error('[create-user] Profile error:', profileError.message)
      // Try to clean up the auth user if profile update fails
      await supabaseAdmin.auth.admin.deleteUser(newAuthUser.user.id).catch(() => {})
      return NextResponse.json({ error: 'Error al crear perfil de usuario: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newAuthUser.user.id,
        email: email.toLowerCase().trim(),
        role,
        full_name: fullName || null,
      },
    })
  } catch (err) {
    console.error('[create-user] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
