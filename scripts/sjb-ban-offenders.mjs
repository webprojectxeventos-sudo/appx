import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const SJB = '93d9d41c-7d21-42dc-ac6e-feb4b08d62b1'
const EMILIO = '7d8c1d72-923f-4e36-bc6a-c853d9e0b33b'  // actor for banned_by
const REASON = 'Incidente chat 16-17/4/2026: amenazas sexuales, referencias a menores, ofertas de drogas, impersonación/difamación. Ban permanente.'

const offenders = [
  'sergio.fr.180.04@gmail.com',
  'marcosholaquetal5@gmail.com',
  'rarrieroa@gmail.com',
  'rodrigomtnezz@gmail.com',
  'garciacorrearuben14@gmail.com',
  'carlosortiz2008@icloud.com',
  'delopeferraricarlos@gmail.com',
  'marriovizcaymunoz@gmail.com',
  'pulidoloechesmarcos@gmail.com',
  'alejandromartindemiguel@hotmail.com',
  'jorgeacu008@gmail.com',
]

// Resolve email → user_id
const { data: users } = await sb.from('users').select('id, full_name, email').in('email', offenders)
console.log(`Resolviendo ${offenders.length} emails → encontrados ${users?.length} usuarios:\n`)
for (const u of users || []) {
  console.log(`  ${u.full_name || '(sin nombre)'} <${u.email}>  id=${u.id}`)
}

const foundEmails = new Set((users || []).map(u => u.email))
const missing = offenders.filter(e => !foundEmails.has(e))
if (missing.length) {
  console.log(`\n⚠️ NO ENCONTRADOS EN DB (ojo):`)
  for (const e of missing) console.log(`  ${e}`)
}

// Prepare upserts (permanent ban = expires_at null)
const bans = (users || []).map(u => ({
  user_id: u.id,
  event_id: SJB,
  banned_by: EMILIO,
  reason: REASON,
  expires_at: null,
  is_active: true,
  banned_at: new Date().toISOString(),
}))

console.log(`\n▶ Aplicando ${bans.length} bans permanentes...\n`)

const { data: inserted, error } = await sb
  .from('chat_bans')
  .upsert(bans, { onConflict: 'user_id,event_id' })
  .select('user_id, is_active, expires_at, banned_at')

if (error) {
  console.error('✗ ERROR:', error)
  process.exit(1)
}

console.log(`✓ ${inserted?.length || 0} bans aplicados\n`)

// Verify: fetch active bans for SJB
const { data: active } = await sb
  .from('chat_bans')
  .select('user_id, is_active, expires_at, reason')
  .eq('event_id', SJB)
  .eq('is_active', true)

console.log(`Bans activos actualmente en SJB: ${active?.length}\n`)
const uMap = Object.fromEntries((users || []).map(u => [u.id, u]))
for (const b of active || []) {
  const u = uMap[b.user_id]
  console.log(`  ✓ ${u?.full_name || '(unk)'} <${u?.email || 'unk'}>  expires: ${b.expires_at || 'PERMANENTE'}`)
}

// Verify chat still disabled
const { data: ev } = await sb.from('events').select('chat_enabled').eq('id', SJB).single()
console.log(`\nEstado del chat SJB: chat_enabled=${ev.chat_enabled} (debe ser false)`)
