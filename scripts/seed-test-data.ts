/**
 * Seed script for Project X — genera datos de prueba realistas.
 *
 * Requisitos:
 *   npm install -D tsx
 *
 * Uso:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   npx tsx scripts/seed-test-data.ts
 *
 * ⚠️  Usa SERVICE_ROLE_KEY (no anon key) para bypasear RLS y crear auth users.
 * ⚠️  NO ejecutar en producción.
 */

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Datos realistas españoles
// ---------------------------------------------------------------------------
const NOMBRES = [
  'Alejandro', 'María', 'Carlos', 'Laura', 'Pablo', 'Ana', 'Daniel', 'Sofía',
  'Javier', 'Carmen', 'David', 'Lucía', 'Adrián', 'Marta', 'Álvaro', 'Paula',
  'Hugo', 'Elena', 'Diego', 'Irene', 'Sergio', 'Andrea', 'Mario', 'Sara',
  'Raúl', 'Claudia', 'Rubén', 'Alba', 'Iván', 'Nerea', 'Marcos', 'Julia',
  'Jorge', 'Patricia', 'Miguel', 'Cristina', 'Fernando', 'Sandra', 'Óscar', 'Natalia',
  'Roberto', 'Marina', 'Manuel', 'Lorena', 'Francisco', 'Beatriz', 'Antonio', 'Eva',
  'Guillermo', 'Noelia', 'Rafael', 'Isabel', 'Tomás', 'Teresa', 'Gonzalo', 'Rocío',
  'Alberto', 'Alicia', 'Héctor', 'Verónica',
]

const APELLIDOS = [
  'García', 'Martínez', 'López', 'Sánchez', 'González', 'Rodríguez', 'Fernández',
  'Pérez', 'Gómez', 'Ruiz', 'Díaz', 'Hernández', 'Moreno', 'Álvarez', 'Muñoz',
  'Romero', 'Jiménez', 'Torres', 'Navarro', 'Domínguez', 'Vázquez', 'Ramos',
  'Gil', 'Serrano', 'Molina', 'Blanco', 'Castro', 'Ortiz', 'Marín', 'Delgado',
]

const INSTITUTOS = [
  'IES Cervantes', 'IES Lorca', 'Colegio San José', 'IES Goya',
  'Colegio Sagrada Familia', 'IES Velázquez', 'Colegio Santa María',
  'IES Picasso', 'Colegio La Salle', 'IES Calderón',
]

const GRUPOS = ['4ºA', '4ºB', '2ºBach A', '2ºBach B', '4ºESO']

const VENUES_DATA = [
  { name: 'Sala Capitol', address: 'Gran Vía 41', city: 'Madrid', capacity: 2000, lat: 40.4200, lng: -3.7060 },
  { name: 'Teatro Barceló', address: 'Calle de Barceló 11', city: 'Madrid', capacity: 1500, lat: 40.4260, lng: -3.7010 },
  { name: 'Independance Club', address: 'Calle Atocha 127', city: 'Madrid', capacity: 800, lat: 40.4085, lng: -3.6935 },
]

const CHAT_MESSAGES = [
  '¡Vamos que nos vamos! 🎉', 'Alguien sabe a qué hora abren?', '¿Quién viene en metro?',
  'Yo llego en 10 min', 'Esto va a ser increíble 🔥', '¿Alguien ha visto a mi grupo?',
  'La música está genial', 'Menuda fiesta se va a liar', 'Estoy en la puerta ya',
  '¿Dónde está el guardarropa?', 'Qué ganas tenía de esta noche!!', 'Alguien quiere compartir taxi?',
  'El DJ está poniendo temazos', 'Nos vemos en la barra', '¿Han abierto ya la pista?',
  'Esto está hasta arriba 😂', 'Me encanta la decoración', 'Vaya fiestaaa',
  '¿Sabéis si hay fotógrafo?', 'Último año juntos, hay que darlo todo 💪',
]

