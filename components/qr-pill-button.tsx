'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { X, Ticket } from 'lucide-react'

interface QRPillButtonProps {
  qrCode: string
  userName: string
  eventName: string
}

/**
 * Compact "Ver entrada" pill that opens the same fullscreen QR modal as
 * QRTicketCard. Used in /events so a user with multiple events (e.g. two
 * graduations) can pull up either QR without switching the active event.
 */
export function QRPillButton({ qrCode, userName, eventName }: QRPillButtonProps) {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setFullscreen(true)
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 border border-gold/30 text-gold text-[11px] font-medium hover:bg-gold/25 transition-colors"
        aria-label="Ver QR de entrada"
      >
        <Ticket className="w-3 h-3" />
        Ver QR
      </button>

      {fullscreen && (
        <div
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>

          <div className="text-center mb-8">
            <Image src="/logo.png" alt="Project X" width={40} height={40} className="rounded-xl mx-auto mb-3" />
            <h2 className="text-xl font-bold text-gray-900">{eventName}</h2>
            {userName && <p className="text-gray-500 text-sm mt-1">{userName}</p>}
          </div>

          <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100">
            <QRCodeSVG
              value={qrCode}
              size={280}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          <p className="text-gray-400 text-xs mt-6">Muestra este codigo en la entrada</p>
        </div>
      )}
    </>
  )
}
