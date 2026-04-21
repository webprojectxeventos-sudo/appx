'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'
import {
  Camera, Search, CheckCircle2, XCircle, Package,
  RefreshCw, Clock, Volume2, VolumeX, Loader2,
  Undo2, Hash, Euro, Shirt, ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  startFastScanner,
  humanizeCameraError,
  type FastScannerHandle,
} from '@/lib/scanner/fast-scan-engine'

// ── Types ──────────────────────────────────────────────────────────────────

type CloakroomItem = {
  id: string
  event_id: string
  user_id: string
  ticket_number: number
  amount: number
  status: 'stored' | 'returned'
  checked_in_at: string
  checked_out_at: string | null
  user_name: string
}

type CloakroomEvent = {
  id: string
  title: string
  group_name: string | null
  date: string
}

type ActionResult = {
  action: 'checkin' | 'checkout'
  ticket_number: number
  user_name: string
  amount?: number
  remaining?: number
  item_id?: string
}

// ── Utilities ──────────────────────────────────────────────────────────────

function playBeep(success: boolean) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = success ? 880 : 280
    osc.type = success ? 'sine' : 'square'
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.15 : 0.3))
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + (success ? 0.15 : 0.3))
  } catch { /* AudioContext not available */ }
}

function haptic(success: boolean) {
  try { navigator.vibrate?.(success ? [100] : [80, 50, 80]) } catch { /* ignore */ }
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CloakroomPage() {
  // Tab
  const [tab, setTab] = useState<'scan' | 'inventory'>('scan')

  // Scanner state
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundEnabledRef = useRef(true)

  // Action result (after scan or search)
  const [result, setResult] = useState<(ActionResult & { success: true }) | { success: false; error: string } | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; full_name: string | null; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Events
  const [events, setEvents] = useState<CloakroomEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [showEventPicker, setShowEventPicker] = useState(false)

  // Items (inventory)
  const [items, setItems] = useState<CloakroomItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [inventorySearch, setInventorySearch] = useState('')

  // Price (editable, persisted in localStorage)
  const [price, setPrice] = useState(() => {
    if (typeof window === 'undefined') return 1
    const saved = localStorage.getItem('cloakroom_price')
    return saved ? parseFloat(saved) : 1
  })

  // Stats
  const stats = useMemo(() => {
    const stored = items.filter(i => i.status === 'stored')
    const returned = items.filter(i => i.status === 'returned')
    const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0)
    return { stored: stored.length, returned: returned.length, total: items.length, amount: totalAmount }
  }, [items])

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  /** Fast-scanner handle (BarcodeDetector native or ZXing fallback). */
  const engineRef = useRef<FastScannerHandle | null>(null)
  const processingRef = useRef(false)
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ── Load events + items ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setItemsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/cloakroom/items', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setEvents(data.events || [])
      setItems(data.items || [])
      if (data.events?.length > 0 && !selectedEventId) {
        setSelectedEventId(data.events[0].id)
      }
    } catch { /* ignore */ }
    finally { setItemsLoading(false) }
  }, [selectedEventId])

  useEffect(() => { loadData() }, [loadData])

  // Realtime — reload on cloakroom_items changes
  useEffect(() => {
    if (!selectedEventId) return
    const channel = supabase
      .channel(`cloakroom-${selectedEventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cloakroom_items', filter: `event_id=eq.${selectedEventId}` }, () => {
        loadData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedEventId, loadData])

  // Auto-select first event
  useEffect(() => {
    if (events.length > 0 && !selectedEventId) setSelectedEventId(events[0].id)
  }, [events, selectedEventId])

  // Persist price
  useEffect(() => {
    localStorage.setItem('cloakroom_price', String(price))
  }, [price])

  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  // ── QR Scanner ──────────────────────────────────────────────────────────

  // Scan handler extracted so the fast-engine callback stays thin. The
  // cloakroom flow is still server-authoritative (unlike the ticket
  // scanner) because check-in/check-out state lives only in the DB — we
  // can't optimistically decide locally. That's fine: the operation is
  // off the critical path for admission, so a ~300 ms round-trip is
  // acceptable here.
  const handleCloakroomQr = useCallback(
    async (decodedText: string) => {
      if (processingRef.current) return
      processingRef.current = true

      try {
        const res = await authFetch('/api/cloakroom/action', {
          qr_code: decodedText,
          event_id: selectedEventId,
          amount: price,
        })
        const data = await res.json()

        if (res.ok) {
          if (soundEnabledRef.current) playBeep(true)
          haptic(true)
          setResult({ success: true, ...data })
          loadData()
        } else {
          if (soundEnabledRef.current) playBeep(false)
          haptic(false)
          setResult({ success: false, error: data.error || 'Error desconocido' })
        }
      } catch {
        if (soundEnabledRef.current) playBeep(false)
        setResult({ success: false, error: 'Error de conexion' })
      }

      // Auto-clear result after 3s
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
      resultTimeoutRef.current = setTimeout(() => {
        setResult(null)
        processingRef.current = false
      }, 3000)
    },
    [selectedEventId, price, loadData],
  )

  const startScanner = useCallback(async () => {
    if (!videoRef.current || engineRef.current) return
    setCameraError(null)
    try {
      const handle = await startFastScanner({
        videoEl: videoRef.current,
        onDetect: (qr) => {
          void handleCloakroomQr(qr)
        },
      })
      engineRef.current = handle
      setScanning(true)
    } catch (err) {
      setCameraError(humanizeCameraError(err))
    }
  }, [handleCloakroomQr])

  const stopScanner = useCallback(async () => {
    const handle = engineRef.current
    engineRef.current = null
    if (handle) {
      try {
        await handle.stop()
      } catch {
        /* ignore */
      }
    }
    setScanning(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => { return () => { stopScanner() } }, [stopScanner])

  // ── Search by name ──────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !selectedEventId) return
    setSearching(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Search attendees for this event
      const { data: ue } = await supabase
        .from('user_events')
        .select('user_id')
        .eq('event_id', selectedEventId)
        .eq('role', 'attendee')

      if (!ue || ue.length === 0) { setSearchResults([]); return }

      const userIds = ue.map(u => u.user_id)
      const q = searchQuery.trim().toLowerCase()
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .not('email', 'like', 'door.%@puerta.local')
        .limit(15)

      setSearchResults(users || [])
    } catch { /* ignore */ }
    finally { setSearching(false) }
  }, [searchQuery, selectedEventId])

  // ── Action on search result ─────────────────────────────────────────────

  const handleActionForUser = async (userId: string) => {
    if (!selectedEventId) return
    setActionLoading(userId)
    try {
      const res = await authFetch('/api/cloakroom/action', {
        user_id: userId,
        event_id: selectedEventId,
        amount: price,
      })
      const data = await res.json()
      if (res.ok) {
        playBeep(true)
        haptic(true)
        setResult({ success: true, ...data })
        loadData()
        setSearchResults([])
        setSearchQuery('')
      } else {
        playBeep(false)
        setResult({ success: false, error: data.error || 'Error' })
      }
    } catch {
      setResult({ success: false, error: 'Error de conexion' })
    }
    finally { setActionLoading(null) }

    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
    resultTimeoutRef.current = setTimeout(() => setResult(null), 3000)
  }

  // ── Force checkin (from inventory) ──────────────────────────────────────

  const handleForceCheckin = async (userId: string) => {
    if (!selectedEventId) return
    setActionLoading(userId)
    try {
      const res = await authFetch('/api/cloakroom/checkin', {
        user_id: userId,
        event_id: selectedEventId,
        amount: price,
      })
      const data = await res.json()
      if (res.ok) {
        playBeep(true)
        setResult({ success: true, ...data })
        loadData()
      } else {
        setResult({ success: false, error: data.error || 'Error' })
      }
    } catch { setResult({ success: false, error: 'Error de conexion' }) }
    finally { setActionLoading(null) }

    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
    resultTimeoutRef.current = setTimeout(() => setResult(null), 3000)
  }

  // ── Checkout specific item ──────────────────────────────────────────────

  const handleCheckout = async (itemId: string) => {
    setActionLoading(itemId)
    try {
      const res = await authFetch('/api/cloakroom/checkout', { item_id: itemId })
      const data = await res.json()
      if (res.ok) {
        playBeep(true)
        haptic(true)
        setResult({ success: true, ...data })
        loadData()
      } else {
        playBeep(false)
        setResult({ success: false, error: data.error || 'Error' })
      }
    } catch { setResult({ success: false, error: 'Error de conexion' }) }
    finally { setActionLoading(null) }

    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
    resultTimeoutRef.current = setTimeout(() => setResult(null), 3000)
  }

  // ── Filtered items ──────────────────────────────────────────────────────

  const eventItems = useMemo(() => items.filter(i => i.event_id === selectedEventId), [items, selectedEventId])
  const storedItems = useMemo(() => eventItems.filter(i => i.status === 'stored'), [eventItems])

  const filteredItems = useMemo(() => {
    if (!inventorySearch.trim()) return storedItems
    const q = inventorySearch.trim().toLowerCase()
    // Search by number or name
    return storedItems.filter(i =>
      String(i.ticket_number).includes(q) ||
      i.user_name.toLowerCase().includes(q)
    )
  }, [storedItems, inventorySearch])

  const selectedEvent = events.find(e => e.id === selectedEventId)

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Event selector */}
      {events.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setShowEventPicker(!showEventPicker)}
            className="card p-3 w-full flex items-center justify-between"
          >
            <div className="text-left min-w-0">
              <p className="text-[11px] text-white-muted">Evento</p>
              <p className="text-sm font-medium text-white truncate">{selectedEvent?.title || 'Seleccionar'}</p>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-white-muted transition-transform', showEventPicker && 'rotate-180')} />
          </button>
          {showEventPicker && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 card max-h-48 overflow-y-auto divide-y divide-white/5">
              {events.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => { setSelectedEventId(ev.id); setShowEventPicker(false) }}
                  className={cn('w-full text-left px-4 py-3 hover:bg-white/5', ev.id === selectedEventId && 'bg-primary/[0.06]')}
                >
                  <p className={cn('text-sm font-medium', ev.id === selectedEventId ? 'text-primary' : 'text-white')}>{ev.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <Package className="w-4 h-4 text-amber-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.stored}</p>
          <p className="text-[10px] text-white-muted">Activas</p>
        </div>
        <div className="card p-3 text-center">
          <Euro className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.amount.toFixed(0)}€</p>
          <p className="text-[10px] text-white-muted">Recaudado</p>
        </div>
        <div className="card p-3 text-center">
          <CheckCircle2 className="w-4 h-4 text-blue-400 mx-auto mb-1" />
          <p className="text-lg font-bold text-white">{stats.returned}</p>
          <p className="text-[10px] text-white-muted">Devueltas</p>
        </div>
      </div>

      {/* Price setting */}
      <div className="flex items-center gap-3 card p-3">
        <Euro className="w-4 h-4 text-white-muted shrink-0" />
        <span className="text-xs text-white-muted shrink-0">Precio por prenda:</span>
        <input
          type="number"
          min="0"
          step="0.5"
          value={price}
          onChange={e => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-20 px-3 py-1.5 rounded-lg border border-black-border bg-transparent text-white text-sm font-mono text-center focus:outline-none focus:border-primary/40"
        />
        <span className="text-xs text-white-muted">€</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
        {(['scan', 'inventory'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t !== 'scan') stopScanner() }}
            className={cn(
              'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all',
              tab === t ? 'bg-white/10 text-white' : 'text-white-muted hover:text-white'
            )}
          >
            {t === 'scan' ? 'Escanear' : `Inventario (${stats.stored})`}
          </button>
        ))}
      </div>

      {/* ── SCAN TAB ──────────────────────────────────────────────────── */}
      {tab === 'scan' && (
        <div className="space-y-4">
          {/* Camera */}
          <div className="card overflow-hidden">
            <div className="relative">
              <div
                className={cn('w-full aspect-square bg-black/40 relative', !scanning && !cameraError && 'flex items-center justify-center')}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  autoPlay
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover',
                    !scanning && 'hidden',
                  )}
                />
                {!scanning && !cameraError && (
                  <button
                    onClick={startScanner}
                    disabled={!selectedEventId}
                    className="flex flex-col items-center gap-3 text-white-muted hover:text-white transition-colors p-8 relative"
                  >
                    <Camera className="w-12 h-12" />
                    <span className="text-sm">Pulsa para escanear</span>
                  </button>
                )}
                {cameraError && !scanning && (
                  <div className="text-center p-6 relative">
                    <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-400">{cameraError}</p>
                    <button onClick={startScanner} className="mt-3 text-xs text-primary">Reintentar</button>
                  </div>
                )}
              </div>
              {scanning && (
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className="p-2 rounded-full bg-black/50 backdrop-blur-sm text-white"
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={stopScanner}
                    className="p-2 rounded-full bg-black/50 backdrop-blur-sm text-white"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Result display */}
          {result && (
            <div className={cn(
              'card p-5 border-2 text-center transition-all',
              result.success
                ? (result as ActionResult).action === 'checkin'
                  ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
                  : 'border-blue-500/40 bg-blue-500/[0.06]'
                : 'border-red-500/40 bg-red-500/[0.06]'
            )}>
              {result.success ? (
                <>
                  {(result as ActionResult).action === 'checkin' ? (
                    <>
                      {/* BIG ticket number for staff to write down */}
                      <p className="text-7xl font-black text-white mb-2 font-mono">
                        #{(result as ActionResult).ticket_number}
                      </p>
                      <p className="text-base font-semibold text-emerald-400">
                        {(result as ActionResult).user_name}
                      </p>
                      <p className="text-xs text-white-muted mt-1">
                        Prenda depositada · {(result as ActionResult).amount}€
                      </p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-16 h-16 text-blue-400 mx-auto mb-2" />
                      <p className="text-3xl font-bold text-white font-mono">
                        #{(result as ActionResult).ticket_number}
                      </p>
                      <p className="text-base font-semibold text-blue-400 mt-1">
                        {(result as ActionResult).user_name}
                      </p>
                      <p className="text-xs text-white-muted mt-1">
                        Prenda devuelta
                        {(result as ActionResult & { remaining?: number }).remaining !== undefined && (result as ActionResult & { remaining?: number }).remaining! > 0
                          ? ` · Quedan ${(result as ActionResult & { remaining?: number }).remaining} activas`
                          : ''}
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <XCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-400">{(result as { success: false; error: string }).error}</p>
                </>
              )}
            </div>
          )}

          {/* Search by name */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-medium text-white-muted">Buscar por nombre</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                placeholder="Nombre del asistente..."
                className="flex-1 px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={handleSearch}
                disabled={searching || !searchQuery.trim()}
                className="btn-primary px-4"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {searchResults.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-black-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.full_name || 'Sin nombre'}</p>
                      <p className="text-[11px] text-white-muted truncate">{u.email}</p>
                    </div>
                    <button
                      onClick={() => handleActionForUser(u.id)}
                      disabled={actionLoading === u.id}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {actionLoading === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shirt className="w-3 h-3" />}
                      <span className="ml-1">Prenda</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INVENTORY TAB ─────────────────────────────────────────────── */}
      {tab === 'inventory' && (
        <div className="space-y-3">
          {/* Search + refresh */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
              <input
                type="text"
                value={inventorySearch}
                onChange={e => setInventorySearch(e.target.value)}
                placeholder="Buscar por nombre o numero..."
                className="w-full pl-9 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
              />
            </div>
            <button onClick={loadData} className="p-3 rounded-xl border border-black-border text-white-muted hover:text-white transition-colors">
              {itemsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="card p-8 text-center">
              <Package className="w-10 h-10 text-white-muted mx-auto mb-2" />
              <p className="text-sm text-white-muted">
                {inventorySearch ? 'Sin resultados' : 'No hay prendas activas'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <div key={item.id} className="card p-3 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-amber-400 font-mono">#{item.ticket_number}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.user_name}</p>
                    <p className="text-[10px] text-white-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {formatTime(item.checked_in_at)}
                      <span className="mx-1">·</span>
                      {item.amount}€
                    </p>
                  </div>
                  <button
                    onClick={() => handleCheckout(item.id)}
                    disabled={actionLoading === item.id}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                    Devolver
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
