import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Audit readiness for tonight's events. Tonight = today in Europe/Madrid.
// Looking for:
//   - all events happening today
//   - ticket counts vs capacity
//   - chat status
//   - venue + scanner assignments
//   - banned users
//   - known-problem events (e.g. SJB)

// Target = next 14 days (both same-day and imminent events)
const todayMadrid = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
const horizon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
console.log(`Today (Madrid): ${todayMadrid}`)
console.log(`Horizon:        ${horizon.slice(0, 10)} (próximos 14 días)\n`)

const { data: todayEvents } = await sb
  .from('events')
  .select('*')
  .gte('date', `${todayMadrid}T00:00:00`)
  .lte('date', horizon)
  .order('date', { ascending: true })

if (!todayEvents?.length) {
  console.log('No hay eventos hoy.')
  // Check the next 3 days anyway
  const futureBound = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: soon } = await sb
    .from('events')
    .select('id, title, date, chat_enabled, group_name, venue_id')
    .gte('date', `${todayMadrid}T00:00:00`)
    .lte('date', futureBound)
    .order('date', { ascending: true })
    .limit(20)
  console.log(`\nPróximos eventos (${soon?.length || 0}):`)
  for (const e of soon || []) {
    console.log(`  ${e.date.slice(0, 16).replace('T', ' ')} | chat:${e.chat_enabled} | ${e.title || e.group_name}`)
  }
  process.exit(0)
}

console.log(`\n${todayEvents.length} evento(s) esta noche:\n`)

for (const ev of todayEvents) {
  console.log(`══════════════════════════════════════════════════════════`)
  console.log(`${ev.title}`)
  console.log(`  id:              ${ev.id}`)
  console.log(`  date:            ${ev.date}`)
  console.log(`  chat_enabled:    ${ev.chat_enabled}`)
  console.log(`  group_name:      ${ev.group_name}`)
  console.log(`  venue_id:        ${ev.venue_id}`)
  console.log(`  event_code:      ${ev.event_code}`)

  const [
    { data: venue },
    { count: attendeeCount },
    { count: ticketCount },
    { count: scannedCount },
    { count: banCount },
    { count: mutedCount },
    { count: msgCount },
    { count: deletedMsgCount },
  ] = await Promise.all([
    sb.from('venues').select('id, name, address').eq('id', ev.venue_id).maybeSingle(),
    sb.from('user_events').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
    sb.from('tickets').select('*', { count: 'exact', head: true }).eq('event_id', ev.id),
    sb.from('tickets').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).not('scanned_at', 'is', null),
    sb.from('chat_bans').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('is_active', true),
    sb.from('user_events').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).eq('is_muted', true),
    sb.from('messages').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).is('deleted_at', null),
    sb.from('messages').select('*', { count: 'exact', head: true }).eq('event_id', ev.id).not('deleted_at', 'is', null),
  ])

  console.log(`\n  Venue:           ${venue?.name || '(sin venue)'}`)
  if (venue?.address) console.log(`                   ${venue.address}`)
  console.log(`  Asistentes:      ${attendeeCount}`)
  console.log(`  Tickets:         ${ticketCount} (${scannedCount} escaneados)`)
  console.log(`  Chat:            ${msgCount} msgs activos, ${deletedMsgCount} borrados`)
  console.log(`  Moderación:      ${banCount} baneados, ${mutedCount} silenciados`)

  // Who can scan at this venue
  if (ev.venue_id) {
    const { data: scanners } = await sb
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'scanner')
      .eq('venue_id', ev.venue_id)
    console.log(`  Scanners:        ${scanners?.length || 0} asignados al venue`)
    for (const s of scanners || []) {
      console.log(`                     - ${s.full_name || s.email}`)
    }
  }

  // Door workers (admin/group_admin with event access)
  const { data: eventStaff } = await sb
    .from('user_events')
    .select('user_id, users!inner(id, full_name, email, role)')
    .eq('event_id', ev.id)
  const staff = (eventStaff || []).filter(x => ['admin', 'group_admin'].includes(x.users?.role))
  console.log(`  Staff admin/group_admin: ${staff.length}`)
  for (const s of staff) {
    console.log(`                     - ${s.users.full_name || s.users.email} [${s.users.role}]`)
  }

  console.log('')
}

// Cross-check: any events in prod right now with chat_enabled=false that might surprise us?
console.log(`══════════════════════════════════════════════════════════`)
console.log('Eventos con chat DESACTIVADO actualmente:')
const { data: disabledChats } = await sb
  .from('events')
  .select('id, title, date, group_name')
  .eq('chat_enabled', false)
  .order('date', { ascending: true })
for (const e of disabledChats || []) {
  const badge = e.date.slice(0, 10) === todayMadrid ? ' ← ES HOY' : ''
  console.log(`  ${e.date.slice(0, 10)} | ${e.title || e.group_name}${badge}`)
}
