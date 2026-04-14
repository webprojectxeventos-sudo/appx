/**
 * Playwright screenshot generator for Play Store / App Store listings.
 *
 * Usage: npx tsx scripts/take-screenshots.ts
 *
 * Uses Supabase admin API to generate a magic link for Laura (the pre-seeded
 * test user), then opens the link in a Chromium instance with a 360x640
 * viewport @ DPR 3.0 to produce native 1080x1920 PNG screenshots.
 *
 * Output: public/screenshots/{home,chat,gallery,drinks,ticket,playlist}.png
 */

import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { readFileSync } from 'node:fs'

// Lightweight .env.local loader — avoids dotenv dependency
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch (err) {
    console.error('Failed to load .env.local:', err)
    process.exit(1)
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TEST_EMAIL = 'emiliovillatiscar+1@gmail.com'
const PROD_URL = 'https://app.projectxeventos.es'
const OUT_DIR = resolve(process.cwd(), 'public/screenshots')

async function main() {
  console.log('==> Generating magic link via Supabase admin API')
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: `${PROD_URL}/home` },
  })
  if (error || !data?.properties?.action_link) {
    console.error('Failed to generate magic link:', error)
    process.exit(1)
  }
  const magicLink = data.properties.action_link
  console.log('    magic link ready')

  await mkdir(OUT_DIR, { recursive: true })

  console.log('==> Launching Chromium at 360x640 @ DPR 3 (=1080x1920)')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    ...devices['Pixel 5'],
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  })

  const page = await context.newPage()

  console.log('==> Visiting magic link (login)')
  await page.goto(magicLink, { waitUntil: 'domcontentloaded' })
  // Magic link redirects through /auth/callback → /home
  await page.waitForURL(/\/home|\/polls/, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Ensure sessionStorage flag for drink-order-done is set so the layout
  // won't kick us to /polls when we navigate elsewhere. We don't know the
  // event_id here at runtime, but the app will set it after the first check.
  // If Laura has already completed polls, the layout will release immediately.

  const targets = [
    { url: '/home', file: 'home.png', delay: 2500 },
    { url: '/polls', file: 'drinks.png', delay: 2000 },
    { url: '/chat', file: 'chat.png', delay: 2500 },
    { url: '/gallery', file: 'gallery.png', delay: 2000 },
    { url: '/playlist', file: 'playlist.png', delay: 2000 },
    { url: '/lost-found', file: 'lost-found.png', delay: 1500 },
  ]

  for (const t of targets) {
    console.log(`==> Capturing ${t.url} -> ${t.file}`)
    try {
      await page.goto(`${PROD_URL}${t.url}`, { waitUntil: 'networkidle', timeout: 20000 })
    } catch {
      // networkidle can fail if Supabase realtime keeps sockets open — ignore
      await page.goto(`${PROD_URL}${t.url}`, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForTimeout(t.delay)
    await page.screenshot({
      path: resolve(OUT_DIR, t.file),
      fullPage: false,
    })
    console.log(`    saved ${t.file}`)
  }

  await browser.close()
  console.log('\nDone. Screenshots in public/screenshots/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
