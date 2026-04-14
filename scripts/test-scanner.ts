/**
 * Test Scanner — crea un usuario scanner, asistentes de prueba con tickets,
 * y simula un escaneo masivo sobre los eventos existentes.
 *
 * Uso:
 *   npx tsx scripts/test-scanner.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Config ───────────────────────────────────────────────────────────────────
const SCANNER_EMAIL = 'scanner@projectx.test'
const SCANNER_PASS = 'Scanner123'
const ATTENDEES_PER_EVENT = 30
const SCAN_BATCH_SIZE = 10 // tickets to scan per event in the test
const SCAN_DELAY_MS = 150  // ms between scans (simulates real speed)

// ── Helpers ──────────────────────────────────────────────────────────────────
const NOMBRES = [
  'Alejandro', 'María', 'Carlos', 'Laura', 'Pablo', 'Ana', 'Daniel', 'Sofía',
  'Javier', 'Carmen', 'David', 'Lucía', 'Adrián', 'Marta', 'Álvaro', 'Paula',
  'Hugo', 'Elena', 'Diego', 'Irene', 'Sergio', 'Andrea', 'Mario', 'Sara',
  'Raúl', 'Claudia', 'Rubén', 'Alba', 'Iván', 'Nerea',
]
const APELLIDOS = [
  'García', 'Martínez', 'López', 'Sánchez', 'González', 'Rodríguez', 'Fernández',
  'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Muñoz', 'Romero',
]

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const randomCode = (n: number) => {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]
  return s
}
const randomQR = (eventId: string) => `PX-${eventId.substring(0, 8)}-${randomCode(24)}`
const randomName = () => `${pick(NOMBRES)} ${pick(APELLIDOS)} ${pick(APELLIDOS)}`
const cleanEmail = (name: string, i: number) =>
  `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')}.${i}@test.scanner.dev`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log('🔍 Fetching existing events & org...\n')

  // 1. Get existing events
  const { data: events, error: evErr } = await sb
    .from('events')
    .select('id, title, group_name, event_code, venue_id, organization_id, date')
    .order('date', { ascending: true })
  if (evErr) throw evErr
  if (!events || events.length === 0) {
    console.error('❌ No events found. Create events first.')
    process.exit(1)
  }
  console.log(`📅 Found ${events.length} events:`)
  events.forEach(e => console.log(`   • ${e.group_name || e.title} (${e.event_code})`))

  const orgId = events[0].organization_id

  // 2. Create or reuse scanner auth user
  console.log(`\n👤 Creating scanner user: ${SCANNER_EMAIL}`)
  let scannerId: string

  // Check if already exists
  const { data: existingUser } = await sb.from('users').select('id').eq('email', SCANNER_EMAIL).single()
  if (existingUser) {
    scannerId = existingUser.id
    console.log(`   ♻️  Already exists (${scannerId}), reusing`)
  } else {
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email: SCANNER_EMAIL,
      password: SCANNER_PASS,
      email_confirm: true,
    })
    if (authErr) throw new Error(`Auth create failed: ${authErr.message}`)
    scannerId = authData.user.id

    await sb.from('users').insert({
      id: scannerId,
      email: SCANNER_EMAIL,
      full_name: 'Scanner Test',
      role: 'scanner',
      event_id: events[0].id,
      organization_id: orgId,
      gender: 'otro',
    })
    console.log(`   ✅ Created (${scannerId})`)
  }

  // 3. Assign scanner to ALL events via user_events
  console.log(`\n🔑 Assigning scanner to ${events.length} events...`)
  for (const ev of events) {
    await sb.from('user_events').upsert(
      { user_id: scannerId, event_id: ev.id, role: 'scanner' as const, is_active: true },
      { onConflict: 'user_id,event_id' }
    )
  }
  console.log('   ✅ Scanner has access to all events')

  // 4. Create test attendees + tickets per event
  let totalCreated = 0
  const allTickets: { qr: string; eventId: string; eventName: string }[] = []

  for (const ev of events) {
    const label = ev.group_name || ev.title
    console.log(`\n📋 [${label}] Creating ${ATTENDEES_PER_EVENT} attendees + tickets...`)

    // Check existing ticket count
    const { count: existingTickets } = await sb
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ev.id)

    if ((existingTickets || 0) >= ATTENDEES_PER_EVENT) {
      // Already has enough data, just grab existing tickets
      const { data: existingQR } = await sb
        .from('tickets')
        .select('qr_code')
        .eq('event_id', ev.id)
        .eq('status', 'valid')
        .limit(SCAN_BATCH_SIZE)
      if (existingQR) {
        existingQR.forEach(t => allTickets.push({ qr: t.qr_code, eventId: ev.id, eventName: label }))
      }
      console.log(`   ♻️  Already has ${existingTickets} tickets, skipping creation`)
      continue
    }

    const attendeeIds: string[] = []
    for (let i = 0; i < ATTENDEES_PER_EVENT; i++) {
      const name = randomName()
      const email = cleanEmail(name, totalCreated + i)

      try {
        const { data: authData, error: authErr } = await sb.auth.admin.createUser({
          email,
          password: 'Test1234',
          email_confirm: true,
        })
        if (authErr) {
          // Skip if user exists
          if (authErr.message.includes('already')) continue
          throw authErr
        }
        const uid = authData.user.id
        attendeeIds.push(uid)

        await sb.from('users').insert({
          id: uid, email, full_name: name, role: 'attendee',
          event_id: ev.id, organization_id: orgId,
          gender: pick(['masculino', 'femenino', 'otro'] as const),
        })
      } catch (err: any) {
        // Non-fatal: skip this attendee
        if (!err.message?.includes('already')) console.warn(`   ⚠️  Skip ${email}: ${err.message}`)
      }
    }

    // user_events memberships
    if (attendeeIds.length > 0) {
      await sb.from('user_events').insert(
        attendeeIds.map(id => ({
          user_id: id, event_id: ev.id, role: 'attendee' as const, is_active: true,
        }))
      )

      // Tickets
      const ticketRows = attendeeIds.map(uid => ({
        user_id: uid,
        event_id: ev.id,
        qr_code: randomQR(ev.id),
        status: 'valid' as const,
      }))
      await sb.from('tickets').insert(ticketRows)

      ticketRows.slice(0, SCAN_BATCH_SIZE).forEach(t =>
        allTickets.push({ qr: t.qr_code, eventId: ev.id, eventName: label })
      )

      totalCreated += attendeeIds.length
      console.log(`   ✅ ${attendeeIds.length} attendees + tickets created`)
    }
  }

  // ── 5. MASS SCAN TEST ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('🚀 MASS SCAN TEST')
  console.log('═'.repeat(60))
  console.log(`Scanning ${allTickets.length} tickets across ${events.length} events...\n`)

  // Authenticate as scanner
  const { data: scannerSession, error: loginErr } = await sb.auth.signInWithPassword({
    email: SCANNER_EMAIL,
    password: SCANNER_PASS,
  })
  if (loginErr) throw new Error(`Scanner login failed: ${loginErr.message}`)

  // Create authenticated client for scanner
  const scannerClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${scannerSession.session!.access_token}` } },
  })

  // Actually, we need to use anon key + scanner's JWT for proper RLS
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const scannerRPC = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${scannerSession.session!.access_token}` } },
  })

  let scanned = 0
  let failed = 0
  const scanTimes: number[] = []
  const eventResults: Record<string, { ok: number; fail: number }> = {}

  // Shuffle tickets for realistic multi-event scanning
  const shuffled = [...allTickets].sort(() => Math.random() - 0.5)

  for (const ticket of shuffled) {
    const t1 = Date.now()
    const { data, error } = await scannerRPC.rpc('scan_ticket', { ticket_qr: ticket.qr })
    const elapsed = Date.now() - t1
    scanTimes.push(elapsed)

    if (!eventResults[ticket.eventName]) eventResults[ticket.eventName] = { ok: 0, fail: 0 }

    const result = data as any
    if (error || !result?.success) {
      failed++
      eventResults[ticket.eventName].fail++
      const reason = error?.message || result?.error || 'unknown'
      console.log(`   ❌ [${ticket.eventName}] FAIL (${elapsed}ms): ${reason}`)
    } else {
      scanned++
      eventResults[ticket.eventName].ok++
      console.log(`   ✅ [${ticket.eventName}] ${result.user_name} (${elapsed}ms)`)
    }

    if (SCAN_DELAY_MS > 0) await sleep(SCAN_DELAY_MS)
  }

  // ── 6. Results ─────────────────────────────────────────────────────────────
  const avgTime = scanTimes.length > 0 ? Math.round(scanTimes.reduce((a, b) => a + b, 0) / scanTimes.length) : 0
  const maxTime = scanTimes.length > 0 ? Math.max(...scanTimes) : 0
  const minTime = scanTimes.length > 0 ? Math.min(...scanTimes) : 0
  const totalTime = ((Date.now() - t0) / 1000).toFixed(1)

  console.log('\n' + '═'.repeat(60))
  console.log('📊 RESULTADOS')
  console.log('═'.repeat(60))
  console.log(`
  Tickets escaneados: ${scanned}/${shuffled.length}
  Fallidos:           ${failed}
  Tasa de éxito:      ${shuffled.length > 0 ? ((scanned / shuffled.length) * 100).toFixed(1) : 0}%

  Latencia scan_ticket():
    avg: ${avgTime}ms
    min: ${minTime}ms
    max: ${maxTime}ms

  Por evento:`)
  for (const [name, r] of Object.entries(eventResults)) {
    console.log(`    ${name}: ${r.ok} ✅  ${r.fail} ❌`)
  }
  console.log(`
  Tiempo total: ${totalTime}s
  Attendees creados: ${totalCreated}

  🔑 Scanner login:
     Email:    ${SCANNER_EMAIL}
     Password: ${SCANNER_PASS}
  `)
}

main().catch(err => {
  console.error('\n❌ Test failed:', err)
  process.exit(1)
})
