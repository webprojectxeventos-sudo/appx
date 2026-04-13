'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Navigation, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventMapProps {
  latitude: number
  longitude: number
  location: string
}

const NAV_APPS = [
  {
    name: 'Google Maps',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#E41E2B"/>
        <circle cx="12" cy="9" r="2.5" fill="white"/>
      </svg>
    ),
    getUrl: (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    color: 'from-blue-500/15 to-green-500/15',
    border: 'border-blue-500/20',
  },
  {
    name: 'Apple Maps',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#34C759"/>
        <circle cx="12" cy="9" r="2.5" fill="white"/>
      </svg>
    ),
    getUrl: (lat: number, lng: number) => `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    color: 'from-green-500/15 to-emerald-500/15',
    border: 'border-green-500/20',
  },
  {
    name: 'Waze',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="9" fill="#33CCFF"/>
        <circle cx="9" cy="10" r="1.5" fill="#333"/>
        <circle cx="15" cy="10" r="1.5" fill="#333"/>
        <path d="M8 15c1 1.5 7 1.5 8 0" stroke="#333" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    getUrl: (lat: number, lng: number) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    color: 'from-cyan-500/15 to-sky-500/15',
    border: 'border-cyan-500/20',
  },
]

export function EventMap({ latitude, longitude, location }: EventMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<unknown>(null)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const initMap = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')

      const map = L.map(mapRef.current!, {
        center: [latitude, longitude],
        zoom: 15,
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;background:#E41E2B;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })

      L.marker([latitude, longitude], { icon }).addTo(map)
      mapInstance.current = map
    }

    initMap()

    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove()
        mapInstance.current = null
      }
    }
  }, [latitude, longitude])

  return (
    <>
      <div className="card overflow-hidden">
        <div ref={mapRef} className="w-full h-[180px] rounded-t-xl" />
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <p className="text-sm text-white truncate">{location}</p>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold active:scale-95 transition-transform flex-shrink-0 shadow-[0_0_12px_rgba(228,30,43,0.3)]"
          >
            <Navigation className="w-3.5 h-3.5" />
            Como llegar
          </button>
        </div>
      </div>

      {/* Navigation app picker overlay */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowPicker(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" style={{ animation: 'fadeIn 0.15s ease-out' }} />

          {/* Sheet */}
          <div
            className="relative w-full max-w-lg mx-4 mb-4 rounded-2xl overflow-hidden border border-white/[0.06]"
            style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #111 100%)', animation: 'slideUp 0.25s ease-out' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white">Como llegar</h3>
                <p className="text-[11px] text-white-muted mt-0.5 truncate">{location}</p>
              </div>
              <button onClick={() => setShowPicker(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <X className="w-4 h-4 text-white-muted" />
              </button>
            </div>

            {/* App options */}
            <div className="p-4 pt-2 space-y-2">
              {NAV_APPS.map(app => (
                <a
                  key={app.name}
                  href={app.getUrl(latitude, longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setShowPicker(false)}
                  className={cn(
                    'flex items-center gap-3.5 p-3.5 rounded-xl border transition-all active:scale-[0.97]',
                    `bg-gradient-to-r ${app.color} ${app.border}`,
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    {app.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{app.name}</p>
                    <p className="text-[11px] text-white-muted">Abrir en {app.name}</p>
                  </div>
                  <Navigation className="w-4 h-4 text-white-muted" />
                </a>
              ))}
            </div>

            {/* Cancel */}
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowPicker(false)}
                className="w-full py-3 rounded-xl bg-white/5 text-sm text-white-muted font-medium active:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  )
}
