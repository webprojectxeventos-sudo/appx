import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: events } = await sb
  .from('events')
  .select('id, title, date, chat_enabled, group_name')
  .ilike('title', '%bosco%')

if (!events?.length) { console.log('NO BOSCO EVENTS'); process.exit(1) }

for (const ev of events) {
  console.log(`\n════════ ${ev.title} — ${ev.date?.slice(0,10)} ════════`)
  console.log(`  event_id: ${ev.id}`)
  console.log(`  chat_enabled: ${ev.chat_enabled}`)
  console.log(`  group_name: ${ev.group_name}`)

  // ALL messages ever in this event (chronological)
  const { data: msgs } = await sb
    .from('messages')
    .select('id, content, user_id, created_at, is_announcement, is_pinned')
    .eq('event_id', ev.id)
    .order('created_at', { ascending: true })

  console.log(`\n── ${msgs?.length || 0} mensajes totales ──`)
  if (!msgs?.length) continue

  const userIds = [...new Set(msgs.map(m => m.user_id))]
  const { data: users } = await sb.from('users').select('id, full_name, email, role').in('id', userIds)
  const uMap = Object.fromEntries(users.map(u => [u.id, u]))

  const { data: memb } = await sb.from('user_events').select('user_id, added_by').eq('event_id', ev.id).in('user_id', userIds)
  const addedByMap = Object.fromEntries(memb.map(m => [m.user_id, m.added_by]))
  const adderIds = [...new Set(memb.map(m => m.added_by).filter(Boolean))]
  const { data: adders } = adderIds.length
    ? await sb.from('users').select('id, full_name').in('id', adderIds)
    : { data: [] }
  const adderMap = Object.fromEntries(adders.map(a => [a.id, a.full_name]))

  // Count per-user (who participates)
  const perUser = {}
  for (const m of msgs) {
    perUser[m.user_id] = (perUser[m.user_id] || 0) + 1
  }
  console.log('\n── Participantes ──')
  for (const [uid, count] of Object.entries(perUser).sort((a, b) => b[1] - a[1])) {
    const u = uMap[uid] || {}
    const ab = addedByMap[uid] ? adderMap[addedByMap[uid]] || '?' : null
    console.log(`  ${count}× ${u.full_name || '(sin nombre)'} <${u.email}> — ${ab ? `añadido por ${ab}` : 'auto-registro'}${u.role !== 'attendee' ? ` [${u.role}]` : ''}`)
  }

  console.log('\n── Cronología completa ──')
  for (const m of msgs) {
    const u = uMap[m.user_id] || {}
    const time = new Date(m.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })
    const flags = [m.is_announcement && '[📢]', m.is_pinned && '[📌]'].filter(Boolean).join(' ')
    console.log(`\n[${time}] ${u.full_name || '(sin nombre)'} <${u.email}> ${flags}`)
    console.log(`  "${m.content}"`)
  }
}
