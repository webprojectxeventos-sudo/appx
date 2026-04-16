import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Public endpoint — no authentication required.
 *
 * Lets an attendee fix a wrong email using their access code.
 * Flow: access_code + new_email → update auth + profile → re-send ticket.
 *
 * Security: the access code is a secret shared only with the attendee.
 * Each code is unique (8 random alphanumeric chars = ~2.8 trillion combos).
 */
export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const body = await request.json()
    const rawCode = (body.accessCode as string | undefined)?.trim().toUpperCase().replace(/-/g, '')
    const newEmail = (body.email as string | undefined)?.trim().toLowerCase()

    if (!rawCode || !newEmail) {
      return NextResponse.json({ error: 'Codigo y email son obligatorios' }, { status: 400 })
    }

    if (rawCode.length !== 8) {
      return NextResponse.json({ error: 'El codigo debe tener 8 caracteres (ej: AULM-LUJ2)' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: 'Formato de email invalido' }, { status: 400 })
    }

    const supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Find the access code (stored without dashes)
    const { data: codeRow } = await supabaseAdmin
      .from('access_codes')
      .select('id, code, used_by, event_id')
      .eq('code', rawCode)
      .maybeSingle()

    if (!codeRow) {
      return NextResponse.json({ error: 'Codigo no encontrado' }, { status: 404 })
    }

    if (!codeRow.used_by) {
      return NextResponse.json({
        error: 'Este codigo aun no ha sido usado. Registrate primero en la app.',
      }, { status: 400 })
    }

    const userId = codeRow.used_by

    // Get the user who used this code
    const { data: currentUser } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('id', userId)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // If the email is already correct, nothing to do
    if (currentUser.email === newEmail) {
      return NextResponse.json({
        error: 'Tu email ya es correcto. Revisa tu bandeja de spam.',
      }, { status: 400 })
    }

    // Check email not taken by another user
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', newEmail)
      .neq('id', userId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        error: 'Este email ya esta en uso por otra cuenta',
      }, { status: 409 })
    }

    // Update auth email (immediate confirmation, no verification email)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })

    if (authError) {
      console.error('[fix-email] Auth error:', authError.message)
      return NextResponse.json({ error: 'Error al actualizar el email' }, { status: 500 })
    }

    // Update profile table
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .update({ email: newEmail })
      .eq('id', userId)

    if (profileError) {
      console.error('[fix-email] Profile error:', profileError.message)
      // Auth was already updated — log but continue
    }

    // Re-send ticket to the new email
    let ticketSent = false
    try {
      const { data: ticket } = await supabaseAdmin
        .from('tickets')
        .select('qr_code, event_id')
        .eq('user_id', userId)
        .eq('status', 'valid')
        .maybeSingle()

      if (ticket) {
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
        const sendRes = await fetch(`${baseUrl}/api/send-ticket`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
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
        ticketSent = sendRes.ok
      }
    } catch (err) {
      console.error('[fix-email] Ticket re-send error:', err)
    }

    return NextResponse.json({
      success: true,
      ticketSent,
    })
  } catch (err) {
    console.error('[fix-email] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
