import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCallerId } from '@/lib/api-auth'

/**
 * Self-service email update for authenticated users.
 *
 * Updates both auth.users and public.users, then re-sends
 * the ticket email to the new address.
 */
export async function POST(request: NextRequest) {
  try {
    const callerId = getCallerId(request)
    if (!callerId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const body = await request.json()
    const newEmail = (body.email as string | undefined)?.trim().toLowerCase()

    if (!newEmail) {
      return NextResponse.json({ error: 'Email es obligatorio' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: 'Formato de email invalido' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Get current user profile
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('id', callerId)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (currentUser.email === newEmail) {
      return NextResponse.json({ error: 'El email es el mismo que el actual' }, { status: 400 })
    }

    // Check email not taken by another user
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', newEmail)
      .neq('id', callerId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'Este email ya esta en uso' }, { status: 409 })
    }

    // Update auth email (with immediate confirmation — no verification email)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(callerId, {
      email: newEmail,
      email_confirm: true,
    })

    if (authError) {
      console.error('[update-email] Auth error:', authError.message)
      return NextResponse.json({ error: 'Error al actualizar el email' }, { status: 500 })
    }

    // Update profile table
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .update({ email: newEmail })
      .eq('id', callerId)

    if (profileError) {
      console.error('[update-email] Profile error:', profileError.message)
      return NextResponse.json({ error: 'Error al actualizar el perfil' }, { status: 500 })
    }

    // Re-send ticket(s) to the new email
    let ticketSent = false
    try {
      const { data: tickets } = await supabaseAdmin
        .from('tickets')
        .select('qr_code, event_id')
        .eq('user_id', callerId)
        .eq('status', 'valid')

      if (tickets && tickets.length > 0) {
        for (const ticket of tickets) {
          const { data: event } = await supabaseAdmin
            .from('events')
            .select('title, date, venue_id')
            .eq('id', ticket.event_id)
            .single()

          let venueName: string | undefined
          if (event?.venue_id) {
            const { data: venue } = await supabaseAdmin
              .from('venues')
              .select('name')
              .eq('id', event.venue_id)
              .single()
            venueName = venue?.name
          }

          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
          await fetch(`${baseUrl}/api/send-ticket`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': callerId,
            },
            body: JSON.stringify({
              to: newEmail,
              userName: currentUser.full_name || 'Asistente',
              eventTitle: event?.title || 'Evento',
              qrCode: ticket.qr_code,
              eventDate: event?.date,
              venueName,
            }),
          })
        }
        ticketSent = true
      }
    } catch (err) {
      console.error('[update-email] Ticket re-send error:', err)
      // Email was updated — don't fail the whole operation
    }

    return NextResponse.json({ success: true, ticketSent })
  } catch (err) {
    console.error('[update-email] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
