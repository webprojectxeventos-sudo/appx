/**
 * Local-first scan validation.
 *
 * The scanner provider already preloads every valid ticket for the venue
 * (`/api/scanner/attendees`). That means for 99% of scans we can decide
 * success / duplicate / unknown with a single Map lookup — no network
 * round-trip required. The backend call becomes a background confirmation
 * (handled by `scan-sync-queue.ts`) instead of a blocking dependency.
 *
 * This module is pure: no React, no I/O, no side effects. That makes it
 * trivially unit-testable and callable from hot paths (<5 ms per scan).
 */

import type { AttendeeRow } from '@/components/scanner/scanner-types'

export type LocalValidation =
  | {
      kind: 'success'
      attendee: AttendeeRow
      eventTitle: string | undefined
    }
  | {
      kind: 'duplicate'
      attendee: AttendeeRow
      eventTitle: string | undefined
      /** When this ticket was first scanned, if known locally. */
      scannedAt: string | null
    }
  | {
      kind: 'cancelled'
      attendee: AttendeeRow
    }
  | {
      /** QR didn't match any cached ticket — must defer to backend. */
      kind: 'unknown'
    }

export interface ValidatorContext {
  /** Map from `qr_code` → attendee row. Built once in the provider. */
  attendeesByQr: Map<string, AttendeeRow>
  /** event_id → event.title, for nicer UX labels. */
  eventNameMap: Record<string, string>
}

/**
 * Decide the outcome of a scan based purely on local state.
 *
 * This is the first thing we do after a QR is detected; the UI uses the
 * result to flash success/duplicate/error instantly. The backend is still
 * called in the background to persist the change and catch edge cases
 * (ticket created after the initial preload, ticket cancelled remotely,
 * etc.) — but the operator never waits for it.
 */
export function validateScanLocal(
  qr: string,
  ctx: ValidatorContext,
): LocalValidation {
  const attendee = ctx.attendeesByQr.get(qr)
  if (!attendee) return { kind: 'unknown' }

  const eventTitle = ctx.eventNameMap[attendee.event_id]

  if (attendee.status === 'cancelled') {
    return { kind: 'cancelled', attendee }
  }
  if (attendee.status === 'used') {
    return {
      kind: 'duplicate',
      attendee,
      eventTitle,
      scannedAt: attendee.scanned_at,
    }
  }
  // status === 'valid'
  return { kind: 'success', attendee, eventTitle }
}
