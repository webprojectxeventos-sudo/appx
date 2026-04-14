'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CheckCircle2, Check, Mail, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Common email domain typos — user probably meant the right-side value
const DOMAIN_TYPOS: Record<string, string> = {
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hormail.com': 'hotmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'icloud.co': 'icloud.com',
  'iclod.com': 'icloud.com',
}

function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0) return null
  const domain = email.slice(at + 1).toLowerCase()
  const fix = DOMAIN_TYPOS[domain]
  if (!fix) return null
  return email.slice(0, at + 1) + fix
}

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [gender, setGender] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [validatedEvent, setValidatedEvent] = useState<{ event_id: string; event_title: string } | null>(null)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [existingUser, setExistingUser] = useState(false)

  // Recovery flow — for users who registered with wrong email
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [recoverySuccess, setRecoverySuccess] = useState(false)

  // Email validation state (for inline UX)
  const emailsMatch = email.length > 0 && confirmEmail.length > 0 && email.trim().toLowerCase() === confirmEmail.trim().toLowerCase()
  const emailsMismatch = confirmEmail.length > 0 && !emailsMatch
  const emailSuggestion = email.length > 0 ? suggestEmailFix(email) : null

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

    // Validate emails match BEFORE touching the backend
    if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      setError('Los correos no coinciden — revisa que esten escritos igual')
      return
    }

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

      // Check if email already exists — if so, redirect to login to join the event
      const { data: existing } = await supabase.rpc('check_existing_user', { p_email: email })
      if (existing?.exists) {
        setExistingUser(true)
        setLoading(false)
        return
      }

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, gender, event_id: recheck.event_id, access_code: cleanCode },
        },
      })

      if (signUpError) {
        // Fallback: if signUp fails with "already registered", show existing user flow
        if (signUpError.message.toLowerCase().includes('already') || signUpError.message.toLowerCase().includes('registered')) {
          setExistingUser(true)
          setLoading(false)
          return
        }
        setError(signUpError.message); setLoading(false); return
      }
      if (!authData.user) { setError('Error al crear la cuenta'); setLoading(false); return }

      // Safety net: ensure user_events row exists (trigger may not always create it)
      if (authData.session && recheck.event_id) {
        await supabase.from('user_events').upsert({
          user_id: authData.user.id,
          event_id: recheck.event_id,
          role: 'attendee',
        }, { onConflict: 'user_id,event_id' }).then(() => {})
      }

      // Si hay sesión → email confirmation está OFF → ir a encuesta de bebidas
      if (authData.session) {
        router.push('/polls')
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

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')
    setRecoveryLoading(true)

    try {
      const res = await fetch('/api/auth/reset-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recoveryEmail,
          password: recoveryPassword,
          accessCode: recoveryCode.replace('-', ''),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRecoveryError(data.error || 'No se pudo recuperar la cuenta')
        setRecoveryLoading(false)
        return
      }
      // Success — show confirmation and let them go back to register
      setRecoverySuccess(true)
      setRecoveryLoading(false)
    } catch {
      setRecoveryError('Error de conexion. Intentalo de nuevo.')
      setRecoveryLoading(false)
    }
  }

  const resetRecoveryState = () => {
    setShowRecovery(false)
    setRecoverySuccess(false)
    setRecoveryEmail('')
    setRecoveryPassword('')
    setRecoveryCode('')
    setRecoveryError('')
  }

  const inputClass = 'w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all'

  // Pantalla de usuario existente — redirigir a login para unirse al evento
  if (existingUser && validatedEvent) {
    const cleanCode = accessCode.replace('-', '')
    const loginUrl = `/login?join_event=${validatedEvent.event_id}&code=${cleanCode}`
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
          <ArrowRight className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Ya tienes cuenta</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            El email <span className="text-white/70">{email}</span> ya esta registrado.
            Inicia sesion para unirte a <span className="text-white/70">{validatedEvent.event_title}</span>.
          </p>
        </div>
        <Link href={loginUrl} className="btn-primary inline-flex py-3 px-6 text-sm font-semibold gap-2">
          Iniciar sesion y unirme <ArrowRight className="w-4 h-4" />
        </Link>
        <button onClick={() => { setExistingUser(false); setEmail('') }} className="block mx-auto text-xs text-white/30 hover:text-white/50 transition-colors">
          Usar otro email
        </button>
      </div>
    )
  }

  // Pantalla de éxito de la recuperación — el user puede volver a registrarse
  if (recoverySuccess) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
          <Check className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white mb-2">Cuenta liberada</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Ya puedes volver a registrarte con el email correcto. Tu codigo de acceso ha sido liberado.
          </p>
        </div>
        <button
          onClick={() => {
            resetRecoveryState()
            setRegistered(false)
            setEmail('')
            setConfirmEmail('')
            setPassword('')
          }}
          className="btn-primary inline-flex py-3 px-6 text-sm font-semibold gap-2"
        >
          Volver a registrarme <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // Pantalla de recuperación — "me equivoqué de email"
  if (showRecovery) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Recuperar cuenta</h1>
          <p className="text-xs text-white/40 mt-1.5 leading-relaxed max-w-[280px] mx-auto">
            Si pusiste mal tu email, podemos liberar tu codigo. Necesitamos los datos que usaste al registrarte.
          </p>
        </div>

        <form onSubmit={handleRecovery} className="space-y-3">
          <div>
            <label className="block text-[11px] text-white/40 mb-1.5 px-1">Codigo de acceso</label>
            <input
              type="text"
              placeholder="XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(formatCode(e.target.value))}
              maxLength={9}
              className={cn(inputClass, 'text-center text-lg tracking-[0.25em] font-mono uppercase')}
              required
              disabled={recoveryLoading}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] text-white/40 mb-1.5 px-1">El email que pusiste (aunque fuera incorrecto)</label>
            <input
              type="email"
              placeholder="email@equivocado.com"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
              required
              disabled={recoveryLoading}
            />
          </div>

          <div>
            <label className="block text-[11px] text-white/40 mb-1.5 px-1">La contrasena que usaste</label>
            <input
              type="password"
              placeholder="Contrasena"
              value={recoveryPassword}
              onChange={(e) => setRecoveryPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
              required
              disabled={recoveryLoading}
            />
          </div>

          {recoveryError && (
            <p className="text-red-400 text-sm text-center bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              {recoveryError}
            </p>
          )}

          <button
            type="submit"
            disabled={recoveryLoading}
            className="btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2"
          >
            {recoveryLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {recoveryLoading ? 'Liberando...' : 'Liberar mi codigo'}
          </button>

          <button
            type="button"
            onClick={resetRecoveryState}
            className="block mx-auto text-xs text-white/40 hover:text-white/70 transition-colors pt-1"
          >
            Cancelar
          </button>
        </form>
      </div>
    )
  }

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

        {/* Escape hatch — user typed wrong email */}
        <div className="pt-2 border-t border-white/[0.04]">
          <p className="text-[11px] text-white/30 mb-2">No te llega el email?</p>
          <button
            onClick={() => {
              setRecoveryEmail(email)
              setRecoveryCode(accessCode)
              setShowRecovery(true)
            }}
            className="text-xs text-amber-400/80 hover:text-amber-300 transition-colors underline underline-offset-2"
          >
            Me equivoque al escribir el email
          </button>
        </div>
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
              onPaste={(e) => {
                // Prevent pasting into email — force them to type, reduces typos
                e.preventDefault()
              }}
              className={cn(
                inputClass,
                emailsMismatch && 'border-red-500/40 bg-red-500/[0.04]',
              )}
              autoComplete="email"
              required
              disabled={loading}
            />

            {/* Typo suggestion — informational, one-tap fix */}
            {emailSuggestion && (
              <button
                type="button"
                onClick={() => { setEmail(emailSuggestion); setConfirmEmail(emailSuggestion) }}
                className="w-full flex items-start gap-2 px-3 py-2 -mt-1 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 text-left"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300/90 leading-snug">
                  Quiza quisiste decir <span className="font-semibold text-amber-200">{emailSuggestion}</span>?
                  <span className="block text-amber-300/60 text-[10px] mt-0.5">Toca para corregir</span>
                </p>
              </button>
            )}

            <div className="relative">
              <input
                id="confirmEmail"
                type="email"
                placeholder="Confirmar email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                onPaste={(e) => {
                  // Prevent pasting — user must type, so a typo becomes obvious
                  e.preventDefault()
                }}
                className={cn(
                  inputClass,
                  emailsMatch && 'border-emerald-500/40 bg-emerald-500/[0.04]',
                  emailsMismatch && 'border-red-500/40 bg-red-500/[0.04]',
                )}
                autoComplete="off"
                required
                disabled={loading}
              />
              {emailsMatch && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 pointer-events-none" />
              )}
            </div>
            {emailsMismatch && (
              <p className="text-[11px] text-red-400/80 -mt-1.5 px-1">
                Los correos no coinciden
              </p>
            )}

            <input
              id="password"
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
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

      <button
        type="button"
        onClick={() => {
          setRecoveryEmail(email)
          setRecoveryCode(accessCode)
          setShowRecovery(true)
        }}
        className="block mx-auto text-[11px] text-white/25 hover:text-amber-400/70 transition-colors"
      >
        Me equivoque al escribir el email al registrarme
      </button>
    </div>
  )
}
