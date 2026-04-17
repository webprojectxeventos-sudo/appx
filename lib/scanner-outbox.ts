'use client'

import { get, set, del, keys } from 'idb-keyval'

/**
 * Offline outbox for scanner actions.
 *
 * Each pending action is persisted to IndexedDB so the scanner survives
 * tab reloads, tab kills, and network drops. Items are flushed serially
 * when the device is online; each item is sent with an `idempotency_key`
 * so future server-side dedupe can trust it.
 *
 * The store key is `scanner-outbox:<id>` so it does not collide with other
 * idb-keyval usage in the app.
 */

const PREFIX = 'scanner-outbox:'
const MAX_ATTEMPTS = 8

export type OutboxKind =
  | 'scan'
  | 'undo'
  | 'door-register'
  | 'cloakroom-action'
  | 'cloakroom-checkin'
  | 'cloakroom-checkout'

export interface OutboxItem {
  /** Stable UUID — also sent as idempotency_key to the server */
  id: string
  kind: OutboxKind
  endpoint: string
  /** JSON-serializable body */
  payload: Record<string, unknown>
  /** Display hint for the badge/drawer (e.g. scanned name, door entry) */
  label?: string
  /** Epoch ms of enqueue */
  createdAt: number
  /** Epoch ms of last send attempt (0 if never) */
  lastAttemptAt: number
  attempts: number
  lastError?: string
  /** 'pending' = will retry. 'failed' = max attempts reached, user must retry manually. */
  status: 'pending' | 'failed'
}

type Listener = () => void
const listeners = new Set<Listener>()
function notify() {
  for (const l of listeners) {
    try {
      l()
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function storeKey(id: string) {
  return `${PREFIX}${id}`
}

async function allKeys(): Promise<string[]> {
  const all = await keys()
  return all
    .map((k) => String(k))
    .filter((k) => k.startsWith(PREFIX))
}

export async function pending(): Promise<OutboxItem[]> {
  const ks = await allKeys()
  const items = (await Promise.all(ks.map((k) => get<OutboxItem>(k)))).filter(
    (x): x is OutboxItem => Boolean(x),
  )
  items.sort((a, b) => a.createdAt - b.createdAt)
  return items
}

export async function count(): Promise<number> {
  const items = await pending()
  return items.filter((i) => i.status === 'pending').length
}

export async function enqueue(input: {
  kind: OutboxKind
  endpoint: string
  payload: Record<string, unknown>
  label?: string
}): Promise<OutboxItem> {
  const id =
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `ob_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)
  const item: OutboxItem = {
    id,
    kind: input.kind,
    endpoint: input.endpoint,
    payload: { ...input.payload, idempotency_key: id },
    label: input.label,
    createdAt: Date.now(),
    lastAttemptAt: 0,
    attempts: 0,
    status: 'pending',
  }
  await set(storeKey(id), item)
  notify()
  return item
}

export async function remove(id: string): Promise<void> {
  await del(storeKey(id))
  notify()
}

export async function markAttempt(
  id: string,
  error?: string,
): Promise<OutboxItem | null> {
  const item = await get<OutboxItem>(storeKey(id))
  if (!item) return null
  const updated: OutboxItem = {
    ...item,
    attempts: item.attempts + 1,
    lastAttemptAt: Date.now(),
    lastError: error,
    status:
      item.attempts + 1 >= MAX_ATTEMPTS && error ? 'failed' : item.status,
  }
  await set(storeKey(id), updated)
  notify()
  return updated
}

export async function resetForRetry(id: string): Promise<void> {
  const item = await get<OutboxItem>(storeKey(id))
  if (!item) return
  const updated: OutboxItem = {
    ...item,
    attempts: 0,
    lastError: undefined,
    status: 'pending',
  }
  await set(storeKey(id), updated)
  notify()
}

/** Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s. */
export function backoffMs(attempts: number): number {
  const base = 1000 * Math.pow(2, attempts)
  return Math.min(base, 30_000)
}

/** True if item is eligible to retry now based on lastAttemptAt + backoff. */
export function isReady(item: OutboxItem, now = Date.now()): boolean {
  if (item.status !== 'pending') return false
  if (item.attempts === 0) return true
  return now - item.lastAttemptAt >= backoffMs(item.attempts)
}

export interface FlushContext {
  /** Provides a fresh access token for authenticated requests. */
  getAuthToken: () => Promise<string | null>
}

export interface FlushResult {
  sent: number
  failed: number
  remaining: number
}

/**
 * Flush pending items serially. Stops early on auth error (no token).
 * Safe to call concurrently — uses an in-memory lock.
 */
let flushing = false
export async function flush(ctx: FlushContext): Promise<FlushResult> {
  if (flushing) return { sent: 0, failed: 0, remaining: await count() }
  flushing = true
  let sent = 0
  let failed = 0
  try {
    const items = (await pending()).filter((i) => isReady(i))
    for (const item of items) {
      const token = await ctx.getAuthToken()
      if (!token) break
      try {
        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(item.payload),
        })
        if (res.ok) {
          await remove(item.id)
          sent++
          continue
        }
        // Parse server error message
        let errMsg = `HTTP ${res.status}`
        try {
          const body = await res.json()
          errMsg = body?.error || errMsg
        } catch {
          /* ignore */
        }
        // Treat "already scanned" as success: the server state already reflects our intent
        if (item.kind === 'scan' && /escaneado|scanned/i.test(errMsg)) {
          await remove(item.id)
          sent++
          continue
        }
        await markAttempt(item.id, errMsg)
        failed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await markAttempt(item.id, msg)
        failed++
      }
    }
  } finally {
    flushing = false
  }
  return { sent, failed, remaining: await count() }
}

export async function clearFailed(): Promise<number> {
  const items = await pending()
  let removed = 0
  for (const item of items) {
    if (item.status === 'failed') {
      await remove(item.id)
      removed++
    }
  }
  return removed
}
