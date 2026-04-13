'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Search, Plus, X, MapPin, Clock, MessageCircle, Trash2, PackageSearch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LostItem {
  id: string
  description: string
  location_hint: string | null
  contact_info: string | null
  status: 'lost' | 'found'
  created_at: string
  user_id: string
  user_name: string
  event_id: string
}

export default function LostFoundPage() {
  const { user, event, profile } = useAuth()
  const [items, setItems] = useState<LostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all')
  const [description, setDescription] = useState('')
  const [locationHint, setLocationHint] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [adding, setAdding] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!event?.id) return
    const { data } = await supabase
      .from('lost_found')
      .select('id, description, location_hint, contact_info, status, created_at, user_id, event_id')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    const userIds = [...new Set(data.map(d => d.user_id))]
    const nameMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds)
      users?.forEach(u => { nameMap[u.id] = u.full_name || 'Anonimo' })
    }

    setItems(data.map(d => ({ ...d, user_name: nameMap[d.user_id] || 'Anonimo' })))
    setLoading(false)
  }, [event?.id])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Realtime
  useEffect(() => {
    if (!event?.id) return
    const channel = supabase
      .channel(`lost-found-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lost_found', filter: `event_id=eq.${event.id}` }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, fetchItems])

  const handleAdd = async () => {
    if (!description.trim() || !user?.id || !event?.id) return
    setAdding(true)
    await supabase.from('lost_found').insert({
      event_id: event.id,
      user_id: user.id,
      description: description.trim(),
      location_hint: locationHint.trim() || null,
      contact_info: contactInfo.trim() || null,
      status: 'lost',
    })
    setDescription('')
    setLocationHint('')
    setContactInfo('')
    setShowAdd(false)
    setAdding(false)
    fetchItems()
  }

  const toggleStatus = async (id: string, current: string) => {
    await supabase.from('lost_found').update({ status: current === 'lost' ? 'found' : 'lost' }).eq('id', id)
    fetchItems()
  }

  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await supabase.from('lost_found').delete().eq('id', id)
  }

  const timeAgo = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'Ahora'
    if (mins < 60) return `${mins}min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  const filtered = items.filter(i => filter === 'all' || i.status === filter)

  if (loading) {
    return (
      <div className="space-y-3 animate-fade-in">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-4 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="space-y-2">
              <div className="h-4 bg-white/5 rounded-full w-3/4" />
              <div className="h-3 bg-white/5 rounded-full w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border border-orange-500/20 flex items-center justify-center">
            <PackageSearch className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Objetos perdidos</h1>
            <p className="text-[11px] text-white-muted">
              {items.filter(i => i.status === 'lost').length} perdidos &middot; {items.filter(i => i.status === 'found').length} encontrados
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95',
            showAdd
              ? 'bg-white/5 text-white-muted border border-white/10'
              : 'btn-primary shadow-[0_0_16px_rgba(228,30,43,0.25)]'
          )}
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cerrar' : 'Reportar'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card-glow p-5 space-y-3.5 animate-scale-in">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-white">¿Que has perdido?</p>
          </div>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe el objeto (ej: chaqueta negra, iPhone...)"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
          />
          <input
            type="text"
            value={locationHint}
            onChange={e => setLocationHint(e.target.value)}
            placeholder="¿Donde crees que lo perdiste? (opcional)"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
          />
          <input
            type="text"
            value={contactInfo}
            onChange={e => setContactInfo(e.target.value)}
            placeholder="Tu Instagram o telefono para contactar (opcional)"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white-muted/50 text-sm focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={!description.trim() || adding}
            className="btn-primary w-full py-3 text-sm font-semibold shadow-[0_0_20px_rgba(228,30,43,0.2)] disabled:shadow-none"
          >
            {adding ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Publicando...
              </span>
            ) : (
              'Publicar objeto perdido'
            )}
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex gap-2">
        {(['all', 'lost', 'found'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-medium transition-all',
              filter === f
                ? f === 'lost' ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                  : f === 'found' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                  : 'bg-white/10 text-white border border-white/20'
                : 'bg-white/[0.04] text-white-muted border border-white/[0.06] hover:text-white'
            )}
          >
            {f === 'all' ? `Todos (${items.length})` : f === 'lost' ? `Perdidos (${items.filter(i => i.status === 'lost').length})` : `Encontrados (${items.filter(i => i.status === 'found').length})`}
          </button>
        ))}
      </div>

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="card-glow p-8 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/15 to-orange-500/5 border border-orange-500/15 flex items-center justify-center mx-auto mb-4">
            <PackageSearch className="w-8 h-8 text-orange-400/60" />
          </div>
          <h3 className="text-base font-bold text-white mb-1.5">
            {filter === 'found' ? 'Nada encontrado aun' : 'No hay objetos perdidos'}
          </h3>
          <p className="text-sm text-white-muted max-w-[240px] mx-auto">
            {filter === 'all' ? 'Si pierdes algo durante la fiesta, reportalo aqui' : filter === 'lost' ? 'Buena señal — nadie ha perdido nada' : 'Todavia no se ha encontrado nada'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={cn(
                'card p-4 animate-slide-up transition-all',
                item.status === 'found' && 'opacity-60'
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                {/* Status indicator */}
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5',
                  item.status === 'lost'
                    ? 'bg-red-500/15 border border-red-500/20'
                    : 'bg-emerald-500/15 border border-emerald-500/20'
                )}>
                  {item.status === 'lost'
                    ? <Search className="w-4.5 h-4.5 text-red-400" />
                    : <span className="text-lg">✅</span>
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                      item.status === 'lost' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                    )}>
                      {item.status === 'lost' ? 'Perdido' : 'Encontrado'}
                    </span>
                    <span className="text-[10px] text-white-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(item.created_at)}
                    </span>
                  </div>

                  <p className={cn('text-sm font-medium mb-1', item.status === 'found' ? 'text-white-muted line-through' : 'text-white')}>
                    {item.description}
                  </p>

                  {item.location_hint && (
                    <p className="text-[11px] text-white-muted flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" />
                      {item.location_hint}
                    </p>
                  )}

                  {item.contact_info && (
                    <p className="text-[11px] text-white-muted flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {item.contact_info}
                    </p>
                  )}

                  <p className="text-[10px] text-white-muted mt-1.5">{item.user_name}</p>
                </div>

                {/* Actions */}
                {(item.user_id === user?.id || profile?.role === 'admin') && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => toggleStatus(item.id, item.status)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all active:scale-95',
                        item.status === 'lost'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 text-white-muted border border-white/10'
                      )}
                    >
                      {item.status === 'lost' ? 'Encontrado' : 'Perdido'}
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1.5 text-white-muted/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
