'use client'

import React, { useState, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { Trash2, Plus, Image } from 'lucide-react'
import type { Database } from '@/lib/types'

type Photo = Database['public']['Tables']['photos']['Row']

export default function PhotosPage() {
  const { user, isAdmin, initialized } = useAuth()
  const { selectedVenueId, selectedDate, venues } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const [formData, setFormData] = useState({
    urls: '',
    caption: '',
  })

  const selectedVenue = venues.find(v => v.id === selectedVenueId)

  const fetchPhotos = useCallback(async () => {
    if (!selectedVenueId || !selectedDate) {
      setPhotos([])
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('venue_id', selectedVenueId)
        .eq('photo_date', selectedDate)
        .order('created_at', { ascending: false })

      if (error) throw error
      setPhotos(data || [])
    } catch (err) {
      console.error('Error fetching photos:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVenueId, selectedDate])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user || !selectedVenueId || !selectedDate || !formData.urls.trim()) {
      showError('Selecciona una fecha y venue primero')
      return
    }

    try {
      const urlList = formData.urls
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url.length > 0)

      const photosToInsert = urlList.map((url) => ({
        venue_id: selectedVenueId,
        photo_date: selectedDate,
        url,
        caption: formData.caption || null,
        uploaded_by: user.id,
      }))

      const { error } = await supabase.from('photos').insert(photosToInsert)

      if (error) throw error

      setShowForm(false)
      setFormData({ urls: '', caption: '' })
      success(`${urlList.length} fotos añadidas`)
      await fetchPhotos()
    } catch (err) {
      console.error('Error adding photos:', err)
      showError('Error al añadir fotos')
    }
  }

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta foto?')) return

    try {
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId)

      if (error) throw error
      success('Foto eliminada')
      await fetchPhotos()
    } catch (err) {
      console.error('Error deleting photo:', err)
      showError('Error al eliminar la foto')
    }
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gradient-primary">Fotos</h1>
          <p className="text-sm mt-1 text-white-muted">
            {selectedVenue ? `${selectedVenue.name} — ${selectedDate}` : 'Selecciona fecha y venue arriba'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={!selectedVenueId || !selectedDate}
          className="btn-primary"
        >
          <Plus className="w-5 h-5" />
          Añadir Fotos
        </button>
      </div>

      {!selectedVenueId || !selectedDate ? (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona una fecha y un venue en la barra superior para gestionar fotos.</p>
        </div>
      ) : (
        <>
          {/* Add Photos Form */}
          {showForm && (
            <div className="card-accent p-6 animate-slide-up">
              <h2 className="text-xl font-bold mb-6 text-primary">Añadir Fotos a {selectedVenue?.name}</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-white">URLs de Fotos (una por línea) *</label>
                  <textarea
                    value={formData.urls}
                    onChange={(e) => setFormData({ ...formData, urls: e.target.value })}
                    placeholder="https://dropbox.com/photo1.jpg&#10;https://dropbox.com/photo2.jpg"
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 font-mono text-sm focus:outline-none focus:border-primary/40 transition-colors resize-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2 text-white">Descripción (opcional)</label>
                  <input
                    type="text"
                    value={formData.caption}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    placeholder="Descripción de las fotos"
                    className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn-ghost"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Añadir Fotos
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Photos Grid */}
          {loading ? (
            <div className="text-center py-8 text-white-muted">Cargando...</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Image className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-white">Fotos ({photos.length})</h2>
              </div>

              {photos.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-white-muted">No hay fotos para este venue en esta fecha. Comienza añadiendo algunas.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative rounded-xl overflow-hidden border border-black-border bg-black-card transition-all hover:border-primary/20"
                    >
                      <div className="relative aspect-square overflow-hidden">
                        <NextImage
                          src={photo.url}
                          alt={photo.caption || 'Foto'}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>

                      {photo.caption && (
                        <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                          <p className="text-white text-sm text-center">{photo.caption}</p>
                        </div>
                      )}

                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-2 right-2 p-2 rounded-full bg-red-900/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-800"
                      >
                        <Trash2 className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
