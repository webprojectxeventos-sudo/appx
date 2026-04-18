import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const SJB = '93d9d41c-7d21-42dc-ac6e-feb4b08d62b1'

const { data: rows } = await sb
  .from('user_events')
  .select('user_id, is_muted, joined_at')
  .eq('event_id', SJB)
  .eq('is_muted', true)

const ids = (rows || []).map(r => r.user_id)
const { data: users } = await sb.from('users').select('id, full_name, email').in('id', ids)
const uMap = Object.fromEntries((users || []).map(u => [u.id, u]))

console.log(`${rows?.length} usuarios silenciados en SJB:\n`)
for (const r of rows || []) {
  const u = uMap[r.user_id]
  console.log(`  ${u?.full_name || '(no name)'} <${u?.email || 'NO EMAIL'}>   joined ${r.joined_at?.slice(0, 10)}`)
}

// Cross-reference with the 11 top offenders
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
const mutedEmails = new Set((rows || []).map(r => uMap[r.user_id]?.email))
console.log(`\nDe los 11 principales ofensores:`)
for (const email of offenders) {
  console.log(`  ${mutedEmails.has(email) ? '✓ YA SILENCIADO' : '✗ activo (no silenciado)'} — ${email}`)
}
