import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract local-timezone date key (YYYY-MM-DD) from a timestamp or Date.
 *
 * Critical: do NOT use `new Date(iso).toISOString().split('T')[0]` — that
 * returns the UTC date, which for events saved as "viernes 00:00 Madrid"
 * (stored as jueves 22:00 UTC) would show the wrong day.
 */
export function toLocalDateKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
