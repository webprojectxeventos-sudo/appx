'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import NextImage from 'next/image'
import { Image as ImageIcon, ChevronLeft, ChevronRight, X, Download, Share2, Loader2, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { downloadWithWatermark, shareWithWatermark } from '@/lib/watermark'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Database } from '@/lib/types'

type Photo = Database['public']['Tables']['photos']['Row']

// ─── Lazy Image with IntersectionObserver + blur placeholder ───
function LazyImage({
  src,
  alt,
  onClick,
  caption,
}: {
  src: string
  alt: string
  onClick: () => void
  caption?: string | null
}) {
  const imgRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const el = imgRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(el)
        }
      },
      {
        rootMargin: '200px 0px', // Start loading 200px before entering viewport
        threshold: 0,
      }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={imgRef}
      className="mb-2.5 break-inside-avoid cursor-pointer group"
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border border-black-border bg-black-card">
        {/* Shimmer placeholder — always present until loaded */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-500',
            isLoaded ? 'opacity-0' : 'opacity-100'
          )}
        >
          <div className="absolute inset-0 bg-white/[0.03]" />
          <div className="absolute inset-0 shimmer-effect" />
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-white/10" />
          </div>
        </div>

        {/* Actual image — only loads when visible */}
        {isVisible && !hasError && (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={cn(
              'absolute inset-0 w-full h-full object-cover transition-all duration-500',
              isLoaded
                ? 'opacity-100 scale-100 blur-0'
                : 'opacity-0 scale-105 blur-sm',
              'group-hover:scale-105'
            )}
          />
        )}

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black-card">
            <ImageIcon className="w-6 h-6 text-white/20" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Caption overlay */}
        {caption && isLoaded && (
          <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
            <p className="text-white text-[11px] line-clamp-1">{caption}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Batch loading: load N photos at a time as user scrolls ───
const BATCH_SIZE = 20


export default function GalleryPage() {
  const { event, venue, loading: authLoading } = useAuth()
  const [allPhotos, setAllPhotos] = useState<Photo[]>([])
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const touchStartX = useRef(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const [dropboxUrl, setDropboxUrl] = useState<string | null>(null)

  // Fetch photo metadata — scoped to venue+date (current event) or event_id (legacy)
  const eventDate = event?.date ?? null

  useEffect(() => {
    if (!venue?.id && !event?.id) return
    let cancelled = false
    const fetchPhotos = async () => {
      setLoading(true)
      try {
        let query = supabase.from('photos').select('*').order('created_at', { ascending: false })

        if (venue?.id) {
          query = query.eq('venue_id', venue.id)
          // Scope to the current event's date so photos from other events
          // at the same venue (e.g. Halloween, Christmas) don't leak through
          if (eventDate) {
            query = query.eq('photo_date', eventDate)
          }
        } else {
          query = query.eq('event_id', event!.id)
        }

        const { data, error } = await query
        if (cancelled) return
        if (!error && data && data.length > 0) {
          const dbxRecord = data.find(p => p.caption === '_dropbox_folder')
          if (dbxRecord) setDropboxUrl(dbxRecord.url)
          else setDropboxUrl(null)
          setAllPhotos(data.filter(p => p.caption !== '_dropbox_folder'))
        } else {
          setDropboxUrl(null)
          setAllPhotos([])
        }
      } catch (err) {
        console.error('Error fetching photos:', err)
        if (cancelled) return
        setAllPhotos([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPhotos()
    return () => { cancelled = true }
  }, [venue?.id, event?.id, eventDate])

  // Infinite scroll: load more photos when sentinel is visible
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || visibleCount >= allPhotos.length) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, allPhotos.length))
        }
      },
      { rootMargin: '400px 0px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [visibleCount, allPhotos.length])

  // Reset visible count when photos change
  useEffect(() => {
    setVisibleCount(BATCH_SIZE)
  }, [allPhotos.length])

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex((p) => (p === null ? null : p === 0 ? allPhotos.length - 1 : p - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex((p) => (p === null ? null : p === allPhotos.length - 1 ? 0 : p + 1))
      } else if (e.key === 'Escape') {
        setSelectedIndex(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, allPhotos.length])

  // Lock body scroll when lightbox open
  useEffect(() => {
    if (selectedIndex !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedIndex])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (selectedIndex === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setSelectedIndex((p) => (p === null ? null : p === allPhotos.length - 1 ? 0 : p + 1))
      } else {
        setSelectedIndex((p) => (p === null ? null : p === 0 ? allPhotos.length - 1 : p - 1))
      }
    }
  }, [selectedIndex, allPhotos.length])

  const eventName = event?.title || 'Project X'

  const handleDownload = async () => {
    if (!currentPhoto) return
    setDownloading(true)
    await downloadWithWatermark(currentPhoto.url, {
      eventName,
      brandHandle: '@tugraduacionmadrid',
    })
    setDownloading(false)
  }

  const handleShare = async () => {
    if (!currentPhoto) return
    setSharing(true)
    await shareWithWatermark(currentPhoto.url, {
      eventName,
      brandHandle: '@tugraduacionmadrid',
    })
    setSharing(false)
  }

  // ─── Loading skeleton ───
  if (authLoading || loading) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-24 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-7 w-20 bg-white/5 rounded-full animate-pulse" />
        </div>
        <div className="columns-2 gap-2.5">
          {[1, 0.7, 1.3, 0.9, 1.1, 0.8].map((ratio, i) => (
            <div key={i} className="mb-2.5 rounded-xl bg-white/5 animate-pulse" style={{ aspectRatio: ratio }} />
          ))}
        </div>
      </div>
    )
  }

  // ─── Empty state ───
  if (allPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <ImageIcon className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Sin fotos todavia</h2>
        <p className="text-white-muted text-sm">Las fotos del evento apareceran aqui</p>
      </div>
    )
  }

  const photos = allPhotos.slice(0, visibleCount)
  const hasMore = visibleCount < allPhotos.length
  const currentPhoto = selectedIndex !== null ? allPhotos[selectedIndex] : null

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gradient-primary">Galeria</h2>
        <span className="btn-gold text-xs font-medium px-3 py-1 rounded-full">
          {allPhotos.length} foto{allPhotos.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Masonry Grid with Lazy Images */}
      <div className="columns-2 gap-2.5 md:columns-3">
        {photos.map((photo, index) => (
          <LazyImage
            key={photo.id}
            src={photo.url}
            alt={photo.caption || 'Foto del evento'}
            caption={photo.caption}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      {/* Load more sentinel */}
      {hasMore && (
        <div ref={loadMoreRef} className="flex items-center justify-center py-6">
          <div className="flex items-center gap-2 text-white-muted text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Cargando mas fotos...</span>
          </div>
        </div>
      )}

      {/* Photo count at bottom */}
      {!hasMore && allPhotos.length > BATCH_SIZE && (
        <div className="text-center py-4">
          <span className="text-xs text-white-muted">
            {allPhotos.length} fotos cargadas
          </span>
        </div>
      )}

      {/* Dropbox CTA */}
      {dropboxUrl && (
        <div className="mt-4 mb-2">
          <a
            href={dropboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl border border-blue-500/20 bg-blue-500/[0.06] text-blue-400 text-sm font-semibold hover:bg-blue-500/10 transition-colors active:scale-[0.98]"
          >
            <ExternalLink className="w-4.5 h-4.5" />
            Ver todas las fotos en Dropbox
          </a>
        </div>
      )}

      {/* ─── Fullscreen Lightbox ─── */}
      {currentPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm"
          onClick={() => setSelectedIndex(null)}
          onTouchStart={(e) => (touchStartX.current = e.touches[0].clientX)}
          onTouchEnd={handleTouchEnd}
        >
          {/* Close */}
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedIndex(null) }}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Image */}
          <div
            className="relative w-full h-[75vh] max-w-4xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <NextImage
              src={currentPhoto.url}
              alt={currentPhoto.caption || 'Foto'}
              fill
              className="object-contain"
            />
          </div>

          {/* Nav Prev */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedIndex((p) => (p === null ? null : p === 0 ? allPhotos.length - 1 : p - 1))
            }}
            className="absolute left-3 w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/25 hover:scale-105 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Nav Next */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSelectedIndex((p) => (p === null ? null : p === allPhotos.length - 1 ? 0 : p + 1))
            }}
            className="absolute right-3 w-10 h-10 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/25 hover:scale-105 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Bottom bar */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <span className="text-xs font-medium text-primary bg-primary/15 border border-primary/30 px-3 py-1.5 rounded-full">
              {selectedIndex! + 1} / {allPhotos.length}
            </span>

            {currentPhoto.caption && (
              <p className="text-white text-sm text-center mx-4 max-w-[40%] hidden sm:block">{currentPhoto.caption}</p>
            )}

            {/* Download & Share */}
            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
              <button
                onClick={handleShare}
                disabled={sharing}
                className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors active:scale-95"
              >
                {sharing ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Share2 className="w-4.5 h-4.5" />}
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors active:scale-95"
              >
                {downloading ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Download className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
