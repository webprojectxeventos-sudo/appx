import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const STAFF_ROLES = ['admin', 'group_admin', 'scanner', 'promoter']

export async function POST(request: NextRequest) {
  try {
    // x-user-id injected by proxy after token verification
    const callerId = request.headers.get('x-user-id')
    if (!callerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    // Use anon key client to verify the caller is super_admin
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

    // Parse and validate request body
    const body = await request.json()
    const { userId, newPassword } = body as { userId?: string; newPassword?: string }

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId and newPassword are required' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return NextResponse.json({ error: 'Invalid userId format' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Verify the target user belongs to the same org and has a staff role
    const { data: targetUser } = await supabaseUser
      .from('users')
      .select('role, organization_id')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetUser.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User belongs to a different organization' }, { status: 403 })
    }

    if (!STAFF_ROLES.includes(targetUser.role)) {
      return NextResponse.json(
        { error: 'Can only change passwords for staff users (admin, group_admin, scanner, promoter)' },
        { status: 403 }
      )
    }

    // Use service role key for admin password change
    if (!serviceKey) {
      return NextResponse.json(
        { error: 'Service role key not configured — cannot update auth passwords' },
        { status: 503 }
      )
    }

    const supabaseAdmin = createClient(url, serviceKey)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (updateError) {
      console.error('[change-password] Supabase admin error:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[change-password] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
