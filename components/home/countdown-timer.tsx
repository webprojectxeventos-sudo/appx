'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Zero-re-render countdown.
 *
 * Writes numbers directly to refs via `textContent` on each tick instead of
 * going through React state. That way the tree doesn't re-render every
 * second — important because the home panel is big and we don't want the
 * 1Hz interval to cascade through the whole event card.
 *
 * When the target passes, we flip a single `passed` state bit to swap
 * layouts from ticker → "ya empezó" banner.
 */
export const CountdownTimer = memo(function CountdownTimer({
  targetDate,
}: {
  targetDate: string
}) {
  const [passed, setPassed] = useState(() => new Date(targetDate).getTime() <= Date.now())
  const daysRef = useRef<HTMLDivElement>(null)
  const hoursRef = useRef<HTMLDivElement>(null)
  const minsRef = useRef<HTMLDivElement>(null)
  const secsRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const target = new Date(targetDate).getTime()
    if (target <= Date.now()) {
      setPassed(true)
      return
    }

    let intervalId: ReturnType<typeof setInterval>
    const update = () => {
      const diff = target - Date.now()
      if (diff <= 0) {
        setPassed(true)
        clearInterval(intervalId)
        return
      }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff / 3600000) % 24)
      const m = Math.floor((diff / 60000) % 60)
      const s = Math.floor((diff / 1000) % 60)
      if (daysRef.current) daysRef.current.textContent = String(d).padStart(2, '0')
      if (hoursRef.current) hoursRef.current.textContent = String(h).padStart(2, '0')
      if (minsRef.current) minsRef.current.textContent = String(m).padStart(2, '0')
      if (secsRef.current) secsRef.current.textContent = String(s).padStart(2, '0')
      if (labelRef.current) labelRef.current.textContent = `Faltan ${d} dias`
    }
    update()
    intervalId = setInterval(update, 1000)
    return () => clearInterval(intervalId)
  }, [targetDate])

  if (passed) {
    return (
      <div className="card-glow px-4 py-3 flex items-center gap-3 animate-glow-pulse">
        <div className="w-9 h-9 rounded-xl bg-gold/15 border border-gold/25 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-gold" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-tight">¡La fiesta ya ha empezado!</p>
          <p className="text-[11px] text-white-muted leading-tight mt-0.5">Que la disfrutes</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card-glow p-4 animate-glow-pulse">
      <p
        ref={labelRef}
        className="text-accent-gradient text-sm font-semibold text-center mb-3"
      >
        Cargando...
      </p>
      <div className="grid grid-cols-4 gap-2">
        {[
          { ref: daysRef, label: 'Dias' },
          { ref: hoursRef, label: 'Horas' },
          { ref: minsRef, label: 'Min' },
          { ref: secsRef, label: 'Seg' },
        ].map((item, i) => (
          <div key={i} className="bg-white/[0.04] rounded-xl p-3 text-center">
            <div
              ref={item.ref}
              className="text-3xl font-bold tabular-nums text-gradient-primary"
            >
              --
            </div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-gold mt-1 font-medium">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
