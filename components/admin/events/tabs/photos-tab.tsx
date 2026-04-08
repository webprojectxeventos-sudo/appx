'use client'

import React, { useState, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/lib/auth-context'
import { Trash2, Plus, Image } from 'lucide-react'
import type { Database } from '@/lib/types'

type Photo = Database['public']['Tables']['photos']['Row']

interface PhotosTabProps {
  venueId: string
  date: string
}

export function PhotosTab({ venueId, date }: PhotosTabProps) {
  const { user } = useAuth()
  const { error: showError, success } = useToast()
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [urls, setUrls] = useState('')
  const [caption, setCaption] = useState('')

  const fetchPhotos = useCallback(async () => {
    if (!venueId || !date) { setPhotos([]); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('venue_id', venueId)
        .eq('photo_date', date)
        .order('created_at', { ascending: false })
      if (error) throw error
      setPhotos(data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }, [venueId, date])

  useEffect(() => { fetchPhotos() }, [fetchPhotos])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !urls.trim()) { showError('Introduce URLs'); return }
    try {
      const urlList = urls.split('\n').map(u => u.trim()).filter(u => u.length > 0)
      const photosToInsert = urlList.map(url => ({
        venue_id: venueId,
        photo_date: date,
        url,
        caption: caption || null,
        uploaded_by: user.id,
      }))
      const { error } = await supabase.from('photos').insert(photosToInsert)
      if (error) throw error
      setShowForm(false)
      setUrls('')
      setCaption('')
      success(`${urlList.length} fotos anadidas`)
      await fetchPhotos()
    } catch (err) {
      showError('Error al anadir fotos')
    }
  }

  const handleDelete = async (photoId: string) => {
    if (!confirm('Eliminar esta foto?')) return
    try {
      const { error } = await supabase.from('photos').delete().eq('id', photoId)
      if (error) throw error
      success('Foto eliminada')
      await fetchPhotos()
    } catch (err) {
      showError('Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium flex items-center gap-2">
          <Image className="w-4 h-4 text-primary" /> {photos.length} fotos
        </span>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-xs px-3 py-1.5">
          <Plus className="w-3 h-3" /> Anadir
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-primary/20 bg-white/[0.02] space-y-3">
          <textarea
            value={urls}
            onChange={e => setUrls(e.target.value)}
            placeholder="URLs de fotos (una por linea)"
            rows={4}
            className="w-full px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 font-mono text-sm focus:outline-none focus:border-primary/40 resize-none"
            required
          />
          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Descripcion (opcional)"
            className="w-full px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancelar</button>
            <button type="submit" className="btn-primary text-xs">Anadir Fotos</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-4 text-center text-white-muted text-sm">Cargando...</div>
      ) : photos.length === 0 ? (
        <div className="py-8 text-center">
          <Image className="w-8 h-8 mx-auto mb-2 text-black-border" />
          <p className="text-white-muted text-sm">Sin fotos para esta fecha</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto">
          {photos.map(photo => (
            <div key={photo.id} className="group relative rounded-xl overflow-hidden border border-black-border">
              <div className="relative aspect-square">
                <NextImage src={photo.url} alt={photo.caption || 'Foto'} fill className="object-cover" />
              </div>
              <button
                onClick={() => handleDelete(photo.id)}
                className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-red-900/80 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
