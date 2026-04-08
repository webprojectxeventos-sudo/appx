'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : signInError.message)
        setLoading(false)
        return
      }
      router.push('/home')
    } catch {
      setError('Error inesperado')
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all'

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-white">Iniciar sesion</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          id="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          required
          disabled={loading}
          autoFocus
        />

        <input
          id="password"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          required
          disabled={loading}
        />

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-white/40 hover:text-white/70 transition-colors">
            Olvidaste tu contraseña?
          </Link>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3.5 text-sm font-semibold"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-sm text-white/40">
        No tienes cuenta?{' '}
        <Link href="/register" className="text-white font-medium hover:text-primary transition-colors">
          Registrate
        </Link>
      </p>
    </div>
  )
}
