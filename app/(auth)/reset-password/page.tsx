'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Check, ArrowLeft, Loader2, AlertCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const readyRef = useRef(false)

  // Wait for Supabase to process the recovery token from the URL hash.
  //
  // Flow:
  //  1. User clicks reset link → Supabase redirects to /reset-password with
  //     either `#access_token=...&type=recovery` (happy path) or
  //     `#error=...&error_description=...` (expired / invalid).
  //  2. The SDK's _initialize() reads the hash, exchanges it for a session,
  //     then clears the hash with `window.location.hash = ''` (on success
  //     only — error params stay in place).
  //  3. It fires PASSWORD_RECOVERY via `setTimeout(0)` AFTER initializePromise
  //     resolves. If our subscription registers *after* that setTimeout runs
  //     (slow React mount, etc.) we miss the event entirely.
  //
  // So: check the hash synchronously for an explicit error, then listen for
  // both PASSWORD_RECOVERY (fast path) and INITIAL_SESSION (guaranteed-to-fire
  // fallback). If INITIAL_SESSION has a session, Supabase either (a) processed
  // the recovery hash before we subscribed, or (b) the user is already logged
  // in — both are fine, they can update the password. No session → the link
  // didn't work, so expire.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const errParams = new URLSearchParams(window.location.hash.substring(1))
      if (errParams.get('error') || errParams.get('error_description')) {
        setExpired(true)
        return
      }
    }

    let disposed = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return

      if (event === 'PASSWORD_RECOVERY') {
        readyRef.current = true
        setReady(true)
        setExpired(false)
      } else if (event === 'INITIAL_SESSION') {
        if (session) {
          readyRef.current = true
          setReady(true)
          setExpired(false)
        } else {
          setExpired(true)
        }
      }
    })

    return () => {
      disposed = true
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setDone(true)
      setTimeout(() => router.push('/home'), 2000)
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all'

  if (done) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-1">Contraseña actualizada</h1>
          <p className="text-sm text-white/40">Redirigiendo...</p>
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertCircle className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Enlace no valido</h1>
          <p className="text-sm text-white/40 leading-relaxed">Este enlace ha expirado o no es valido. Solicita uno nuevo para restablecer tu contraseña.</p>
        </div>
        <Link href="/forgot-password" className="btn-primary inline-flex py-3 px-6 text-sm font-semibold">
          Solicitar nuevo enlace
        </Link>
        <div>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Volver al login
          </Link>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="space-y-6 text-center">
        <Loader2 className="w-6 h-6 text-white/30 mx-auto animate-spin" />
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Verificando enlace</h1>
          <p className="text-sm text-white/40">Un momento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-white">Nueva contraseña</h1>
        <p className="text-white/40 text-sm mt-1">Elige tu nueva contraseña</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          id="password"
          type="password"
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          required
          disabled={loading}
          minLength={6}
          autoFocus
        />

        <input
          id="confirm"
          type="password"
          placeholder="Confirmar contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
          required
          disabled={loading}
          minLength={6}
        />

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-sm font-semibold">
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>

      <div className="text-center">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al login
        </Link>
      </div>
    </div>
  )
}
