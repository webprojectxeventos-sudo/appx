import { supabase } from './supabase'

/**
 * Authenticated fetch — centralizes the getSession() + Authorization header pattern.
 *
 * Features:
 * - Auto-attaches Bearer token from current session
 * - 15s timeout via AbortController (prevents infinite hangs)
 * - Throws typed error on no session or timeout
 *
 * Usage:
 *   const res = await authFetch('/api/admin/create-user', { email, password, role })
 *   const data = await res.json()
 */
export class AuthError extends Error {
  constructor(message: string, public code: 'NO_SESSION' | 'TIMEOUT' | 'NETWORK') {
    super(message)
    this.name = 'AuthError'
  }
}

const FETCH_TIMEOUT_MS = 15_000

export async function authFetch(
  url: string,
  body?: Record<string, unknown>,
  options?: { method?: string; timeout?: number }
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new AuthError('Sesion expirada — vuelve a iniciar sesion', 'NO_SESSION')
  }

  const controller = new AbortController()
  const timeoutMs = options?.timeout ?? FETCH_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: options?.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    return res
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AuthError('La peticion tardo demasiado — intenta de nuevo', 'TIMEOUT')
    }
    throw new AuthError('Error de red — comprueba tu conexion', 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}
