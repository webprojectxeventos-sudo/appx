'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { Wine, GlassWater, AlertTriangle, CheckCircle2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QRTicketCard } from '@/components/qr-ticket'

const ALCOHOL_OPTIONS = ['Ron', 'Whiskey', 'Ginebra', 'Vodka']

const SOFT_DRINK_OPTIONS = [
  'Coca-Cola',
  'Coca-Cola Light',
  'Fanta de Naranja',
  'Fanta de Limon',
  'Sprite',
  'Redbull',
  'Aquarius',
  'Zumo de Pina',
]

const ALLERGY_OPTIONS = [
  'Celiaco/a',
  'Intolerancia a la lactosa',
  'Alergia a frutos secos',
  'Alergia al marisco',
  'Alergia al huevo',
  'Alergia al gluten',
]

export default function DrinksPage() {
  const { user, profile, event, venue, loading } = useAuth()
  const { error: showError, success } = useToast()
  const [alcoholChoice, setAlcoholChoice] = useState<string | null>(null)
  const [softDrinkChoice, setSoftDrinkChoice] = useState<string | null>(null)
  const [allergies, setAllergies] = useState<string[]>([])
  const [allergyNotes, setAllergyNotes] = useState('')
  const [existingOrder, setExistingOrder] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isLoadingOrder, setIsLoadingOrder] = useState(true)
  const [eventType, setEventType] = useState<'eso' | 'fiesta'>('fiesta')
  const [qrCode, setQrCode] = useState<string | null>(null)

  useEffect(() => {
    if (!event?.id || !user?.id) return
    let cancelled = false
    const loadOrder = async () => {
      setIsLoadingOrder(true)
      try {
        const { data, error } = await supabase
          .from('drink_orders')
          .select('*')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .single()
        if (cancelled) return
        if (data && !error) {
          setAlcoholChoice(data.alcohol_choice)
          setSoftDrinkChoice(data.soft_drink_choice)
          setAllergies(data.allergies || [])
          setAllergyNotes(data.allergy_notes || '')
          setExistingOrder(true)
          setSubmitted(true)
        }
        // Also fetch existing ticket
        const { data: ticket } = await supabase
          .from('tickets')
          .select('qr_code')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .single()
        if (cancelled) return
        if (ticket?.qr_code) {
          setQrCode(ticket.qr_code)
        }
      } catch {
        // No existing order
      } finally {
        if (!cancelled) setIsLoadingOrder(false)
      }
    }
    loadOrder()
    setEventType((event as { event_type?: 'eso' | 'fiesta' }).event_type || 'fiesta')
    return () => { cancelled = true }
  }, [event?.id, user?.id])

  const fetchExistingOrder = async () => {
    if (!event?.id || !user?.id) return
    setIsLoadingOrder(true)
    try {
      const { data, error } = await supabase
        .from('drink_orders')
        .select('*')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .single()
      if (data && !error) {
        setAlcoholChoice(data.alcohol_choice)
        setSoftDrinkChoice(data.soft_drink_choice)
        setAllergies(data.allergies || [])
        setAllergyNotes(data.allergy_notes || '')
        setExistingOrder(true)
        setSubmitted(true)
      }
      // Also fetch existing ticket
      const { data: ticket } = await supabase
        .from('tickets')
        .select('qr_code')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .single()
      if (ticket?.qr_code) {
        setQrCode(ticket.qr_code)
      }
    } catch {
      // No existing order
    } finally {
      setIsLoadingOrder(false)
    }
  }

  const toggleAllergy = (allergy: string) => {
    setAllergies((prev) => prev.includes(allergy) ? prev.filter((a) => a !== allergy) : [...prev, allergy])
  }

  const handleSubmit = async () => {
    if (!user?.id || !event?.id || !softDrinkChoice) return
    if (eventType === 'fiesta' && !alcoholChoice) return

    setSubmitting(true)
    try {
      const orderData = {
        event_id: event.id,
        user_id: user.id,
        alcohol_choice: eventType === 'fiesta' ? alcoholChoice : null,
        soft_drink_choice: softDrinkChoice,
        allergies,
        allergy_notes: allergyNotes || null,
      }
      if (existingOrder) {
        const { error } = await supabase.from('drink_orders').update(orderData).eq('event_id', event.id).eq('user_id', user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('drink_orders').insert(orderData)
        if (error) throw error
        setExistingOrder(true)
      }
      // Generate ticket QR if not already generated, then send email
      if (!qrCode) {
        const { data: ticketQr } = await supabase.rpc('generate_ticket', {
          p_user_id: user.id,
          p_event_id: event.id,
        })
        if (ticketQr) {
          setQrCode(ticketQr as string)
          // Send QR ticket email
          const { data: { session: currentSession } } = await supabase.auth.getSession()
          fetch('/api/send-ticket', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {}),
            },
            body: JSON.stringify({
              to: profile?.email || user.email,
              userName: profile?.full_name || '',
              eventTitle: event.title,
              qrCode: ticketQr,
              eventDate: event.date || null,
              venueName: venue?.name || null,
            }),
          }).catch(() => {})
        }
      }
      setSubmitted(true)
    } catch (err) {
      console.error('Error saving drink order:', err)
      showError('Error al guardar tu pedido')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || isLoadingOrder) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="card p-5 space-y-4">
          <div className="h-6 w-48 bg-white/5 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 gap-2.5">
            {[0,1,2,3].map(i => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
          </div>
        </div>
        <div className="card p-5 space-y-4">
          <div className="h-6 w-40 bg-white/5 rounded-lg animate-pulse" />
          <div className="grid grid-cols-2 gap-2.5">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />)}
          </div>
        </div>
      </div>
    )
  }
  if (!event?.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <GlassWater className="h-10 w-10 text-white-muted mb-3" />
        <p className="text-white-muted">No hay evento disponible</p>
      </div>
    )
  }

  const canSubmit = softDrinkChoice && (eventType === 'eso' || alcoholChoice)

  // Success state
  if (submitted) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="card-accent p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Pedido registrado</h2>
          <p className="text-white-muted text-sm">Ya hemos apuntado lo que vas a beber</p>
        </div>

        <div className="card divide-y divide-white/5">
          {alcoholChoice && (
            <div className="flex items-center gap-3.5 p-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Wine className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-white-muted">Sueles beber</p>
                <p className="text-white font-medium text-sm">{alcoholChoice}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3.5 p-4">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <GlassWater className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-white-muted">Vas a beber</p>
              <p className="text-white font-medium text-sm">{softDrinkChoice}</p>
            </div>
          </div>
          {allergies.length > 0 && (
            <div className="flex items-start gap-3.5 p-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] text-white-muted">Alergias</p>
                <p className="text-white font-medium text-sm">{allergies.join(', ')}</p>
                {allergyNotes && <p className="text-white-muted text-xs mt-0.5">{allergyNotes}</p>}
              </div>
            </div>
          )}
        </div>

        {qrCode && (
          <QRTicketCard
            qrCode={qrCode}
            userName={profile?.full_name || ''}
            eventName={event?.title || ''}
          />
        )}

        <button onClick={() => setSubmitted(false)} className="btn-ghost w-full">
          <Pencil className="w-4 h-4" />
          Modificar pedido
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-5 pb-24">
      {/* Alcohol Section */}
      {eventType === 'fiesta' && (
        <div className="card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <Wine className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-white">Que sueles beber?</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {ALCOHOL_OPTIONS.map((drink) => (
              <button
                key={drink}
                onClick={() => setAlcoholChoice(drink)}
                className={cn(
                  'px-4 py-3 rounded-xl text-sm font-medium text-center border transition-all active:scale-95',
                  alcoholChoice === drink
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-black-border bg-transparent text-white hover:border-white/15'
                )}
              >
                {drink}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Soft Drinks */}
      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <GlassWater className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-white">Que vas a beber?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {SOFT_DRINK_OPTIONS.map((drink) => {
            const label = drink === 'Aquarius' && eventType === 'fiesta' ? 'Aquarius (No mezcla)' : drink
            return (
              <button
                key={drink}
                onClick={() => setSoftDrinkChoice(drink)}
                className={cn(
                  'px-3 py-3 rounded-xl text-[13px] font-medium text-center border transition-all active:scale-95',
                  softDrinkChoice === drink
                    ? 'border-primary bg-primary/12 text-primary'
                    : 'border-black-border bg-transparent text-white hover:border-white/15'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Allergies */}
      <div className="card p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-bold text-white">Alergias / Intolerancias</h2>
        </div>
        <p className="text-white-muted text-xs mb-4 ml-[30px]">Opcional — selecciona si aplica</p>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {ALLERGY_OPTIONS.map((allergy) => (
            <button
              key={allergy}
              onClick={() => toggleAllergy(allergy)}
              className={cn(
                'px-3 py-3 rounded-xl text-[13px] font-medium text-center border transition-all active:scale-95',
                allergies.includes(allergy)
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-black-border bg-transparent text-white hover:border-white/15'
              )}
            >
              {allergy}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={allergyNotes}
          onChange={(e) => setAllergyNotes(e.target.value)}
          placeholder="Otros (ej: alergia al melocoton...)"
          className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
        />
      </div>

      {/* Submit */}
      <div className="fixed bottom-20 left-0 right-0 px-4 pb-3 z-20">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="btn-primary w-full py-3.5 text-base"
          >
            {submitting ? 'Guardando...' : existingOrder ? 'Actualizar pedido' : 'Confirmar pedido'}
          </button>
        </div>
      </div>
    </div>
  )
}