const ALCOHOL_CHOICES = ['Ron cola', 'Gin tonic', 'Vodka naranja', 'Cerveza', 'Tinto de verano', 'Mojito']
const SOFT_DRINKS = ['Coca-Cola', 'Fanta naranja', 'Agua', 'Nestea', 'Sprite', 'Red Bull']
const ALLERGIES = ['gluten', 'lactosa', 'frutos_secos', 'huevo']
const GENDERS: ('masculino' | 'femenino' | 'otro')[] = ['masculino', 'femenino', 'otro']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function randomCode(len: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function randomName(): { full_name: string; gender: 'masculino' | 'femenino' | 'otro' } {
  const nombre = pick(NOMBRES)
  const ap1 = pick(APELLIDOS)
  const ap2 = pick(APELLIDOS)
  // Rough gender guess from name ending — not perfect, just for seed data
  const gender: 'masculino' | 'femenino' | 'otro' =
    nombre.endsWith('a') || nombre.endsWith('ía') ? 'femenino' : 'masculino'
  return { full_name: `${nombre} ${ap1} ${ap2}`, gender }
}

function randomEmail(name: string, i: number): string {
  const clean = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '.')
  return `${clean}.${i}@test.projectx.dev`
}

function randomQR(eventId: string): string {
  return `PX-${eventId.substring(0, 8)}-${randomCode(24).toLowerCase()}`
}

