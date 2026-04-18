import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Export the full San Juan Bosco chat log as forensic evidence BEFORE any
// destructive action. Writes:
//   - JSON: full structured record of every message + sender identity
//   - TXT:  human-readable transcript for printing / handing to a lawyer
//   - CSV:  spreadsheet-friendly version for filtering

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EVENT_ID = '93d9d41c-7d21-42dc-ac6e-feb4b08d62b1'

const { data: event } = await sb.from('events').select('*').eq('id', EVENT_ID).single()

const { data: msgs } = await sb
  .from('messages')
  .select('*')
  .eq('event_id', EVENT_ID)
  .order('created_at', { ascending: true })

if (!msgs?.length) { console.log('NO MESSAGES'); process.exit(1) }

const userIds = [...new Set(msgs.map(m => m.user_id))]
const { data: users } = await sb.from('users').select('id, full_name, email, role, created_at').in('id', userIds)
const uMap = Object.fromEntries(users.map(u => [u.id, u]))

const { data: memb } = await sb.from('user_events').select('user_id, added_by, joined_at').eq('event_id', EVENT_ID).in('user_id', userIds)
const membMap = Object.fromEntries(memb.map(m => [m.user_id, m]))
const adderIds = [...new Set(memb.map(m => m.added_by).filter(Boolean))]
const { data: adders } = adderIds.length
  ? await sb.from('users').select('id, full_name').in('id', adderIds)
  : { data: [] }
const adderMap = Object.fromEntries((adders || []).map(a => [a.id, a.full_name]))

// Structured JSON
const record = {
  exported_at: new Date().toISOString(),
  exported_by: 'emergency-incident-export',
  event: {
    id: event.id,
    title: event.title,
    group_name: event.group_name,
    date: event.date,
    chat_enabled: event.chat_enabled,
  },
  participants: users.map(u => {
    const m = membMap[u.id]
    return {
      user_id: u.id,
      full_name: u.full_name,
      email: u.email,
      role: u.role,
      signup_source: m?.added_by ? `added_by:${adderMap[m.added_by] || m.added_by}` : 'self-signup',
      joined_at: m?.joined_at,
      message_count: msgs.filter(x => x.user_id === u.id).length,
    }
  }).sort((a, b) => b.message_count - a.message_count),
  messages: msgs.map(m => {
    const u = uMap[m.user_id] || {}
    return {
      id: m.id,
      created_at: m.created_at,
      user_id: m.user_id,
      user_full_name: u.full_name || null,
      user_email: u.email || null,
      content: m.content,
      is_announcement: m.is_announcement,
      is_pinned: m.is_pinned,
      deleted_at: m.deleted_at,
      deleted_by: m.deleted_by,
    }
  }),
  total_messages: msgs.length,
}

const outDir = join(process.cwd(), 'evidence')
mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const base = `sjb-${stamp}`

// JSON
writeFileSync(join(outDir, `${base}.json`), JSON.stringify(record, null, 2))

// TXT transcript
const lines = [
  `═══════════════════════════════════════════════════════════════`,
  `SAN JUAN BOSCO — Chat transcript (forensic export)`,
  `═══════════════════════════════════════════════════════════════`,
  ``,
  `Event:         ${event.title} (${event.group_name})`,
  `Event ID:      ${event.id}`,
  `Event date:    ${event.date}`,
  `Exported at:   ${record.exported_at}`,
  `Chat status:   ${event.chat_enabled ? 'ENABLED' : 'DISABLED (killswitch applied)'}`,
  `Total messages: ${msgs.length}`,
  `Total participants: ${users.length}`,
  ``,
  `── Participants ranked by message volume ──`,
  ``,
]
for (const p of record.participants) {
  lines.push(`  ${String(p.message_count).padStart(3, ' ')}×  ${p.full_name || '(no name)'}  <${p.email}>  [${p.signup_source}]`)
}
lines.push('', '═══════════════════════════════════════════════════════════════', 'FULL TIMELINE', '═══════════════════════════════════════════════════════════════', '')

for (const m of msgs) {
  const u = uMap[m.user_id] || {}
  const time = new Date(m.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
  const flags = [m.is_announcement && '[ANNOUNCEMENT]', m.is_pinned && '[PINNED]', m.deleted_at && '[DELETED]'].filter(Boolean).join(' ')
  lines.push(`[${time}] ${u.full_name || '(no name)'} <${u.email}> ${flags}`)
  lines.push(`  ${m.content}`)
  lines.push('')
}
writeFileSync(join(outDir, `${base}.txt`), lines.join('\n'))

// CSV
const escape = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
const csvLines = ['timestamp,user_full_name,user_email,message,is_announcement,is_pinned,deleted']
for (const m of msgs) {
  const u = uMap[m.user_id] || {}
  csvLines.push([
    m.created_at,
    u.full_name || '',
    u.email || '',
    m.content,
    m.is_announcement,
    m.is_pinned,
    !!m.deleted_at,
  ].map(escape).join(','))
}
writeFileSync(join(outDir, `${base}.csv`), csvLines.join('\n'))

console.log(`✓ Evidencia exportada a evidence/${base}.{json,txt,csv}`)
console.log(`  JSON: ${(JSON.stringify(record).length / 1024).toFixed(1)} KB`)
console.log(`  Mensajes: ${msgs.length}`)
console.log(`  Participantes: ${users.length}`)
