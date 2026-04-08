'use client'

// ─── Notification utilities: sound, vibration, browser notifications ───

// Play a short notification chime using Web Audio API (no external files needed)
let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    // Resume if suspended (autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }
    return audioCtx
  } catch {
    return null
  }
}

export function playNotificationSound(type: 'announcement' | 'message' = 'announcement') {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime

  if (type === 'announcement') {
    // Two-tone chime: ascending notes (C5 → E5)
    const freqs = [523.25, 659.25]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.35)
    })
  } else {
    // Single soft blip
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 440
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.15, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    osc.start(now)
    osc.stop(now + 0.25)
  }
}

// Vibrate the device (mobile)
export function vibrateDevice(pattern: number[] = [200, 100, 200]) {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Vibration not supported
  }
}

// Request browser notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'denied') return false
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

// Show a browser notification
export function showBrowserNotification(title: string, body: string, tag?: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/favicon.png',
      tag: tag || 'projectx-notification',
    } as NotificationOptions)
  } catch {
    // Notifications not supported
  }
}

// Full notification: sound + vibration + browser notification
export function notifyAnnouncement(content: string) {
  playNotificationSound('announcement')
  vibrateDevice([200, 100, 200, 100, 200])

  // Browser notification if app is in background
  if (document.hidden) {
    showBrowserNotification('Project X — Anuncio', content, 'announcement')
  }
}

// ─── Web Push (VAPID) ──────────────────────────────────────

// Convert VAPID public key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Subscribe to Web Push notifications
export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) {
      console.warn('[Push] No VAPID public key configured')
      return false
    }

    const permission = await requestNotificationPermission()
    if (!permission) return false

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
      })
    }

    const subJson = subscription.toJSON()
    if (!subJson.endpoint || !subJson.keys) return false

    // Save subscription to Supabase
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh!,
      auth_key: subJson.keys.auth!,
    }, { onConflict: 'endpoint' })

    console.log('[Push] Subscription saved')
    return true
  } catch (err) {
    console.error('[Push] Subscription failed:', err)
    return false
  }
}

// Unsubscribe from Web Push
export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err)
  }
}
