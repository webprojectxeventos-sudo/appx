import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(req: Request) {
  try {
    const { to, userName, eventTitle, qrCode } = await req.json()

    if (!to || !userName || !eventTitle || !qrCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrCode)}&bgcolor=ffffff&color=000000&margin=10`

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tu entrada — Project X</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:28px;font-weight:800;letter-spacing:0.15em;color:#ffffff;">PROJECT X</p>
              <p style="margin:6px 0 0;font-size:13px;color:#666666;letter-spacing:0.05em;text-transform:uppercase;">${eventTitle}</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px 28px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#ffffff;">Hola, ${userName.split(' ')[0]} 👋</p>
              <p style="margin:0 0 28px;font-size:14px;color:#888888;line-height:1.6;">
                Tu registro está confirmado. Aquí tienes tu entrada para <strong style="color:#cccccc;">${eventTitle}</strong>.
                Presenta el código QR en la entrada del evento.
              </p>

              <!-- QR Section -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background-color:#ffffff;border-radius:16px;padding:24px;">
                    <img src="${qrImageUrl}" width="220" height="220" alt="Código QR de entrada" style="display:block;border:0;" />
                    <p style="margin:12px 0 0;font-size:11px;color:#999999;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Entrada personal e intransferible</p>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.06);"></td>
                </tr>
              </table>

              <!-- Info -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px 16px;background-color:rgba(228,30,43,0.06);border:1px solid rgba(228,30,43,0.15);border-radius:10px;">
                    <p style="margin:0;font-size:13px;color:#cccccc;line-height:1.5;">
                      📱 También puedes ver tu QR en la app en cualquier momento desde la pantalla principal.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center">
                    <a href="https://app.projectxeventos.es" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#e41e2b,#c01020);color:#ffffff;text-decoration:none;border-radius:12px;font-size:14px;font-weight:700;letter-spacing:0.02em;">
                      Abrir la App →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0 0 4px;font-size:11px;color:#444444;">JV Group Premium Events &amp; Business S.L. · CIF B26773564</p>
              <p style="margin:0 0 4px;font-size:11px;color:#444444;">Avda. Juan Carlos I, n.13, Torre Garena, planta 5 · 28806 Alcalá de Henares, Madrid</p>
              <p style="margin:0;font-size:11px;color:#444444;">
                <a href="mailto:contacto@projectxeventos.es" style="color:#666666;text-decoration:none;">contacto@projectxeventos.es</a>
                &nbsp;·&nbsp;
                <a href="https://projectxeventos.es" style="color:#666666;text-decoration:none;">projectxeventos.es</a>
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
      subject: `Tu entrada para ${eventTitle} — Project X`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-ticket] Error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
