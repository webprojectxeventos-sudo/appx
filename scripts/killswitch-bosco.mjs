import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const EVENT_ID = '93d9d41c-7d21-42dc-ac6e-feb4b08d62b1'

const { data, error } = await sb.from('events')
  .update({ chat_enabled: false })
  .eq('id', EVENT_ID)
  .select('id, title, chat_enabled')
  .single()

if (error) { console.error(error); process.exit(1) }
console.log('✓ CHAT DESACTIVADO para San Juan Bosco:')
console.log(data)
