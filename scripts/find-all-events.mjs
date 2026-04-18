import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// First row only, to see all columns
const { data: sample } = await sb.from('events').select('*').limit(1)
if (sample?.[0]) {
  console.log('COLUMNS:', Object.keys(sample[0]).join(', '))
  console.log()
}

const { data: events, error } = await sb
  .from('events')
  .select('*')
  .order('date', { ascending: false })
  .limit(30)

if (error) { console.error(error); process.exit(1) }

for (const ev of events) {
  console.log(`${ev.date} | chat:${ev.chat_enabled} | id:${ev.id.slice(0,8)} | ${ev.title || ev.group_name || ev.name || '(no title)'}`)
}