function futureDate(daysFromNow: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Auth create failed for ${email}: ${error.message}`)
  return data.user.id
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function seed() {
  console.log('🌱 Seeding Project X test data...\n')
  const t0 = Date.now()

  // ── 1. Create admin + super_admin auth users ───────────────────────────
  console.log('👤 Creating admin & super_admin auth users...')
  const superAdminId = await createAuthUser('superadmin@test.projectx.dev', 'test1234')
  const adminId = await createAuthUser('admin@test.projectx.dev', 'test1234')
  console.log(`   super_admin: superadmin@test.projectx.dev (${superAdminId})`)
  console.log(`   admin:       admin@test.projectx.dev (${adminId})`)

  // ── 2. Organization ────────────────────────────────────────────────────
  console.log('\n🏢 Creating organization...')
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: 'TuGraduacionMadrid', slug: 'tugraduacionmadrid', created_by: superAdminId })
    .select()
    .single()
  if (orgErr) throw orgErr
  console.log(`   ${org.name} (${org.id})`)

  // ── 3. User profiles for admin & super_admin ───────────────────────────
  console.log('\n👥 Creating admin profiles...')
  await supabase.from('users').insert([
    {
      id: superAdminId, email: 'superadmin@test.projectx.dev', full_name: 'Super Admin',
      role: 'super_admin', organization_id: org.id, gender: 'masculino',
    },
    {
      id: adminId, email: 'admin@test.projectx.dev', full_name: 'Admin Principal',
      role: 'admin', organization_id: org.id, gender: 'femenino',
    },
  ])

  // ── 4. Venues ──────────────────────────────────────────────────────────
  console.log('\n📍 Creating 3 venues...')
  const venueRows = VENUES_DATA.map(v => ({
    organization_id: org.id, name: v.name, address: v.address,
    city: v.city, capacity: v.capacity, latitude: v.lat, longitude: v.lng,
  }))
  const { data: venues, error: venErr } = await supabase.from('venues').insert(venueRows).select()
  if (venErr) throw venErr
  venues.forEach(v => console.log(`   ${v.name} (cap. ${v.capacity})`))

  // ── 5. Events ──────────────────────────────────────────────────────────
  console.log('\n🎉 Creating 10 events...')
  const eventInserts = Array.from({ length: 10 }, (_, i) => {
    const venue = venues[i % venues.length]
    const instituto = INSTITUTOS[i]
    const grupo = pick(GRUPOS)
    const code = randomCode(6)
    const isFiesta = i >= 3 // first 3 are ESO (minors), rest fiesta
    return {
      title: `Graduación ${instituto} ${grupo}`,
      description: `Fiesta de graduación de ${instituto} - Grupo ${grupo}`,
      date: futureDate(7 + i, 22), // staggered over days, all at 22:00
      location: `${venue.name}, ${venue.address}, ${venue.city}`,
      event_code: code,
      event_type: (isFiesta ? 'fiesta' : 'eso') as 'eso' | 'fiesta',
      organization_id: org.id,
      venue_id: venue.id,
      group_name: `${instituto} ${grupo}`,
      latitude: venue.latitude,
      longitude: venue.longitude,
      created_by: adminId,
    }
  })
  const { data: events, error: evErr } = await supabase.from('events').insert(eventInserts).select()
  if (evErr) throw evErr
  events.forEach(e => console.log(`   ${e.group_name} | ${e.event_type} | code: ${e.event_code}`))

  // ── 6. Admin membership in all events ──────────────────────────────────
  console.log('\n🔑 Adding admin memberships to all events...')
  const adminMemberships = events.flatMap(e => [
    { user_id: superAdminId, event_id: e.id, role: 'super_admin' as const, is_active: true },
    { user_id: adminId, event_id: e.id, role: 'admin' as const, is_active: true },
  ])
  await supabase.from('user_events').insert(adminMemberships)

  // ── 7. Attendees + Scanners per event ──────────────────────────────────
  let totalAttendees = 0
  let totalScanners = 0
  const allAttendeeIds: { userId: string; eventId: string }[] = []

  for (const event of events) {
    const eventLabel = event.group_name || event.title
    console.log(`\n📋 [${eventLabel}] Creating 50 attendees + 2 scanners...`)

    // -- Scanners --
    const scannerIds: string[] = []
    for (let s = 0; s < 2; s++) {
      const email = `scanner.${event.event_code.toLowerCase()}.${s}@test.projectx.dev`
      const uid = await createAuthUser(email, 'test1234')
      scannerIds.push(uid)
      totalScanners++
    }

    await supabase.from('users').insert(
      scannerIds.map((id, s) => ({
        id, email: `scanner.${event.event_code.toLowerCase()}.${s}@test.projectx.dev`,
        full_name: `Scanner ${s + 1} (${eventLabel})`, role: 'scanner' as const,
        event_id: event.id, organization_id: org.id, gender: pick(GENDERS),
      }))
    )
    await supabase.from('user_events').insert(
      scannerIds.map(id => ({
        user_id: id, event_id: event.id, role: 'scanner' as const, is_active: true,
      }))
    )

    // -- Attendees (batch auth creation) --
    const attendeeIds: string[] = []
    for (let a = 0; a < 50; a++) {
      const { full_name, gender } = randomName()
      const email = randomEmail(full_name, a + totalAttendees)
      const uid = await createAuthUser(email, 'test1234')
      attendeeIds.push(uid)
      allAttendeeIds.push({ userId: uid, eventId: event.id })

      // Insert profile immediately to avoid batching issues
      await supabase.from('users').insert({
        id: uid, email, full_name, role: 'attendee',
        event_id: event.id, organization_id: org.id, gender,
      })
    }
    totalAttendees += 50

    // user_events memberships
    await supabase.from('user_events').insert(
      attendeeIds.map(id => ({
        user_id: id, event_id: event.id, role: 'attendee' as const, is_active: true,
      }))
    )

    // -- Chat messages (10 per event) --
    const chatMsgs = Array.from({ length: 10 }, (_, i) => ({
      event_id: event.id,
      user_id: pick(attendeeIds),
      content: pick(CHAT_MESSAGES),
      is_announcement: i === 0, // first message is announcement from admin
      ...(i === 0 ? { user_id: adminId } : {}),
    }))
    await supabase.from('messages').insert(chatMsgs)

    // -- Drink orders (5 per event) --
    const drinkUsers = pickN(attendeeIds, 5)
    const isFiesta = event.event_type === 'fiesta'
    await supabase.from('drink_orders').insert(
      drinkUsers.map(uid => ({
        event_id: event.id,
        user_id: uid,
        alcohol_choice: isFiesta ? pick(ALCOHOL_CHOICES) : null,
        soft_drink_choice: pick(SOFT_DRINKS),
        allergies: Math.random() > 0.7 ? pickN(ALLERGIES, Math.ceil(Math.random() * 2)) : [],
        allergy_notes: Math.random() > 0.9 ? 'Intolerante a la fructosa' : null,
      }))
    )

    // -- Tickets for ALL attendees --
    await supabase.from('tickets').insert(
      attendeeIds.map(uid => ({
        user_id: uid,
        event_id: event.id,
        qr_code: randomQR(event.id),
        status: 'valid' as const,
      }))
    )

    // -- Access codes (60 per event — 50 used + 10 spare) --
    const usedCodes = attendeeIds.map(uid => ({
      event_id: event.id,
      code: randomCode(8),
      label: eventLabel,
      is_active: true,
      used_by: uid,
      used_at: new Date().toISOString(),
    }))
    const spareCodes = Array.from({ length: 10 }, () => ({
      event_id: event.id,
      code: randomCode(8),
      label: eventLabel,
      is_active: true,
      used_by: null,
      used_at: null,
    }))
    await supabase.from('access_codes').insert([...usedCodes, ...spareCodes])

    // -- Event schedule (4 items per event) --
    const baseHour = 22 // 10 PM
    await supabase.from('event_schedule').insert([
      { event_id: event.id, title: 'Apertura de puertas', start_time: futureDate(7, baseHour), end_time: futureDate(7, baseHour + 1), icon: 'door-open' },
      { event_id: event.id, title: 'Barra libre', start_time: futureDate(7, baseHour + 1), end_time: futureDate(7, baseHour + 3), icon: 'wine' },
      { event_id: event.id, title: 'DJ Set', start_time: futureDate(7, baseHour + 1), end_time: futureDate(7, baseHour + 4), icon: 'music' },
      { event_id: event.id, title: 'Fin de fiesta', start_time: futureDate(8, baseHour + 4), icon: 'party-popper' },
    ])

    console.log(`   ✅ 50 attendees, 2 scanners, 10 msgs, 5 drinks, 50 tickets, 60 codes, 4 schedule items`)
  }

  // ── 8. Summary ─────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log('\n' + '═'.repeat(60))
  console.log('✅ SEED COMPLETE')
  console.log('═'.repeat(60))
  console.log(`
  Organization:   1 (${org.name})
  Venues:         ${venues.length}
  Events:         ${events.length}
  Auth users:     ${2 + totalScanners + totalAttendees} total
    super_admin:  1 (superadmin@test.projectx.dev / test1234)
    admin:        1 (admin@test.projectx.dev / test1234)
    scanners:     ${totalScanners} (scanner.{code}.{n}@test.projectx.dev / test1234)
    attendees:    ${totalAttendees}
  Messages:       ${events.length * 10}
  Drink orders:   ${events.length * 5}
  Tickets:        ${totalAttendees}
  Access codes:   ${events.length * 60} (${totalAttendees} used + ${events.length * 10} spare)
  Schedule items: ${events.length * 4}
  user_events:    ${adminMemberships.length + totalScanners + totalAttendees}

  Time: ${elapsed}s
  `)

  console.log('🔑 Login credentials:')
  console.log('   superadmin@test.projectx.dev  /  test1234')
  console.log('   admin@test.projectx.dev       /  test1234')
  console.log('   scanner.{code}.0@test.projectx.dev  /  test1234')
  console.log('')
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err)
  process.exit(1)
})
