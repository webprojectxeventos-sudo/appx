import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// Per-user rate limit: 20/hour. A user legitimately resends their ticket
// a few times on a bad day; anything above that is abuse.
const RATE_WINDOW_MS = 60 * 60_000
const RATE_LIMIT_PER_USER = 20
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
    let userId = req.headers.get('x-user-id')
    if (!userId) {
      const auth = req.headers.get('Authorization')
      if (auth?.startsWith('Bearer ')) {
        try { const p = JSON.parse(atob(auth.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.exp * 1000 > Date.now()) userId = p.sub } catch {}
      }
    }
    if (!userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!rateOk(userId)) {
      return NextResponse.json({ error: 'Demasiados envios. Espera una hora.' }, { status: 429 })
    }

    const { qrCode, eventDate, venueName } = await req.json()
    if (!qrCode || typeof qrCode !== 'string') {
      return NextResponse.json({ error: 'Missing qrCode' }, { status: 400 })
    }

    // ── Ownership check ─────────────────────────────────────────────────
    //
    // Previously this endpoint trusted `to`, `userName`, `eventTitle` from
    // the body — any authenticated attendee could send arbitrary emails
    // with attacker-controlled content to any address (phishing / SMTP
    // exhaustion). Now we look up the ticket by qr_code, verify the caller
    // owns it (or is org staff), and build the email from authoritative DB
    // fields only.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const sb = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: ticket } = await sb
      .from('tickets')
      .select('id, user_id, event_id, qr_code')
      .eq('qr_code', qrCode)
      .maybeSingle()
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
    }

    // Caller must own the ticket OR be admin/super_admin in the event's org.
    let authorized = ticket.user_id === userId
    if (!authorized) {
      const [{ data: caller }, { data: event }] = await Promise.all([
        sb.from('users').select('role, organization_id').eq('id', userId).single(),
        sb.from('events').select('organization_id').eq('id', ticket.event_id).single(),
      ])
      if (
        caller &&
        event &&
        (caller.role === 'super_admin' ||
          (caller.role === 'admin' && caller.organization_id === event.organization_id))
      ) {
        authorized = true
      }
    }
    if (!authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    // Build the email from DB-authoritative fields (never from body).
    const [{ data: owner }, { data: event }] = await Promise.all([
      sb.from('users').select('email, full_name').eq('id', ticket.user_id).single(),
      sb.from('events').select('title, date, venue_id').eq('id', ticket.event_id).single(),
    ])
    if (!owner?.email || !event?.title) {
      return NextResponse.json({ error: 'Datos de entrada incompletos' }, { status: 500 })
    }

    let venueResolved: string | null = typeof venueName === 'string' ? venueName : null
    if (!venueResolved && event.venue_id) {
      const { data: v } = await sb.from('venues').select('name').eq('id', event.venue_id).single()
      venueResolved = v?.name ?? null
    }

    const to = owner.email
    const userName = owner.full_name || 'Asistente'
    const eventTitle = event.title
    const eventDateResolved = eventDate ?? event.date ?? null

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // HTML-escape user-provided strings to prevent XSS in emails
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}&bgcolor=ffffff&color=000000&margin=12`

    const formattedDate = eventDateResolved
      ? new Date(eventDateResolved).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : null

    const safeUserName = esc(userName)
    const safeEventTitle = esc(eventTitle)
    const safeVenueName = venueResolved ? esc(venueResolved) : null
    const firstName = safeUserName.split(' ')[0]

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu entrada — Project X</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#050505;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:12px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:32px;font-weight:900;letter-spacing:0.18em;color:#ffffff;padding-right:4px;">P</td>
                  <td style="font-size:32px;font-weight:900;letter-spacing:0.18em;color:#e41e2b;">X</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tagline -->
          <tr>
            <td align="center" style="padding-bottom:36px;">
              <p style="margin:0;font-size:11px;color:#555555;letter-spacing:0.15em;text-transform:uppercase;">Tu entrada esta lista</p>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:linear-gradient(180deg,#111111 0%,#0d0d0d 100%);border:1px solid rgba(255,255,255,0.06);border-radius:24px;overflow:hidden;">

              <!-- Gold accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a843,transparent);"></td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 28px 28px;">
                <tr>
                  <td>
                    <!-- Greeting -->
                    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">Hola, ${firstName}</p>
                    <p style="margin:0 0 28px;font-size:14px;color:#777777;line-height:1.6;">
                      Tu registro para <strong style="color:#d4a843;">${safeEventTitle}</strong> esta confirmado. Presenta este codigo QR en la entrada.
                    </p>
                  </td>
                </tr>

                <!-- Event Details -->
                ${formattedDate || safeVenueName ? `
                <tr>
                  <td style="padding-bottom:24px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;">
                      ${formattedDate ? `
                      <tr>
                        <td style="padding-bottom:${safeVenueName ? '10px' : '0'};">
                          <p style="margin:0;font-size:11px;color:#555555;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Fecha</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#cccccc;font-weight:500;text-transform:capitalize;">${formattedDate}</p>
                        </td>
                      </tr>
                      ` : ''}
                      ${safeVenueName ? `
                      <tr>
                        <td>
                          <p style="margin:0;font-size:11px;color:#555555;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Lugar</p>
                          <p style="margin:4px 0 0;font-size:14px;color:#cccccc;font-weight:500;">${safeVenueName}</p>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- QR Code -->
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;padding:20px;">
                      <tr>
                        <td align="center">
                          <img src="${qrImageUrl}" width="240" height="240" alt="Codigo QR" style="display:block;border:0;border-radius:8px;" />
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0;font-size:10px;color:#444444;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;">Entrada personal e intransferible</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px;">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.05);"></td>
                </tr>
              </table>

              <!-- Info note -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 28px 28px;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(212,168,67,0.06);border:1px solid rgba(212,168,67,0.12);border-radius:12px;padding:14px 18px;">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:13px;color:#999999;line-height:1.5;">
                            Tambien puedes ver tu QR en la app en cualquier momento desde la pantalla principal.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- CTA Button -->
                <tr>
                  <td align="center" style="padding-top:24px;">
                    <a href="https://app.projectxeventos.es" style="display:inline-block;padding:15px 40px;background:linear-gradient(135deg,#e41e2b,#b81822);color:#ffffff;text-decoration:none;border-radius:14px;font-size:14px;font-weight:700;letter-spacing:0.02em;">
                      Abrir la App
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <p style="margin:0 0 6px;font-size:10px;color:#333333;letter-spacing:0.05em;">JV Group Premium Events &amp; Business S.L.</p>
              <p style="margin:0 0 4px;font-size:10px;color:#333333;">Avda. Juan Carlos I, n.13, Torre Garena, planta 5</p>
              <p style="margin:0 0 8px;font-size:10px;color:#333333;">28806 Alcala de Henares, Madrid</p>
              <p style="margin:0;font-size:10px;">
                <a href="mailto:contacto@projectxeventos.es" style="color:#444444;text-decoration:none;">contacto@projectxeventos.es</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    await transporter.sendMail({
      from: `"Project X" <${process.env.SMTP_FROM}>`,
      to,
      subject: `Tu entrada para ${safeEventTitle} — Project X`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-ticket] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
