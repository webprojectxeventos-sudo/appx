'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { QRCodeSVG } from 'qrcode.react'
import { X, Maximize2, Ticket } from 'lucide-react'

interface QRTicketProps {
  qrCode: string
  userName: string
  eventName: string
}

export function QRTicketCard({ qrCode, userName, eventName }: QRTicketProps) {
  const [fullscreen, setFullscreen] = useState(false)

  // Max brightness on fullscreen
  useEffect(() => {
    if (!fullscreen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [fullscreen])

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>

        <div className="text-center mb-8">
          <Image src="/logo.png" alt="Project X" width={40} height={40} className="rounded-xl mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">{eventName}</h2>
          <p className="text-gray-500 text-sm mt-1">{userName}</p>
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
    )
  }

  return (
    <button
      onClick={() => setFullscreen(true)}
      className="card-gold p-4 w-full text-left active:scale-[0.98] transition-transform animate-glow-pulse-gold"
    >
      {/* Decorative gold bar */}
      <div className="h-0.5 -mt-4 -mx-4 mb-4 rounded-t-2xl bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center flex-shrink-0 p-1">
          <QRCodeSVG
            value={qrCode}
            size={56}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-gold" />
            <p className="text-sm font-bold text-white">Tu entrada</p>
          </div>
          <p className="text-xs text-white-muted mt-0.5">Toca para ver a pantalla completa</p>
        </div>
        <Maximize2 className="w-4 h-4 text-gold/60 flex-shrink-0" />
      </div>
    </button>
  )
}
