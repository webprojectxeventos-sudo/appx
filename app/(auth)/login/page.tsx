'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { PartyPopper } from 'lucide-react'

const translateError = (msg: string): string => {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Email o contraseña incorrectos',
    'invalid login credentials': 'Email o contraseña incorrectos',
    'Invalid email or password': 'Email o contraseña incorrectos',
    'Email not confirmed': 'Confirma tu email antes de iniciar sesion',
    'User not found': 'No existe una cuenta con ese email',
    'Too many requests': 'Demasiados intentos. Espera un momento.',
    'For security purposes, you can only request this after': 'Demasiados intentos. Espera un momento.',
    'Signups not allowed for this instance': 'El registro no esta permitido',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
  }
  if (map[msg]) return map[msg]
  for (const [key, value] of Object.entries(map)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return value
  }
  return msg
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /></div>}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Read join_event params from URL (coming from register page for existing users)
  const joinEventId = searchParams.get('join_event')
  const joinCode = searchParams.get('code')
  const [eventTitle, setEventTitle] = useState<string | null>(null)

  // Fetch event title if joining
  useEffect(() => {
    if (!joinEventId) return
    supabase.from('events').select('title').eq('id', joinEventId).single()
      .then(({ data }) => { if (data) setEventTitle(data.title) })
  }, [joinEventId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(translateError(signInError.message))
        setLoading(false)
        return
      }

      const userId = signInData.user?.id
      if (!userId) { setError('Error inesperado'); setLoading(false); return }

      // If joining a new event via code
      if (joinEventId && joinCode) {
        try {
          // Validate and consume the access code
          const { data: validated } = await supabase.rpc('validate_access_code', { code_text: joinCode })
          if (validated) {
            // Add user to the event
            await supabase.from('user_events').upsert({
              user_id: userId,
              event_id: joinEventId,
              role: 'attendee',
            }, { onConflict: 'user_id,event_id' })

            // Switch active event to the new one
            await supabase.from('users').update({ event_id: joinEventId }).eq('id', userId)

            // Redirect to polls (drink survey for the new event)
            router.replace('/polls')
            return
          }
          // Code invalid (already used) — still join if upsert works, just don't consume code
          await supabase.from('user_events').upsert({
            user_id: userId,
            event_id: joinEventId,
            role: 'attendee',
          }, { onConflict: 'user_id,event_id' })
          await supabase.from('users').update({ event_id: joinEventId }).eq('id', userId)
          router.replace('/polls')
          return
        } catch {
          console.error('Error joining event, continuing to home')
        }
      }

      // Don't setLoading(false) — keep "Entrando..." visible until navigation completes
      router.replace('/home')
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

      {/* Join event banner */}
      {joinEventId && eventTitle && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/[0.04]">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <PartyPopper className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-white/50">Unirte a</p>
            <p className="text-sm font-medium text-white">{eventTitle}</p>
          </div>
        </div>
      )}

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
          {loading ? 'Entrando...' : joinEventId ? 'Entrar y unirme' : 'Entrar'}
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
