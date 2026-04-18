// Project X — Service Worker for offline support
// Caching strategy: Cache-first for static, Network-first for API, dedicated image cache

// Bump version to invalidate PWA caches — iOS clients pick up new assets on
// next network hit after this changes (the old caches get deleted in activate).
const CACHE_VERSION = 'v5'
const STATIC_CACHE = `projectx-static-${CACHE_VERSION}`
const DATA_CACHE = `projectx-data-${CACHE_VERSION}`
const IMAGE_CACHE = `projectx-images-${CACHE_VERSION}`

// Cache limits
const IMAGE_CACHE_MAX = 150  // max cached images
const DATA_CACHE_MAX = 100   // max cached API responses
const DATA_CACHE_TTL = 24 * 60 * 60 * 1000 // 24h in ms

// Precache only static assets (icons, manifest).
// HTML pages are NOT precached — they use network-first at runtime
// so deploys are always picked up immediately.
const PRECACHE_URLS = [
  '/favicon.png',
  '/logo.png',
  '/icon-192.png',
  '/manifest.json',
]

// Install — precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        // Don't fail install if some pages aren't built yet
        console.warn('[SW] Precache partial fail:', err)
      })
    })
  )
  self.skipWaiting()
})

// Helper: trim cache to max entries (FIFO — oldest requests removed first)
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems)
    await Promise.all(toDelete.map((key) => cache.delete(key)))
  }
}

// Activate — clean old caches + trim existing ones
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DATA_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => Promise.all([
      trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX),
      trimCache(DATA_CACHE, DATA_CACHE_MAX),
    ]))
  )
  self.clients.claim()
})

// Helper: is this a navigation request?
function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
}

// Helper: is this a Supabase API request?
function isApiRequest(url) {
  return url.hostname.includes('supabase') || url.pathname.startsWith('/api/')
}

// Helper: is this an image request?
function isImageRequest(request) {
  const url = new URL(request.url)
  const accept = request.headers.get('accept') || ''
  return accept.includes('image') ||
    /\.(png|jpg|jpeg|gif|webp|avif|svg|ico)(\?.*)?$/i.test(url.pathname) ||
    url.hostname.includes('supabase') && url.pathname.includes('/storage/')
}

// Helper: is this a static asset?
function isStaticAsset(url) {
  return /\.(js|css|woff|woff2|ttf|eot)(\?.*)?$/i.test(url.pathname) ||
    url.pathname.startsWith('/_next/static/')
}

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return

  // Skip Supabase realtime WebSocket connections
  if (url.pathname.includes('/realtime/') || url.searchParams.has('vsn')) return

  // Strategy 1: Images — Cache-first with long TTL
  if (isImageRequest(request)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone())
                trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX)
              }
              return response
            })
            .catch(() => {
              // Return a 1x1 transparent pixel as fallback
              return new Response(
                Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0)),
                { headers: { 'Content-Type': 'image/png' } }
              )
            })
        })
      )
    )
    return
  }

  // Strategy 2: Static assets — Network-first (with cache fallback)
  // Using network-first ensures new deployments are picked up immediately
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone())
            }
            return response
          })
          .catch(() => cache.match(request).then((cached) => {
            if (cached) return cached
            return new Response('Offline', { status: 503 })
          }))
      )
    )
    return
  }

  // Strategy 3: API / Supabase data — Network-first, fallback to cache
  if (isApiRequest(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            if (response.ok) {
              cache.put(request, response.clone())
            }
            return response
          })
          .catch(() => cache.match(request).then((cached) => {
            if (cached) return cached
            return new Response(JSON.stringify({ error: 'offline', cached: false }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          }))
      )
    )
    return
  }

  // Strategy 4: Navigation (HTML pages) — Network-first, fallback to cache
  if (isNavigationRequest(request)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        fetch(request)
          .then((response) => {
            cache.put(request, response.clone())
            return response
          })
          .catch(() => cache.match(request).then((cached) => {
            if (cached) return cached
            // Fallback: try /home cached version
            return cache.match('/home').then((homeCached) => {
              if (homeCached) return homeCached
              return new Response(offlineHTML(), {
                headers: { 'Content-Type': 'text/html' },
              })
            })
          }))
      )
    )
    return
  }

  // Default: Network-first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  )
})

// Minimal offline fallback HTML
function offlineHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project X — Sin conexion</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .container { text-align: center; padding: 2rem; }
    .icon { width: 64px; height: 64px; margin: 0 auto 1.5rem; border-radius: 16px; background: rgba(228,30,43,0.1); display: flex; align-items: center; justify-content: center; }
    .icon svg { width: 32px; height: 32px; color: #E41E2B; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; background: linear-gradient(135deg, #FF3544, #E41E2B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { font-size: 0.875rem; color: #a0a0a0; margin-bottom: 1.5rem; line-height: 1.5; }
    button { background: linear-gradient(135deg, #FF3544, #E41E2B, #C41824); color: #ffffff; border: none; padding: 0.75rem 2rem; border-radius: 12px; font-weight: 600; font-size: 0.875rem; cursor: pointer; }
    button:active { transform: scale(0.97); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/></svg>
    </div>
    <h1>Sin conexion</h1>
    <p>Parece que no hay cobertura.<br/>Cuando vuelvas a tener red, la app se actualizara automaticamente.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`
}

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Project X', body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Project X', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'default',
      data: { url: data.url || '/home' },
    })
  )
})

// Handle notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/home'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    })
  )
})
