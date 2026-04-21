/**
 * Background confirmation for optimistic scans.
 *
 * The scanner's hot path (`validateScanLocal` in `scan-validator.ts`)
 * decides success/duplicate/unknown from cached tickets and flashes the
 * UI instantly. That means the POST to `/api/scanner/scan` no longer
 * gates the visible response — it runs here, in the background, just to
 * persist the state transition server-side.
 *
 * Responsibilities:
 *   1. Fire-and-forget POST to `/api/scanner/scan`.
 *   2. On network error / offline → enqueue in the persistent outbox
 *      so it survives tab kills.
 *   3. On hard conflict (server says the ticket is actually cancelled,
 *      or unknown, etc.) → invoke `onConflict` so the UI can revert the
 *      optimistic patch and alert the operator.
 *
 * Idempotency: each sync carries a UUID `idempotency_key`. The backend
 * doesn't currently dedupe on it, but the server treats re-scans of the
 * same ticket as success-equivalent ("ya escaneado"), so a replay is
 * harmless. The outbox flusher already handles that path.
 */

'use client'

import { supabase } from '@/lib/supabase'
import * as outbox from '@/lib/scanner-outbox'

export type ScanConflict =
  /** Server claims the ticket doesn't exist. Unknown QR — revert optimistic success. */
  | { reason: 'not_found'; message: string }
  /** Server says the ticket is cancelled. Revert optimistic success. */
  | { reason: 'cancelled'; message: string }
  /** Operator doesn't have staff access to this event. Revert + alert. */
  | { reason: 'forbidden'; message: string }
  /** Auth token expired between local match and sync — operator must re-login. */
  | { reason: 'auth'; message: string }
  /**
   * Server says it's already scanned but we thought it was still valid.
   * Most common when two operators scan the same ticket within the
   * realtime debounce window. Treat as soft conflict: the ticket IS used,
   * just not by us.
   */
  | {
      reason: 'already_scanned'
      message: string
      userName?: string
      eventTitle?: string
      scannedAt?: string
    }

export interface SyncScanOptions {
  qr: string
  /** Human label for the outbox badge if we have to persist. */
  label?: string
  /**
   * Called when the server disagrees with our optimistic decision.
   * The caller is responsible for reverting state + showing a toast.
   */
  onConflict?: (c: ScanConflict) => void
  /**
   * Called when the server confirms our optimistic decision. Usually a
   * no-op for the UI; exposed for telemetry / logs.
   */
  onConfirmed?: (info: { userName?: string; eventTitle?: string; scannedAt?: string }) => void
  /**
   * Called when the scan couldn't be sent and was persisted to the outbox
   * instead. UI can surface the pending-sync badge.
   */
  onQueued?: () => void
}

type ServerResponse = {
  success: boolean
  error?: string
  user_name?: string
  event_title?: string
  scanned_at?: string
}

/**
 * Send the scan to the server without blocking the caller. Always returns
 * immediately; callbacks fire whenever the network settles.
 */
export function syncScanInBackground(opts: SyncScanOptions): void {
  // Don't await — this is the whole point of the module.
  void sendOrQueue(opts)
}

async function sendOrQueue({
  qr,
  label,
  onConflict,
  onConfirmed,
  onQueued,
}: SyncScanOptions): Promise<void> {
  // Navigator is browser-only; this module is 'use client' so it's safe,
  // but guard anyway for SSR import safety.
  const isOnline =
    typeof navigator === 'undefined' ? true : navigator.onLine !== false

  if (!isOnline) {
    await outbox.enqueue({
      kind: 'scan',
      endpoint: '/api/scanner/scan',
      payload: { ticket_qr: qr },
      label,
    })
    onQueued?.()
    return
  }

  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
  try {
    session = (await supabase.auth.getSession()).data.session
  } catch {
    session = null
  }
  if (!session) {
    onConflict?.({ reason: 'auth', message: 'Sesion expirada — vuelve a iniciar sesion' })
    return
  }

  let res: Response
  try {
    res = await fetch('/api/scanner/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ticket_qr: qr }),
    })
  } catch {
    // Network blip mid-request — queue for retry rather than losing the scan.
    await outbox.enqueue({
      kind: 'scan',
      endpoint: '/api/scanner/scan',
      payload: { ticket_qr: qr },
      label,
    })
    onQueued?.()
    return
  }

  // 403 before we can parse JSON — treat as forbidden.
  if (res.status === 403) {
    onConflict?.({
      reason: 'forbidden',
      message: 'No tienes permiso para escanear este ticket',
    })
    return
  }
  if (res.status === 401) {
    onConflict?.({ reason: 'auth', message: 'Sesion expirada' })
    return
  }

  let body: ServerResponse
  try {
    body = (await res.json()) as ServerResponse
  } catch {
    body = { success: false, error: `HTTP ${res.status}` }
  }

  if (body.success) {
    onConfirmed?.({
      userName: body.user_name,
      eventTitle: body.event_title,
      scannedAt: body.scanned_at,
    })
    return
  }

  const err = body.error || `HTTP ${res.status}`
  // Classify the failure so the UI can react appropriately.
  if (/no encontrado|not found/i.test(err)) {
    onConflict?.({ reason: 'not_found', message: err })
    return
  }
  if (/cancelado|cancelled/i.test(err)) {
    onConflict?.({ reason: 'cancelled', message: err })
    return
  }
  if (/ya escaneado|already scanned|escaneado/i.test(err)) {
    onConflict?.({
      reason: 'already_scanned',
      message: err,
      userName: body.user_name,
      eventTitle: body.event_title,
      scannedAt: body.scanned_at,
    })
    return
  }
  // Anything else — 500, transient — queue for retry.
  await outbox.enqueue({
    kind: 'scan',
    endpoint: '/api/scanner/scan',
    payload: { ticket_qr: qr },
    label,
  })
  onQueued?.()
}
