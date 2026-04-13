import { NextRequest } from 'next/server'

/**
 * Extract the caller's user ID from the request.
 * Tries x-user-id header (set by middleware/proxy) first,
 * falls back to decoding the JWT from the Authorization header.
 */
export function getCallerId(request: NextRequest): string | null {
  // Middleware-injected header (fast path)
  const fromHeader = request.headers.get('x-user-id')
  if (fromHeader) return fromHeader

  // Fallback: decode JWT from Authorization header
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null

  try {
    const token = auth.slice(7)
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(b64)
    const payload = JSON.parse(json)

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) return null

    return payload.sub || null
  } catch {
    return null
  }
}
