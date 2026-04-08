'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { UserPlus, CheckCircle2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validatedEvent, setValidatedEvent] = useState<{ event_id: string; event_title: string } | null>(null)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  const formatCode = (value: string): string => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    return clean.length > 4 ? clean.slice(0, 4) + '-' + clean.slice(4) : clean
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value)
    setAccessCode(formatted)
    setValidatedEvent(null)
    setError('')
    const cleanCode = formatted.replace('-', '')
    if (cleanCode.length === 8) validateCode(cleanCode)
  }

  const validateCode = async (code: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('validate_access_code', { code_text: code })
      if (rpcError || !data) {
        setError('Codigo no valido o ya utilizado')
        setValidatedEvent(null)
        return
      }
      setValidatedEvent({ event_id: data.event_id, event_title: data.event_title })
      setError('')
    } catch {
      setError('Error al validar el codigo')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const cleanCode = accessCode.replace('-', '')

    if (!validatedEvent) {
      try {
        const { data, error: rpcError } = await supabase.rpc('validate_access_code', { code_text: cleanCode })
        if (rpcError || !data) { setError('Codigo no valido o ya utilizado'); setLoading(false); return }
        setValidatedEvent({ event_id: data.event_id, event_title: data.event_title })
      } catch { setError('Error al validar el codigo'); setLoading(false); return }
    }

    try {
      const { data: recheck } = await supabase.rpc('validate_access_code', { code_text: cleanCode })
      if (!recheck) { setError('Este codigo acaba de ser utilizado por otra persona'); setLoading(false); return }

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, gender, event_id: recheck.event_id, access_code: cleanCode },
        },
      })

      if (signUpError) { setError(signUpError.message); setLoading(false); return }
      if (!authData.user) { setError('Error al crear la cuenta'); setLoading(false); return }

      // Generar ticket inmediatamente tras registro
      const { data: ticketData } = await supabase.rpc('generate_ticket', {
        p_user_id: authData.user.id,
        p_event_id: recheck.event_id,
      })

      // Enviar email con la entrada (fire-and-forget)
      if (ticketData) {
        fetch('/api/send-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            userName: fullName,
            eventTitle: recheck.event_title,
            qrCode: ticketData,
          }),
        }).catch(() => {})
      }

      router.push('/home')
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  return (
    <div className="card-glow p-6">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center mx-auto mb-3">
          <UserPlus className="w-6 h-6 text-gold" />
        </div>
        <h1 className="text-2xl font-bold text-gradient-primary">Crear Cuenta</h1>
        <p className="text-white-muted text-sm mt-1">Usa tu codigo de acceso</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Access Code */}
        <div>
          <label htmlFor="accessCode" className="block text-sm font-medium text-white-muted mb-1.5">Codigo de Acceso</label>
          <input
            id="accessCode"
            type="text"
            placeholder="XXXX-XXXX"
            value={accessCode}
            onChange={handleCodeChange}
            maxLength={9}
            className={cn(
              inputClass,
              'text-center text-xl tracking-[0.25em] font-mono uppercase',
              validatedEvent && 'border-emerald-500/50 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            )}
            required
            disabled={loading}
            autoFocus
          />
          {validatedEvent && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm mt-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{validatedEvent.event_title}</span>
            </div>
          )}
          {!validatedEvent && !error && (
            <p className="text-white-muted text-xs mt-1.5">Introduce el codigo de 8 caracteres de tu entrada</p>
          )}
        </div>

        {/* Rest of form — only after valid code */}
        {validatedEvent && (
          <div className="space-y-4 animate-scale-in">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-white-muted mb-1.5">Nombre Completo</label>
              <input
                id="fullName"
                type="text"
                placeholder="Tu nombre"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-white-muted mb-1.5">Genero</label>
              <select
                id="gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={cn(inputClass, !gender && 'text-gray-600')}
                required
                disabled={loading}
              >
                <option value="" disabled>Selecciona...</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white-muted mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
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
                className={inputClass}
                required
                disabled={loading}
              />
            </div>

            {/* Privacy checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={(e) => setPrivacyAccepted(e.target.checked)}
                  className="sr-only"
                  disabled={loading}
                />
                <div
                  className={cn(
                    'w-5 h-5 rounded-md border transition-all flex items-center justify-center',
                    privacyAccepted
                      ? 'bg-primary/20 border-primary/50'
                      : 'bg-transparent border-black-border'
                  )}
                >
                  {privacyAccepted && <Check className="w-3 h-3 text-primary" />}
                </div>
              </div>
              <p className="text-[11px] text-white-muted/60 leading-relaxed">
                He leido y acepto la{' '}
                <Link href="/privacy" className="text-white-muted hover:text-white underline transition-colors" target="_blank">
                  Politica de Privacidad
                </Link>{' '}
                y los{' '}
                <Link href="/terms" className="text-white-muted hover:text-white underline transition-colors" target="_blank">
                  Terminos de Servicio
                </Link>
              </p>
            </label>

            <button
              type="submit"
              disabled={loading || !privacyAccepted}
              className="btn-primary w-full py-3.5 text-base disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Registrando...' : 'Registrarse'}
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
        )}
      </form>

      <div className="mt-5 text-center">
        <p className="text-white-muted text-sm">
          Ya tienes cuenta?{' '}
          <Link href="/login" className="text-accent-gradient font-semibold hover:opacity-80 transition-opacity">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  )
}
