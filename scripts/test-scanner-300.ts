/**
 * Stress test: 300 escaneos concurrentes simulando una noche real
 * en una discoteca con múltiples grupos entrando a la vez.
 *
 * npx tsx scripts/test-scanner-300.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('❌ Missing env vars')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SCANNER_EMAIL = 'scanner@projectx.test'
const SCANNER_PASS = 'Scanner123'
const TARGET_ATTENDEES = 150 // per event (300 total across 2 events)
const CONCURRENCY = 50      // parallel scan_ticket calls at once

const NOMBRES = [
  'Alejandro', 'María', 'Carlos', 'Laura', 'Pablo', 'Ana', 'Daniel', 'Sofía',
  'Javier', 'Carmen', 'David', 'Lucía', 'Adrián', 'Marta', 'Álvaro', 'Paula',
  'Hugo', 'Elena', 'Diego', 'Irene', 'Sergio', 'Andrea', 'Mario', 'Sara',
  'Raúl', 'Claudia', 'Rubén', 'Alba', 'Iván', 'Nerea', 'Marcos', 'Julia',
]
const APELLIDOS = [
  'García', 'Martínez', 'López', 'Sánchez', 'González', 'Rodríguez', 'Fernández',
  'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Muñoz',
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

async function main() {
  const t0 = Date.now()

  // ── 1. Get events ──────────────────────────────────────────────────────
  console.log('🔍 Loading events...')
  const { data: events } = await sb.from('events').select('id, title, group_name, event_code, organization_id').order('date')
  if (!events?.length) { console.error('No events'); process.exit(1) }
  const orgId = events[0].organization_id
  console.log(`   ${events.length} events found\n`)

  // ── 2. Ensure scanner exists and is assigned ───────────────────────────
  console.log('👤 Checking scanner...')
  const { data: scannerUser } = await sb.from('users').select('id').eq('email', SCANNER_EMAIL).single()
  if (!scannerUser) { console.error('Run test-scanner.ts first'); process.exit(1) }
  console.log(`   Scanner ready: ${scannerUser.id}\n`)

  // ── 3. Create enough attendees + tickets to reach TARGET ───────────────
  let totalNew = 0
  const allQRs: { qr: string; eventName: string }[] = []

  for (const ev of events) {
    const label = ev.group_name || ev.title
    const { count: existing } = await sb.from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', ev.id)
    const needed = TARGET_ATTENDEES - (existing || 0)

    if (needed > 0) {
      console.log(`📋 [${label}] Creating ${needed} more attendees...`)
      for (let i = 0; i < needed; i++) {
        const name = randomName()
        const email = `load.${randomCode(8)}@test.scanner.dev`
        try {
          const { data: auth } = await sb.auth.admin.createUser({ email, password: 'Test1234', email_confirm: true })
          if (!auth?.user) continue
          const uid = auth.user.id
          await sb.from('users').insert({
            id: uid, email, full_name: name, role: 'attendee',
            event_id: ev.id, organization_id: orgId, gender: pick(['masculino', 'femenino'] as const),
          })
          await sb.from('user_events').insert({ user_id: uid, event_id: ev.id, role: 'attendee', is_active: true })
          const qr = randomQR(ev.id)
          await sb.from('tickets').insert({ user_id: uid, event_id: ev.id, qr_code: qr, status: 'valid' })
          totalNew++
        } catch { /* skip duplicates */ }
      }
    }

    // Gather all valid tickets for scanning
    const { data: tickets } = await sb
      .from('tickets')
      .select('qr_code')
      .eq('event_id', ev.id)
      .eq('status', 'valid')
      .limit(TARGET_ATTENDEES)
    if (tickets) {
      tickets.forEach(t => allQRs.push({ qr: t.qr_code, eventName: label }))
    }
    console.log(`   [${label}] ${tickets?.length || 0} valid tickets ready`)
  }

  console.log(`\n   ${totalNew} new attendees created`)
  console.log(`   ${allQRs.length} total tickets to scan\n`)

  // ── 4. Auth as scanner ─────────────────────────────────────────────────
  console.log('🔐 Authenticating scanner...')
  const { data: session, error: loginErr } = await sb.auth.signInWithPassword({
    email: SCANNER_EMAIL, password: SCANNER_PASS,
  })
  if (loginErr || !session.session) { console.error('Login failed:', loginErr); process.exit(1) }

  const scannerClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  })
  console.log('   ✅ Authenticated\n')

  // ── 5. MASS SCAN: 300 tickets, batches of CONCURRENCY ──────────────────
  // Shuffle to simulate random order (mixed events)
  const shuffled = [...allQRs].sort(() => Math.random() - 0.5).slice(0, 300)

  console.log('═'.repeat(60))
  console.log(`🚀 SCANNING ${shuffled.length} TICKETS (concurrency: ${CONCURRENCY})`)
  console.log('═'.repeat(60) + '\n')

  let ok = 0, fail = 0
  const times: number[] = []
  const eventStats: Record<string, { ok: number; fail: number }> = {}
  const errors: string[] = []

  // Process in batches
  for (let batch = 0; batch < shuffled.length; batch += CONCURRENCY) {
    const chunk = shuffled.slice(batch, batch + CONCURRENCY)
    const batchStart = Date.now()

    const results = await Promise.allSettled(
      chunk.map(async (ticket) => {
        const t1 = Date.now()
        const { data, error } = await scannerClient.rpc('scan_ticket', { ticket_qr: ticket.qr })
        const elapsed = Date.now() - t1
        times.push(elapsed)

        if (!eventStats[ticket.eventName]) eventStats[ticket.eventName] = { ok: 0, fail: 0 }

        const result = data as any
        if (error || !result?.success) {
          eventStats[ticket.eventName].fail++
          const reason = error?.message || result?.error || 'unknown'
          errors.push(`[${ticket.eventName}] ${reason}`)
          return { ok: false, ms: elapsed, event: ticket.eventName, reason }
        }
        eventStats[ticket.eventName].ok++
        return { ok: true, ms: elapsed, event: ticket.eventName, name: result.user_name }
      })
    )

    const batchElapsed = Date.now() - batchStart
    const batchOk = results.filter(r => r.status === 'fulfilled' && (r.value as any).ok).length
    const batchFail = chunk.length - batchOk
    ok += batchOk
    fail += batchFail

    const progress = Math.min(batch + CONCURRENCY, shuffled.length)
    console.log(
      `   Batch ${Math.floor(batch / CONCURRENCY) + 1}: ` +
      `${batchOk}/${chunk.length} OK  |  ${batchElapsed}ms  |  ` +
      `Progress: ${progress}/${shuffled.length} (${Math.round(progress / shuffled.length * 100)}%)`
    )
  }

  // ── 6. Results ─────────────────────────────────────────────────────────
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b) / times.length) : 0
  const p50 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.5)] || 0
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || 0
  const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)] || 0
  const totalSec = ((Date.now() - t0) / 1000).toFixed(1)

  console.log('\n' + '═'.repeat(60))
  console.log('📊 RESULTADOS — STRESS TEST')
  console.log('═'.repeat(60))
  console.log(`
  Total scans:     ${ok + fail}
  Exitosos:        ${ok} ✅
  Fallidos:        ${fail} ❌
  Tasa de éxito:   ${((ok / (ok + fail)) * 100).toFixed(1)}%
  Concurrencia:    ${CONCURRENCY} paralelos

  Latencia (ms):
    avg:  ${avg}
    p50:  ${p50}
    p95:  ${p95}
    p99:  ${p99}
    min:  ${Math.min(...times)}
    max:  ${Math.max(...times)}

  Por evento:`)
  for (const [name, s] of Object.entries(eventStats)) {
    console.log(`    ${name}: ${s.ok} ✅  ${s.fail} ❌`)
  }

  if (errors.length > 0) {
    const unique = [...new Set(errors)]
    console.log(`\n  Errores únicos (${unique.length}):`)
    unique.slice(0, 10).forEach(e => console.log(`    • ${e}`))
  }

  console.log(`\n  Tiempo total: ${totalSec}s`)
  console.log('')
}

main().catch(err => { console.error('❌', err); process.exit(1) })
