'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, Plus, Clock, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { SearchInput } from '@/components/admin/search-input'
import { Pagination } from '@/components/admin/pagination'
import type { Database } from '@/lib/types'

type Incident = Database['public']['Tables']['incidents']['Row']

interface IncidentWithEvent extends Incident {
  eventTitle: string
  groupName: string | null
  reporterName: string | null
}

const TYPE_CONFIG = {
  medical: { label: 'Medico', color: 'text-red-400', bg: 'bg-red-500/10' },
  security: { label: 'Seguridad', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  logistics: { label: 'Logistica', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  other: { label: 'Otro', color: 'text-gray-400', bg: 'bg-gray-500/10' },
}

const PRIORITY_CONFIG = {
  low: { label: 'Baja', color: 'text-gray-400', bg: 'bg-gray-500/10' },
  medium: { label: 'Media', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  high: { label: 'Alta', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  critical: { label: 'Critica', color: 'text-red-400', bg: 'bg-red-500/10' },
}

const STATUS_CONFIG = {
  open: { label: 'Abierta', color: 'text-red-400', bg: 'bg-red-500/10' },
  in_progress: { label: 'En proceso', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  resolved: { label: 'Resuelta', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  dismissed: { label: 'Descartada', color: 'text-gray-400', bg: 'bg-gray-500/10' },
}

export default function IncidentsPage() {
  const { user, organization, isSuperAdmin, isAdmin, isGroupAdmin, initialized } = useAuth()
  const { allEvents: events } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [incidents, setIncidents] = useState<IncidentWithEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('active')
  const [filterEvent, setFilterEvent] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    event_id: '', type: 'other' as Incident['type'], description: '', priority: 'medium' as Incident['priority'],
  })
  const [creating, setCreating] = useState(false)

  const fetchData = useCallback(async () => {
    if (!organization?.id) return

    const eventIds = events.map(e => e.id)
    if (eventIds.length === 0) { setIncidents([]); setLoading(false); return }

    const { data: incData } = await supabase
      .from('incidents')
      .select('*')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false })

    if (incData) {
      const reporterIds = [...new Set(incData.map(i => i.reported_by))]
      const { data: reporters } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', reporterIds)

      const reporterMap: Record<string, string> = {}
      reporters?.forEach(r => { reporterMap[r.id] = r.full_name || 'Desconocido' })

      const eventsMap: Record<string, { title: string; group_name: string | null }> = {}
      events.forEach(e => { eventsMap[e.id] = { title: e.title, group_name: e.group_name } })

      const enriched: IncidentWithEvent[] = incData.map(inc => ({
        ...inc,
        eventTitle: eventsMap[inc.event_id]?.title || '',
        groupName: eventsMap[inc.event_id]?.group_name || null,
        reporterName: reporterMap[inc.reported_by] || null,
      }))
      setIncidents(enriched)
    }
    setLoading(false)
  }, [organization?.id, events])

  useEffect(() => {
    if (!organization?.id) return
    fetchData()
  }, [organization?.id, fetchData])

  // Realtime subscription
  useEffect(() => {
    if (!organization?.id) return
    const sub = supabase
      .channel(`incidents-realtime-${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents', filter: `organization_id=eq.${organization.id}` }, () => {
        fetchData()
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [organization?.id, fetchData])

  const handleCreate = async () => {
    if (!form.event_id || !form.description || !user || !organization?.id) return
    setCreating(true)
    const { error } = await supabase.from('incidents').insert({
      event_id: form.event_id,
      organization_id: organization.id,
      reported_by: user.id,
      type: form.type,
      description: form.description,
      priority: form.priority,
    })
    if (error) { showError(error.message) }
    else {
      success('Incidencia creada correctamente')
      setShowCreate(false)
      setForm({ event_id: '', type: 'other', description: '', priority: 'medium' })
    }
    setCreating(false)
  }

  const updateStatus = async (incidentId: string, status: Incident['status']) => {
    const updates: Record<string, unknown> = { status }
    if (status === 'resolved' && user) {
      updates.resolved_by = user.id
      updates.resolved_at = new Date().toISOString()
    }
    await supabase.from('incidents').update(updates).eq('id', incidentId)
  }

  // Filtering
  const filtered = incidents.filter(inc => {
    if (filterStatus === 'active' && (inc.status === 'resolved' || inc.status === 'dismissed')) return false
    if (filterStatus !== 'active' && filterStatus !== 'all' && inc.status !== filterStatus) return false
    if (filterEvent !== 'all' && inc.event_id !== filterEvent) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!inc.description.toLowerCase().includes(q) && !(inc.reporterName || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const INCIDENTS_PER_PAGE = 15
  const totalIncPages = Math.ceil(filtered.length / INCIDENTS_PER_PAGE)
  const paginatedIncidents = filtered.slice((page - 1) * INCIDENTS_PER_PAGE, page * INCIDENTS_PER_PAGE)

  const openCount = incidents.filter(i => i.status === 'open').length
  const inProgressCount = incidents.filter(i => i.status === 'in_progress').length

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin && !isGroupAdmin) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        {[0, 1, 2].map(i => <div key={i} className="card h-24 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Incidencias</h1>
          <p className="text-sm text-white-muted mt-0.5">
            {openCount > 0 && <span className="text-red-400 font-medium">{openCount} abiertas</span>}
            {openCount > 0 && inProgressCount > 0 && ' · '}
            {inProgressCount > 0 && <span className="text-yellow-400 font-medium">{inProgressCount} en proceso</span>}
            {openCount === 0 && inProgressCount === 0 && 'Sin incidencias activas'}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Reportar
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5 space-y-4 border-primary/20">
          <h3 className="font-semibold text-white">Nueva incidencia</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white-muted mb-1">Grupo / Evento *</label>
              <select value={form.event_id} onChange={e => setForm({ ...form, event_id: e.target.value })} className={inputClass}>
                <option value="">Seleccionar...</option>
                {events.map(ev => <option key={ev.id} value={ev.id}>{ev.group_name || ev.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white-muted mb-1">Tipo</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as Incident['type'] })} className={inputClass}>
                <option value="medical">Medico</option>
                <option value="security">Seguridad</option>
                <option value="logistics">Logistica</option>
                <option value="other">Otro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-white-muted mb-1">Prioridad</label>
            <div className="grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'critical'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setForm({ ...form, priority: p })}
                  className={cn(
                    'px-3 py-2 rounded-xl text-xs font-medium border transition-all text-center',
                    form.priority === p
                      ? `${PRIORITY_CONFIG[p].bg} ${PRIORITY_CONFIG[p].color} border-current`
                      : 'border-black-border text-white-muted hover:border-white/15'
                  )}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-white-muted mb-1">Descripcion *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe la incidencia..." rows={3} className={cn(inputClass, 'resize-none')} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">Cancelar</button>
            <button onClick={handleCreate} disabled={creating} className="btn-primary text-sm">
              {creating ? 'Creando...' : 'Crear incidencia'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Buscar incidencias..." />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'active', label: 'Activas' },
          { value: 'all', label: 'Todas' },
          { value: 'resolved', label: 'Resueltas' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilterStatus(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filterStatus === f.value
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-black-border text-white-muted hover:border-white/15'
            )}
          >
            {f.label}
          </button>
        ))}
        <select
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-black-border bg-transparent text-white-muted focus:outline-none"
        >
          <option value="all">Todos los grupos</option>
          {events.map(ev => <option key={ev.id} value={ev.id}>{ev.group_name || ev.title}</option>)}
        </select>
      </div>

      {/* Incidents List */}
      <div className="space-y-2">
        {paginatedIncidents.map(inc => {
          const typeConf = TYPE_CONFIG[inc.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.other
          const prioConf = PRIORITY_CONFIG[inc.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.medium
          const statusConf = STATUS_CONFIG[inc.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open

          return (
            <div key={inc.id} className={cn('card p-4 space-y-3', inc.priority === 'critical' && inc.status === 'open' && 'border-red-500/30 bg-red-500/5')}>
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', typeConf.bg)}>
                  <AlertTriangle className={cn('w-5 h-5', typeConf.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', typeConf.bg, typeConf.color)}>{typeConf.label}</span>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', prioConf.bg, prioConf.color)}>{prioConf.label}</span>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', statusConf.bg, statusConf.color)}>{statusConf.label}</span>
                  </div>
                  <p className="text-sm text-white">{inc.description}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white-muted">
                    <span>{inc.groupName || inc.eventTitle}</span>
                    {inc.reporterName && <span>por {inc.reporterName}</span>}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(inc.created_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {(inc.status === 'open' || inc.status === 'in_progress') && (
                <div className="flex gap-2 pl-13">
                  {inc.status === 'open' && (
                    <button onClick={() => updateStatus(inc.id, 'in_progress')} className="text-[11px] font-medium text-yellow-400 bg-yellow-500/10 px-3 py-1.5 rounded-lg hover:bg-yellow-500/15 transition-colors">
                      En proceso
                    </button>
                  )}
                  <button onClick={() => updateStatus(inc.id, 'resolved')} className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg hover:bg-emerald-500/15 transition-colors flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Resolver
                  </button>
                  {!isGroupAdmin && (
                    <button onClick={() => updateStatus(inc.id, 'dismissed')} className="text-[11px] font-medium text-gray-400 bg-gray-500/10 px-3 py-1.5 rounded-lg hover:bg-gray-500/15 transition-colors flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Descartar
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {paginatedIncidents.length === 0 && (
          <div className="card p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-white-muted mx-auto mb-2" />
            <p className="text-white-muted text-sm">
              {filterStatus === 'active' ? 'No hay incidencias activas' : 'No hay incidencias'}
            </p>
          </div>
        )}
      </div>

      <Pagination currentPage={page} totalPages={totalIncPages} onPageChange={setPage} />
    </div>
  )
}
