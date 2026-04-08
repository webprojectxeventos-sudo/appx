'use client'

import { useEffect, useRef } from 'react'
import { MapPin, Navigation } from 'lucide-react'

interface EventMapProps {
  latitude: number
  longitude: number
  location: string
}

export function EventMap({ latitude, longitude, location }: EventMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<unknown>(null)

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

      // Custom marker
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

  const openDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    window.open(url, '_blank')
  }

  return (
    <div className="card overflow-hidden">
      <div ref={mapRef} className="w-full h-[180px] rounded-t-xl" />
      <div className="p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <p className="text-sm text-white truncate">{location}</p>
        </div>
        <button
          onClick={openDirections}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium active:scale-95 transition-transform flex-shrink-0"
        >
          <Navigation className="w-3.5 h-3.5" />
          Ir
        </button>
      </div>
    </div>
  )
}
