'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Check, Mail } from 'lucide-react'
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
  const [registered, setRegistered] = useState(false)

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

      // Si hay sesión → email confirmation está OFF → entrar directo
      if (authData.session) {
        router.push('/home')
        return
      }

      // Si no hay sesión → email confirmation está ON → mostrar pantalla de éxito
      setRegistered(true)
      setLoading(false)
    } catch {
      setError('Error inesperado. Intentalo de nuevo.')
      setLoading(false)
    }
  }

  const inputClass = 'w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all'

  // Pantalla de éxito tras registro (cuando email confirmation está ON)
  if (registered) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Mail className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Cuenta creada</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Hemos enviado un enlace de confirmacion a <span className="text-white/70">{email}</span>. Revisa tu bandeja de entrada para activar tu cuenta.
          </p>
        </div>
        <Link href="/login" className="btn-primary inline-flex py-3 px-6 text-sm font-semibold">
          Ir al login
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-white">Crear cuenta</h1>
        <p className="text-white/40 text-sm mt-1">Usa tu codigo de acceso</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Access Code */}
        <div>
          <input
            id="accessCode"
            type="text"
            placeholder="XXXX-XXXX"
            value={accessCode}
            onChange={handleCodeChange}
            maxLength={9}
            className={cn(
              inputClass,
              'text-center text-lg tracking-[0.25em] font-mono uppercase',
              validatedEvent && 'border-emerald-500/40 bg-emerald-500/[0.06]'
            )}
            required
            disabled={loading}
            autoFocus
          />
          {validatedEvent && (
            <div className="flex items-center gap-2 text-emerald-400 text-xs mt-2 justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{validatedEvent.event_title}</span>
            </div>
          )}
          {!validatedEvent && !error && (
            <p className="text-white/30 text-xs mt-1.5 text-center">Codigo de 8 caracteres de tu entrada</p>
          )}
        </div>

        {/* Rest of form — only after valid code */}
        {validatedEvent && (
          <div className="space-y-3 animate-scale-in">
            <input
              id="fullName"
              type="text"
              placeholder="Nombre completo"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              required
              disabled={loading}
            />

            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={cn(inputClass, !gender && 'text-white/25')}
              required
              disabled={loading}
            >
              <option value="" disabled>Genero</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="otro">Otro</option>
            </select>

            <input
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
              disabled={loading}
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

            {/* Privacy checkbox */}
            <label className="flex items-start gap-3 cursor-pointer py-1">
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
                      : 'bg-transparent border-white/[0.08]'
                  )}
                >
                  {privacyAccepted && <Check className="w-3 h-3 text-primary" />}
                </div>
              </div>
              <p className="text-[11px] text-white/30 leading-relaxed">
                He leido y acepto la{' '}
                <Link href="/privacy" className="text-white/50 hover:text-white underline transition-colors" target="_blank">
                  Politica de Privacidad
                </Link>{' '}
                y los{' '}
                <Link href="/terms" className="text-white/50 hover:text-white underline transition-colors" target="_blank">
                  Terminos de Servicio
                </Link>
              </p>
            </label>

            <button
              type="submit"
              disabled={loading || !privacyAccepted}
              className="btn-primary w-full py-3.5 text-sm font-semibold"
            >
              {loading ? 'Registrando...' : 'Registrarse'}
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</p>
        )}
      </form>

      <p className="text-center text-sm text-white/40">
        Ya tienes cuenta?{' '}
        <Link href="/login" className="text-white font-medium hover:text-primary transition-colors">
          Inicia sesion
        </Link>
      </p>
    </div>
  )
}
