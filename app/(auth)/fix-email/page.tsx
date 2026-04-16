'use client'

import { useState } from 'react'
import { Mail, KeyRound, Check, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Common typos in email domains
const DOMAIN_TYPOS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.es': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmal.es': 'hotmail.es',
  'outlok.com': 'outlook.com',
  'outook.com': 'outlook.com',
  'yahooo.com': 'yahoo.com',
  'iclud.com': 'icloud.com',
}

export default function FixEmailPage() {
  const [code, setCode] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ticketSent, setTicketSent] = useState(false)
  const [emailSuggestion, setEmailSuggestion] = useState('')

  // Auto-format code as XXXX-XXXX
  const handleCodeChange = (val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (clean.length > 4) {
      setCode(clean.slice(0, 4) + '-' + clean.slice(4))
    } else {
      setCode(clean)
    }
  }

  // Check for email typos
  const handleEmailChange = (val: string) => {
    setEmail(val)
    setEmailSuggestion('')
    const domain = val.split('@')[1]?.toLowerCase()
    if (domain && DOMAIN_TYPOS[domain]) {
      const corrected = val.split('@')[0] + '@' + DOMAIN_TYPOS[domain]
      setEmailSuggestion(corrected)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanCode = code.replace(/-/g, '')
    if (cleanCode.length !== 8) {
      setError('El codigo debe tener 8 caracteres')
      return
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Introduce un email valido')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/fix-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessCode: cleanCode, email: trimmedEmail }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al actualizar el email')
        return
      }

      setSuccess(true)
      setTicketSent(data.ticketSent)
    } catch {
      setError('Error de conexion. Intentalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="animate-fade-in text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Email actualizado</h1>
        <p className="text-sm text-white-muted leading-relaxed">
          {ticketSent
            ? 'Hemos enviado tu entrada al nuevo email. Revisa tu bandeja (y la carpeta de spam).'
            : 'Tu email ha sido corregido. Ya puedes iniciar sesion con el nuevo email.'}
        </p>
        <Link
          href="/login"
          className="btn-primary inline-flex items-center gap-2 text-sm mt-4"
        >
          Ir al login
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-xs text-white-muted hover:text-white transition-colors"
      >
        <ArrowLeft className="w-3 h-3" />
        Volver al login
      </Link>

      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-white">Corregir email</h1>
        <p className="text-xs text-white-muted leading-relaxed">
          Te equivocaste al poner tu email? Introduce tu codigo de acceso y el email correcto.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Access Code */}
        <div>
          <label className="text-xs font-medium text-white-muted mb-1.5 block">
            Codigo de acceso
          </label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="XXXX-XXXX"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm tracking-widest font-mono focus:outline-none focus:border-primary/40 transition-colors uppercase"
              autoFocus
            />
          </div>
          <p className="text-[10px] text-white-muted/60 mt-1">
            El codigo que recibiste para registrarte
          </p>
        </div>

        {/* New Email */}
        <div>
          <label className="text-xs font-medium text-white-muted mb-1.5 block">
            Email correcto
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="tu@email.com"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>
          {emailSuggestion && (
            <button
              type="button"
              onClick={() => { setEmail(emailSuggestion); setEmailSuggestion('') }}
              className="mt-1.5 text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
            >
              Quisiste decir <span className="font-medium underline">{emailSuggestion}</span>?
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || code.replace(/-/g, '').length !== 8 || !email.trim()}
          className={cn(
            'btn-primary w-full py-3 text-sm transition-all',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Actualizando...</>
          ) : (
            'Corregir email y reenviar entrada'
          )}
        </button>
      </form>

      <p className="text-[10px] text-white/25 text-center leading-relaxed">
        Si no recuerdas tu codigo de acceso, contacta con el organizador de tu evento.
      </p>
    </div>
  )
}
