import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

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

    // Verify caller is super_admin
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

    const body = await request.json()
    const { userId, email, fullName, gender, venueId } = body as {
      userId?: string
      email?: string
      fullName?: string
      gender?: string | null
      venueId?: string | null
    }

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey)

    // Verify target user belongs to same org
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id, email, role, organization_id')
      .eq('id', userId)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (targetUser.organization_id !== callerProfile.organization_id) {
      return NextResponse.json({ error: 'User belongs to a different organization' }, { status: 403 })
    }

    // Build profile update
    const profileUpdate: Record<string, unknown> = {}
    if (fullName !== undefined) profileUpdate.full_name = fullName
    if (gender !== undefined) profileUpdate.gender = gender

    // venue_id editing — only applies to scanner / cloakroom. `null` clears
    // the binding. A non-null id is verified against the caller's org so a
    // compromised admin can't plant a scanner into another org's venue.
    if (venueId !== undefined) {
      if (targetUser.role !== 'scanner' && targetUser.role !== 'cloakroom') {
        return NextResponse.json({ error: 'venue_id solo aplica a roles scanner/cloakroom' }, { status: 400 })
      }
      if (venueId === null || venueId === '') {
        profileUpdate.venue_id = null
      } else {
        const { data: venue } = await supabaseAdmin
          .from('venues')
          .select('id, organization_id')
          .eq('id', venueId)
          .single()
        if (!venue || venue.organization_id !== callerProfile.organization_id) {
          return NextResponse.json({ error: 'Venue no encontrado o de otra organizacion' }, { status: 400 })
        }
        profileUpdate.venue_id = venueId
      }
    }

    // If email is changing, update both auth and profile
    if (email && email.toLowerCase().trim() !== targetUser.email) {
      const normalizedEmail = email.toLowerCase().trim()

      if (!normalizedEmail.includes('@') || normalizedEmail.length < 5) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }

      // Check email not taken
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .neq('id', userId)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }

      // Update auth email
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        email: normalizedEmail,
        email_confirm: true,
      })

      if (authError) {
        console.error('[update-user] Auth email error:', authError.message)
        return NextResponse.json({ error: 'Error updating auth email: ' + authError.message }, { status: 500 })
      }

      profileUpdate.email = normalizedEmail
    }

    // Update profile if there are changes
    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('users')
        .update(profileUpdate)
        .eq('id', userId)

      if (profileError) {
        console.error('[update-user] Profile error:', profileError.message)
        return NextResponse.json({ error: 'Error updating profile: ' + profileError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[update-user] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
