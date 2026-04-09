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
    const { email, fullName, gender, eventId, addedBy, organizationId } = await req.json()

    if (!email || !fullName || !eventId) {
      return NextResponse.json({ error: 'email, fullName, and eventId are required' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())

    if (existing) {
      // User exists — just assign to event
      const { data: assignResult, error: assignError } = await supabase.rpc('assign_user_to_event', {
        p_user_id: existing.id,
        p_event_id: eventId,
        p_added_by: addedBy || null,
      })

      if (assignError) {
        return NextResponse.json({ error: assignError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        userId: existing.id,
        alreadyExisted: true,
        fullName: null, // We don't expose existing user data
      })
    }

    // Create new user with random password (they can reset it later)
    const randomPassword = crypto.randomUUID().slice(0, 16) + '!Aa1'
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: randomPassword,
      email_confirm: true, // Auto-confirm so they can use forgot-password
      user_metadata: {
        full_name: fullName,
        gender: gender || null,
        event_id: eventId,
      },
    })

    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 500 })
    }

    // Create profile in users table
    const { error: profileError } = await supabase.from('users').insert({
      id: newUser.user.id,
      email,
      full_name: fullName,
      gender: gender || null,
      role: 'attendee',
      event_id: eventId,
      organization_id: organizationId || null,
    })

    if (profileError) {
      // Profile might already exist from trigger — ignore
      console.warn('[promoter/create-user] Profile insert warn:', profileError.message)
    }

    // Add to event
    await supabase.from('user_events').upsert({
      user_id: newUser.user.id,
      event_id: eventId,
      role: 'attendee',
      added_by: addedBy || null,
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
