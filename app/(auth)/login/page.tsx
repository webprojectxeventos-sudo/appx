'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LogIn } from 'lucide-react'

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

  return (
    <div className="card-glow p-6">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center mx-auto mb-3">
          <LogIn className="w-6 h-6 text-gold" />
        </div>
        <h1 className="text-2xl font-bold text-gradient-primary">Iniciar Sesion</h1>
        <p className="text-white-muted text-sm mt-1">Entra con tu cuenta</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white-muted mb-1.5">Email</label>
          <input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-white-muted mb-1.5">Contraseña</label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            required
            disabled={loading}
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-3.5 text-base"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="mt-5 text-center">
        <p className="text-white-muted text-sm">
          No tienes cuenta?{' '}
          <Link href="/register" className="text-accent-gradient font-semibold hover:opacity-80 transition-opacity">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  )
}
