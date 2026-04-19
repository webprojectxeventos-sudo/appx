'use client'

import { useEffect } from 'react'
import { X, Image as ImageIcon, Calendar } from 'lucide-react'
import { PhotosTab } from './tabs/photos-tab'

interface VenuePhotosModalProps {
  open: boolean
  onClose: () => void
  venueId: string
  venueName: string
  date: string
  dateFormatted?: string
}

export function VenuePhotosModal({
  open,
  onClose,
  venueId,
  venueName,
  date,
  dateFormatted,
}: VenuePhotosModalProps) {
  // Close on Escape for consistency with other modals
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const prettyDate =
    dateFormatted ??
    new Date(date + 'T12:00:00').toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-black-border shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <ImageIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                Fotos · {venueName}
              </h3>
              <p className="flex items-center gap-1.5 text-xs text-white-muted mt-0.5">
                <Calendar className="w-3 h-3 shrink-0" />
                <span className="truncate">{prettyDate}</span>
              </p>
              <p className="text-[11px] text-primary/70 mt-1 leading-tight">
                Compartido con todos los institutos del venue en esta fecha
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <PhotosTab venueId={venueId} date={date} />
        </div>
      </div>
    </div>
  )
}
