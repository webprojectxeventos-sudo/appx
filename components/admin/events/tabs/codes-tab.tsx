'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Pagination } from '@/components/admin/pagination'
import { Copy, Download, FileText, Plus, Users, Ticket, Ban, CheckCircle2, Search, Trash2, CheckSquare, Square, MinusSquare, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type AccessCode = Database['public']['Tables']['access_codes']['Row']

interface CodesTabProps {
  eventId: string
  eventName: string
  eventDate: string
}

export function CodesTab({ eventId, eventName, eventDate }: CodesTabProps) {
  const { error: showError, success } = useToast()
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [attendeeNames, setAttendeeNames] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [quantity, setQuantity] = useState(100)
  const [label, setLabel] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'available' | 'used' | 'inactive'>('all')
  const [copied, setCopied] = useState(false)
  const [codePage, setCodePage] = useState(1)
  const [exportingPdf, setExportingPdf] = useState(false)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  const fetchCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('access_codes')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCodes(data || [])

      const usedByIds = (data || []).filter(c => c.used_by).map(c => c.used_by as string)
      if (usedByIds.length > 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, email')
          .in('id', usedByIds)

        const names: Record<string, string> = {}
        usersData?.forEach(u => { names[u.id] = u.full_name || u.email })
        setAttendeeNames(names)
      }
    } catch (err) {
      console.error('Error fetching codes:', err)
    }
  }, [eventId])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  // Reset selection when filter/search changes
  useEffect(() => {
    setSelected(new Set())
  }, [filter, search])

  const handleGenerate = async () => {
    if (quantity < 1) return
    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('generate_access_codes', {
        target_event_id: eventId,
        quantity,
        code_label: label || undefined,
      })
      if (error) throw error
      success(`${data} codigos generados`)
      setLabel('')
      await fetchCodes()
    } catch (err) {
      console.error('Error generating codes:', err)
      showError('Error al generar codigos')
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
    if (!confirm('Eliminar TODOS los codigos NO USADOS?')) return
    try {
      const { error } = await supabase
        .from('access_codes')
        .delete()
        .eq('event_id', eventId)
        .is('used_by', null)
      if (error) throw error
      await fetchCodes()
      setSelected(new Set())
    } catch (err) {
      console.error('Error deleting codes:', err)
    }
  }

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return
    // Only allow deleting unused codes
    const deletable = [...selected].filter(id => {
      const code = codes.find(c => c.id === id)
      return code && !code.used_by
    })
    if (deletable.length === 0) {
      showError('Solo se pueden eliminar codigos no usados')
      return
    }
    const usedCount = selected.size - deletable.length
    const msg = usedCount > 0
      ? `Eliminar ${deletable.length} codigos? (${usedCount} usados se omitiran)`
      : `Eliminar ${deletable.length} codigos seleccionados?`
    if (!confirm(msg)) return
    try {
      const { error } = await supabase
        .from('access_codes')
        .delete()
        .in('id', deletable)
      if (error) throw error
      success(`${deletable.length} codigos eliminados`)
      setSelected(new Set())
      setSelectMode(false)
      await fetchCodes()
    } catch (err) {
      console.error('Error deleting selected:', err)
      showError('Error al eliminar codigos')
    }
  }

  const formatCode = (code: string): string => {
    return code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code
  }

  const handleCopyAll = async () => {
    const available = filteredCodes.filter(c => !c.used_by && c.is_active)
    const text = available.map(c => formatCode(c.code)).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showError('Error al copiar')
    }
  }

  const handleExportCSV = () => {
    const headers = 'Codigo,Estado,Etiqueta,Usado por,Fecha uso\n'
    const rows = codes.map(c => {
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
    a.download = `codigos-${eventId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // PDF export: printable control sheet with the AVAILABLE (unused + active)
  // codes only — matches the "Copiar" button's semantics. A sheet full of
  // already-redeemed codes would be useless for handing out in person.
  // jspdf is lazy-imported so it only hits the bundle when the user actually
  // clicks "PDF" — it's ~350KB gzipped.
  const handleExportPDF = async () => {
    const available = codes.filter(c => !c.used_by && c.is_active)
    if (available.length === 0) {
      showError('No hay codigos disponibles para exportar')
      return
    }
    setExportingPdf(true)
    try {
      const { generateCodesPdf } = await import('@/lib/generate-codes-pdf')
      await generateCodesPdf(
        eventName,
        eventDate,
        available.map(c => c.code),
        '/logo.png',
      )
    } catch (err) {
      console.error('Error generating PDF:', err)
      showError('Error al generar el PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  // Toggle single code selection
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Select/deselect all visible (paginated) codes
  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedCodes.map(c => c.id)
    const allSelected = visibleIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const stats = {
    total: codes.length,
    available: codes.filter(c => !c.used_by && c.is_active).length,
    used: codes.filter(c => c.used_by).length,
    inactive: codes.filter(c => !c.is_active && !c.used_by).length,
  }

  const filteredCodes = useMemo(() => codes.filter(c => {
    const matchesSearch = search === '' ||
      c.code.toLowerCase().includes(search.toLowerCase().replace('-', '')) ||
      (c.label && c.label.toLowerCase().includes(search.toLowerCase())) ||
      (c.used_by && attendeeNames[c.used_by]?.toLowerCase().includes(search.toLowerCase()))

    const matchesFilter = filter === 'all' ||
      (filter === 'available' && !c.used_by && c.is_active) ||
      (filter === 'used' && c.used_by) ||
      (filter === 'inactive' && !c.is_active)

    return matchesSearch && matchesFilter
  }), [codes, search, filter, attendeeNames])

  const CODES_PER_PAGE = 50
  const totalCodePages = Math.ceil(filteredCodes.length / CODES_PER_PAGE)
  const paginatedCodes = filteredCodes.slice((codePage - 1) * CODES_PER_PAGE, codePage * CODES_PER_PAGE)

  // Check if all visible are selected
  const allVisibleSelected = paginatedCodes.length > 0 && paginatedCodes.every(c => selected.has(c.id))
  const someVisibleSelected = paginatedCodes.some(c => selected.has(c.id))

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-primary' },
          { label: 'Libres', value: stats.available, color: 'text-green-400' },
          { label: 'Usados', value: stats.used, color: 'text-blue-400' },
          { label: 'Off', value: stats.inactive, color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="text-center py-2 rounded-xl bg-white/[0.03] border border-black-border">
            <div className={cn('text-lg font-bold', s.color)}>{s.value}</div>
            <div className="text-[10px] text-white-muted">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Generate */}
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={5000}
          value={quantity}
          onChange={e => setQuantity(Number(e.target.value))}
          className="w-20 px-3 py-2 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40"
        />
        <input
          type="text"
          placeholder="Etiqueta..."
          value={label}
          onChange={e => setLabel(e.target.value)}
          className="flex-1 px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
        />
        <button onClick={handleGenerate} disabled={generating} className="btn-primary text-sm px-3">
          <Plus className="w-3.5 h-3.5" />
          {generating ? '...' : 'Generar'}
        </button>
      </div>

      {/* Search + Filter + Actions */}
      {codes.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white-muted" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
              />
            </div>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as typeof filter)}
              className="px-3 py-2 rounded-xl border border-black-border bg-transparent text-white text-sm focus:outline-none focus:border-primary/40"
            >
              <option value="all">Todos</option>
              <option value="available">Libres</option>
              <option value="used">Usados</option>
              <option value="inactive">Off</option>
            </select>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={handleCopyAll} className={cn('btn-ghost text-xs', copied && 'text-primary')}>
              <Copy className="w-3 h-3" /> {copied ? 'Copiados!' : 'Copiar'}
            </button>
            <button onClick={handleExportCSV} className="btn-ghost text-xs text-primary">
              <Download className="w-3 h-3" /> CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exportingPdf}
              className="btn-ghost text-xs text-primary disabled:opacity-50"
              title="Descargar hoja de control (A4) con codigos disponibles"
            >
              {exportingPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              {exportingPdf ? 'Generando...' : 'PDF'}
            </button>
            <button
              onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelected(new Set()) }}
              className={cn('btn-ghost text-xs', selectMode && 'text-primary bg-primary/10')}
            >
              <CheckSquare className="w-3 h-3" /> {selectMode ? 'Cancelar' : 'Seleccionar'}
            </button>
            {!selectMode && (
              <button onClick={handleDeleteUnused} className="btn-ghost text-xs text-red-400">
                <Trash2 className="w-3 h-3" /> Borrar libres
              </button>
            )}
          </div>

          {/* Bulk selection bar */}
          {selectMode && (
            <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-primary/5 border border-primary/20">
              <button onClick={toggleSelectAllVisible} className="p-0.5 text-primary">
                {allVisibleSelected ? <CheckSquare className="w-4 h-4" /> : someVisibleSelected ? <MinusSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
              <span className="text-xs text-white flex-1">
                {selected.size > 0 ? <><span className="text-primary font-bold">{selected.size}</span> seleccionados</> : 'Selecciona codigos'}
              </span>
              {selected.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Eliminar ({selected.size})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Codes List */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {paginatedCodes.length === 0 ? (
          <div className="py-8 text-center">
            <Ticket className="w-8 h-8 mx-auto mb-2 text-black-border" />
            <p className="text-white-muted text-sm">
              {codes.length === 0 ? 'Sin codigos. Genera algunos arriba.' : 'Sin resultados.'}
            </p>
          </div>
        ) : (
          paginatedCodes.map(code => {
            const isUsed = !!code.used_by
            const isInactive = !code.is_active
            const isSelected = selected.has(code.id)
            return (
              <div
                key={code.id}
                onClick={selectMode ? () => toggleSelect(code.id) : undefined}
                className={cn(
                  'flex items-center gap-3 py-2 px-3 rounded-lg',
                  isUsed && 'bg-blue-500/[0.03]',
                  isInactive && 'opacity-50',
                  selectMode && 'cursor-pointer',
                  isSelected && 'bg-primary/10 border border-primary/20',
                )}
              >
                {selectMode && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(code.id) }}
                    className="shrink-0"
                  >
                    {isSelected
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : <Square className="w-4 h-4 text-white-muted" />
                    }
                  </button>
                )}
                <span className={cn(
                  'font-mono text-sm font-bold tracking-wider shrink-0',
                  isUsed ? 'text-blue-400' : isInactive ? 'text-red-400' : 'text-primary'
                )}>
                  {formatCode(code.code)}
                </span>
                <div className="flex-1 min-w-0">
                  {isUsed && code.used_by ? (
                    <p className="text-xs text-white truncate">{attendeeNames[code.used_by] || 'Usuario'}</p>
                  ) : (
                    <p className="text-[11px] text-white-muted">{code.label || (isInactive ? 'Desactivado' : 'Disponible')}</p>
                  )}
                </div>
                {!selectMode && !isUsed && (
                  <button onClick={() => handleToggleActive(code)} className="p-1 rounded hover:bg-white/5 shrink-0">
                    {code.is_active ? <Ban className="w-3 h-3 text-red-400" /> : <CheckCircle2 className="w-3 h-3 text-green-400" />}
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {filteredCodes.length > CODES_PER_PAGE && (
        <Pagination currentPage={codePage} totalPages={totalCodePages} onPageChange={setCodePage} />
      )}
    </div>
  )
}
