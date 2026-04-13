import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  // Verify caller via JWT
  const authHeader = request.headers.get('Authorization') || ''
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { event_id } = await request.json()
  if (!event_id) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  }

  // Verify caller is admin for this event
  const { data: memberships } = await userClient
    .from('user_events')
    .select('event_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const adminRoles = ['admin', 'super_admin', 'group_admin']
  const hasAccess = memberships?.some(
    m => m.event_id === event_id && adminRoles.includes(m.role)
  )
  if (!hasAccess) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Get event + venue info
  const { data: eventData } = await sb
    .from('events')
    .select('id, title, date, location, group_name, venue_id')
    .eq('id', event_id)
    .single()
  if (!eventData) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  let venueName = ''
  let venueAddress = ''
  if (eventData.venue_id) {
    const { data: venue } = await sb
      .from('venues')
      .select('name, address, city')
      .eq('id', eventData.venue_id)
      .single()
    if (venue) {
      venueName = venue.name || ''
      venueAddress = [venue.address, venue.city].filter(Boolean).join(', ')
    }
  }

  // Get all attendees with tickets for this event
  const { data: tickets } = await sb
    .from('tickets')
    .select('user_id')
    .eq('event_id', event_id)

  if (!tickets || tickets.length === 0) {
    return NextResponse.json({ error: 'No attendees found' }, { status: 404 })
  }

  const userIds = [...new Set(tickets.map(t => t.user_id))]

  // Fetch user emails + names
  const users: { email: string; full_name: string | null }[] = []
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100)
    const { data } = await sb
      .from('users')
      .select('email, full_name')
      .in('id', chunk)
    if (data) users.push(...data)
  }

  // Filter out fake door emails
  const realUsers = users.filter(u => u.email && !u.email.endsWith('@puerta.local'))

  if (realUsers.length === 0) {
    return NextResponse.json({ error: 'No real email addresses found' }, { status: 404 })
  }

  // Determine authorization type based on group name
  const isESO = (eventData.group_name || '').toLowerCase().includes('eso')
  const authType = isESO ? 'Fiesta ESO' : 'Fiesta Bachillerato'
  const authPdfUrl = isESO
    ? 'https://app.projectxeventos.es/autorizacion-eso.pdf'
    : 'https://app.projectxeventos.es/autorizacion-bachillerato.pdf'

  const formattedDate = eventData.date
    ? new Date(eventData.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const safeTitle = esc(eventData.title)

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  const buildHtml = (firstName: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio — ${safeTitle}</title>
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
              <p style="margin:0;font-size:11px;color:#555555;letter-spacing:0.15em;text-transform:uppercase;">Recordatorio importante</p>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:linear-gradient(180deg,#111111 0%,#0d0d0d 100%);border:1px solid rgba(255,255,255,0.06);border-radius:24px;overflow:hidden;">

              <!-- Red accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#e41e2b,transparent);"></td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 28px 12px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Hola, ${firstName} 👋</p>
                    <p style="margin:0 0 20px;font-size:15px;color:#cccccc;line-height:1.7;">
                      Tu fiesta <strong style="color:#d4a843;">${safeTitle}</strong> es <strong style="color:#ffffff;">mañana</strong>.
                    </p>
                    <p style="margin:0 0 24px;font-size:14px;color:#999999;line-height:1.7;">
                      Lo primero: disfrutad mucho de la ceremonia, es un dia muy especial. Y para que todo salga perfecto en la fiesta, asegurate de llevar todo preparado.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Event details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px 20px;">
                <tr>
                  <td style="background-color:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;">
                    ${formattedDate ? `<p style="margin:0 0 8px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Fecha</p>
                    <p style="margin:0 0 14px;font-size:14px;color:#ccc;font-weight:500;text-transform:capitalize;">${formattedDate}</p>` : ''}
                    ${venueAddress ? `<p style="margin:0 0 8px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Lugar</p>
                    <p style="margin:0;font-size:14px;color:#ccc;font-weight:500;">${esc(venueName)}${venueAddress ? ` — ${esc(venueAddress)}` : ''}</p>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Checklist -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#ffffff;">📋 Checklist — ¿Lo tienes todo?</p>

                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(228,30,43,0.06);border:1px solid rgba(228,30,43,0.15);border-radius:14px;padding:6px 0;">
                      <tr>
                        <td style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.04);">
                          <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✅ DNI / Pasaporte / NIE</p>
                          <p style="margin:4px 0 0;font-size:11px;color:#888;">Documento original en fisico. NO vale foto en el movil.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.04);">
                          <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✅ Tu entrada (QR)</p>
                          <p style="margin:4px 0 0;font-size:11px;color:#888;">Abre la app y ten tu QR preparado.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.04);">
                          <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✅ Autorizacion ${esc(authType)} (menores de 18)</p>
                          <p style="margin:4px 0 0;font-size:11px;color:#888;">IMPRESA y firmada por padre/madre/tutor. NO vale en el movil.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 18px;">
                          <p style="margin:0;font-size:14px;color:#ffffff;font-weight:600;">✅ Fotocopia del DNI del padre/madre/tutor</p>
                          <p style="margin:4px 0 0;font-size:11px;color:#888;">Del que firme la autorizacion. IMPRESO, no vale foto.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px 24px;">
                <tr>
                  <td style="background-color:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.2);border-radius:14px;padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#e4c06a;font-weight:700;">⚠️ IMPORTANTE</p>
                    <p style="margin:8px 0 0;font-size:13px;color:#bbbbbb;line-height:1.6;">
                      Todo lo anterior tiene que estar <strong style="color:#ffffff;">en fisico, impreso en papel</strong>. No se aceptan fotos ni documentos en el movil. Sin estos documentos no se puede acceder a la fiesta.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Download authorization CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:0 28px 28px;">
                <tr>
                  <td align="center">
                    <a href="${authPdfUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#e41e2b,#b81822);color:#ffffff;text-decoration:none;border-radius:14px;font-size:14px;font-weight:700;letter-spacing:0.02em;">
                      📄 Descargar autorizacion
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:20px;">
                    <a href="https://app.projectxeventos.es" style="display:inline-block;padding:14px 32px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:#ffffff;text-decoration:none;border-radius:14px;font-size:14px;font-weight:600;">
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

  // Send emails in batches of 10
  let sent = 0
  let failed = 0
  const batchSize = 10

  for (let i = 0; i < realUsers.length; i += batchSize) {
    const batch = realUsers.slice(i, i + batchSize)
    const results = await Promise.allSettled(
      batch.map(u => {
        const firstName = esc((u.full_name || 'amigo').split(' ')[0])
        return transporter.sendMail({
          from: `"Project X" <${process.env.SMTP_FROM}>`,
          to: u.email,
          subject: `📋 Recordatorio: ${safeTitle} es mañana — ¿Lo tienes todo?`,
          html: buildHtml(firstName),
        })
      })
    )
    results.forEach(r => {
      if (r.status === 'fulfilled') sent++
      else failed++
    })
  }

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: realUsers.length,
  })
}
