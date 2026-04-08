'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Check, ArrowLeft, Loader2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)

  // Wait for Supabase to process the recovery token from the URL hash
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // Also check if already in a session (user clicked link and session was restored)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
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

  if (!ready) {
    return (
      <div className="space-y-6 text-center">
        <Loader2 className="w-6 h-6 text-white/30 mx-auto animate-spin" />
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Verificando enlace</h1>
          <p className="text-sm text-white/40 leading-relaxed">Si el enlace ha expirado o es invalido, solicita uno nuevo.</p>
        </div>
        <Link href="/forgot-password" className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-light transition-colors font-medium">
          Solicitar nuevo enlace
        </Link>
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
