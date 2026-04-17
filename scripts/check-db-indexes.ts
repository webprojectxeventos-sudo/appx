/**
 * Probe whether the scanner hot-path tables have the indexes they need.
 *
 * Run with: npx tsx scripts/check-db-indexes.ts
 *
 * We time a handful of representative queries. If a lookup on an indexed
 * column is slow relative to an unindexed probe, that's a smell.
 *
 * Thresholds (remote Supabase, not LAN):
 *   <  150ms  → OK (index likely present)
 *   < 500ms   → Warn (maybe missing index or cold cache)
 *   >= 500ms  → Probably no index on that column
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Minimal .env.local parser — avoids adding a dotenv dependency
try {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, vRaw] = m
    const v = vRaw.replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
} catch {
  /* .env.local optional */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE env vars in .env.local')
  process.exit(1)
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function time(label: string, fn: () => PromiseLike<unknown>): Promise<number> {
  const start = performance.now()
  try {
    await fn()
  } catch (err) {
    console.error(`[${label}] error:`, err)
  }
  const ms = performance.now() - start
  const mark = ms < 150 ? '✓' : ms < 500 ? '~' : '✗'
  console.log(`  ${mark}  ${label.padEnd(48)} ${ms.toFixed(0)}ms`)
  return ms
}

async function main() {
  console.log('\nTable row counts:')
  for (const table of ['tickets', 'events', 'user_events', 'users', 'cloakroom_items'] as const) {
    const { count } = await sb.from(table).select('*', { count: 'exact', head: true })
    console.log(`  ${table.padEnd(20)} ${count ?? '??'} rows`)
  }

  // Pick a real ticket qr_code and user_id to probe actual-hit indexes
  const { data: sampleTicket } = await sb
    .from('tickets')
    .select('qr_code, event_id, user_id')
    .limit(1)
    .maybeSingle()
  if (!sampleTicket) {
    console.log('\nNo sample ticket found — skipping lookup probes.')
    return
  }

  console.log('\nHot-path queries (scanner per-scan path):')
  await time('SELECT by qr_code (scan entry)', () =>
    sb.from('tickets').select('id, status').eq('qr_code', sampleTicket.qr_code).maybeSingle(),
  )
  await time('SELECT by qr_code (miss, bogus)', () =>
    sb
      .from('tickets')
      .select('id')
      .eq('qr_code', 'DEFINITELY-NOT-A-REAL-QR-12345')
      .maybeSingle(),
  )
  await time('SELECT by event_id + status = used', () =>
    sb
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', sampleTicket.event_id)
      .eq('status', 'used'),
  )
  await time('user_events membership check', () =>
    sb
      .from('user_events')
      .select('role')
      .eq('user_id', sampleTicket.user_id)
      .eq('event_id', sampleTicket.event_id)
      .eq('is_active', true)
      .maybeSingle(),
  )
  await time('events by venue_id', async () => {
    const { data: ev } = await sb
      .from('events')
      .select('venue_id')
      .eq('id', sampleTicket.event_id)
      .maybeSingle()
    if (ev?.venue_id) {
      await sb.from('events').select('id').eq('venue_id', ev.venue_id)
    }
  })

  console.log('\nLegend:  ✓ <150ms · ~ 150-500ms · ✗ >=500ms\n')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
