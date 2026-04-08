'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Mail, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setSent(true)
    } catch {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all'

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Mail className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Revisa tu email</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Si existe una cuenta con <span className="text-white/70">{email}</span>, recibiras un enlace para restablecer tu contraseña.
          </p>
        </div>
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver al login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-white">Restablecer contraseña</h1>
        <p className="text-white/40 text-sm mt-1">Te enviaremos un enlace por email</p>
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

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-sm font-semibold">
          {loading ? 'Enviando...' : 'Enviar enlace'}
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
