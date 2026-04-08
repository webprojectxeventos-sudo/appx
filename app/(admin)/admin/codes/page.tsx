'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Pagination } from '@/components/admin/pagination'
import {
  Copy,
  Download,
  Plus,
  Users,
  Ticket,
  Ban,
  CheckCircle2,
  Search,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type AccessCode = Database['public']['Tables']['access_codes']['Row']

export default function CodesPage() {
  const { user, isAdmin, initialized } = useAuth()
  const { selectedEventId } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [quantity, setQuantity] = useState(100)
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'available' | 'used' | 'inactive'>('all')
  const [copied, setCopied] = useState(false)
  const [codePage, setCodePage] = useState(1)

  useEffect(() => {
    if (selectedEventId) {
      fetchCodes()
    }
  }, [selectedEventId])

  const fetchCodes = useCallback(async () => {
    if (!selectedEventId) return
    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('event_id', selectedEventId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCodes(data || [])

      // Obtener nombres de los usuarios que han usado códigos
      const usedByIds = (data || [])
        .filter((c) => c.used_by)
        .map((c) => c.used_by as string)

      if (usedByIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', usedByIds)

        const names: Record<string, string> = {}
        usersData?.forEach((u) => {
          names[u.id] = u.full_name || u.email
        })
        setAttendeeNames(names)
      }
    } catch (err) {
      console.error('Error fetching codes:', err)
    }
  }, [selectedEventId])

  const handleGenerate = async () => {
    if (!selectedEventId || quantity < 1) return
    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('generate_access_codes', {
        target_event_id: selectedEventId!,
        quantity,
        code_label: label || undefined,
      })

      if (error) throw error
      success(`${data} códigos generados correctamente`)
      setLabel('')
      await fetchCodes()
    } catch (err) {
      console.error('Error generating codes:', err)
      showError('Error al generar códigos')
    } finally {
      setGenerating(false)
    }
  }

  const handleToggleActive = async (code: AccessCode) => {
    try {
      const { error } = await supabase
        .from('access_codes')
        .update({ is_active: !code.is_active })
        .eq('id', code.id)

      if (error) throw error
      await fetchCodes()
    } catch (err) {
      console.error('Error toggling code:', err)
    }
  }

  const handleDeleteUnused = async () => {
    if (!confirm('¿Eliminar TODOS los códigos NO USADOS de este evento?')) return
    try {
      const { error } = await supabase
        .from('access_codes')
        .delete()
        .eq('event_id', selectedEventId!)
        .is('used_by', null)

      if (error) throw error
      await fetchCodes()
    } catch (err) {
      console.error('Error deleting codes:', err)
    }
  }

  const formatCode = (code: string): string => {
    return code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code
  }

  const handleCopyAll = async () => {
    const available = filteredCodes.filter((c) => !c.used_by && c.is_active)
    const text = available.map((c) => formatCode(c.code)).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showError('Error al copiar')
    }
  }

  const handleExportCSV = () => {
    const headers = 'Código,Estado,Etiqueta,Usado por,Fecha uso\n'
    const rows = codes.map((c) => {
      const status = c.used_by ? 'Usado' : c.is_active ? 'Disponible' : 'Desactivado'
      const usedBy = c.used_by ? (attendeeNames[c.used_by] || c.used_by) : ''
      const usedAt = c.used_at ? new Date(c.used_at).toLocaleDateString('es-ES') : ''
      return `${formatCode(c.code)},${status},${c.label || ''},${usedBy},${usedAt}`
    })
    const csv = headers + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `codigos-${selectedEventId!.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Estadísticas
  const stats = {
    total: codes.length,
    available: codes.filter((c) => !c.used_by && c.is_active).length,
    used: codes.filter((c) => c.used_by).length,
    inactive: codes.filter((c) => !c.is_active && !c.used_by).length,
  }

  // Filtrar códigos
  const filteredCodes = codes.filter((c) => {
    const matchesSearch =
      search === '' ||
      c.code.toLowerCase().includes(search.toLowerCase().replace('-', '')) ||
      (c.label && c.label.toLowerCase().includes(search.toLowerCase())) ||
      (c.used_by && attendeeNames[c.used_by]?.toLowerCase().includes(search.toLowerCase()))

    const matchesFilter =
      filter === 'all' ||
      (filter === 'available' && !c.used_by && c.is_active) ||
      (filter === 'used' && c.used_by) ||
      (filter === 'inactive' && !c.is_active)

    return matchesSearch && matchesFilter
  })

  const CODES_PER_PAGE = 50
  const totalCodePages = Math.ceil(filteredCodes.length / CODES_PER_PAGE)
  const paginatedCodes = filteredCodes.slice((codePage - 1) * CODES_PER_PAGE, codePage * CODES_PER_PAGE)

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null


  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-gradient-primary">
          Códigos de Acceso
        </h1>
        <p className="text-sm mt-1 text-white-muted">
          Cada código es único y solo se puede usar una vez
        </p>
      </div>

      {/* Show message if no event selected */}
      {!selectedEventId && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior.</p>
        </div>
      )}

      {/* Stats Cards */}
      {selectedEventId && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
          {[
            { label: 'Total', value: stats.total, icon: Ticket, colorClass: 'text-primary' },
            { label: 'Disponibles', value: stats.available, icon: CheckCircle2, colorClass: 'text-green-400' },
            { label: 'Usados', value: stats.used, icon: Users, colorClass: 'text-blue-400' },
            { label: 'Desactivados', value: stats.inactive, icon: Ban, colorClass: 'text-red-400' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="card p-4 text-center"
            >
              <stat.icon className={cn('w-5 h-5 mx-auto mb-2', stat.colorClass)} />
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <div className="text-xs text-white-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Section */}
      {selectedEventId && (
        <div className="card-accent p-6 space-y-4 animate-slide-up">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" />
            Generar Códigos
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs mb-1 text-white-muted">
                Cantidad
              </label>
              <input
                type="number"
                min={1}
                max={5000}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-1 text-white-muted">
                Etiqueta (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Instituto San José"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                {generating ? 'Generando...' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions & Search */}
      {selectedEventId && codes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted"
            />
            <input
              type="text"
              placeholder="Buscar código, etiqueta o asistente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="px-4 py-3 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40 transition-colors"
          >
            <option value="all">Todos ({stats.total})</option>
            <option value="available">Disponibles ({stats.available})</option>
            <option value="used">Usados ({stats.used})</option>
            <option value="inactive">Desactivados ({stats.inactive})</option>
          </select>

          {/* Bulk Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleCopyAll}
              className={cn(
                'btn-ghost text-sm',
                copied && 'bg-primary/10 border-primary/40 text-primary'
              )}
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copiados!' : 'Copiar'}
            </button>
            <button
              onClick={handleExportCSV}
              className="btn-ghost text-sm text-primary"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button
              onClick={handleDeleteUnused}
              className="btn-ghost text-sm text-red-400"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Codes List */}
      {selectedEventId && (
        <div className="space-y-2">
          {paginatedCodes.length === 0 ? (
            <div className="card p-8 text-center">
              <Ticket className="w-12 h-12 mx-auto mb-4 text-black-border" />
              <p className="text-white-muted">
                {codes.length === 0
                  ? 'No hay códigos. Genera algunos arriba.'
                  : 'No hay códigos que coincidan con tu búsqueda.'}
              </p>
            </div>
          ) : (
            paginatedCodes.map((code) => {
              const isUsed = !!code.used_by
              const isInactive = !code.is_active

              return (
                <div
                  key={code.id}
                  className={cn(
                    'card p-4 flex items-center gap-4 transition-all',
                    isUsed && 'border-blue-400/20',
                    isInactive && 'border-red-400/20 opacity-60'
                  )}
                >
                  {/* Código */}
                  <div
                    className={cn(
                      'font-mono text-lg font-bold tracking-wider flex-shrink-0',
                      isUsed ? 'text-blue-400' : isInactive ? 'text-red-400' : 'text-primary'
                    )}
                  >
                    {formatCode(code.code)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    {isUsed && code.used_by ? (
                      <div>
                        <p className="text-white text-sm font-medium truncate">
                          {attendeeNames[code.used_by] || 'Usuario'}
                        </p>
                        <p className="text-xs text-white-muted">
                          Usado el{' '}
                          {code.used_at
                            ? new Date(code.used_at).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-white-muted">
                        {code.label || 'Disponible'}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <div
                    className={cn(
                      'text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium',
                      isUsed && 'bg-blue-400/10 text-blue-400',
                      isInactive && 'bg-red-400/10 text-red-400',
                      !isUsed && !isInactive && 'bg-green-400/10 text-green-400'
                    )}
                  >
                    {isUsed ? 'Usado' : isInactive ? 'Desactivado' : 'Disponible'}
                  </div>

                  {/* Actions */}
                  {!isUsed && (
                    <button
                      onClick={() => handleToggleActive(code)}
                      className="p-2 rounded-lg transition flex-shrink-0 bg-black-border hover:bg-black-hover"
                      title={code.is_active ? 'Desactivar' : 'Activar'}
                    >
                      {code.is_active ? (
                        <Ban className="w-4 h-4 text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      )}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {selectedEventId && filteredCodes.length > CODES_PER_PAGE && (
        <Pagination currentPage={codePage} totalPages={totalCodePages} onPageChange={setCodePage} />
      )}
    </div>
  )
}
