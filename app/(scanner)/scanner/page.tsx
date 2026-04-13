'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  Camera, Search, Users, CheckCircle2, XCircle, QrCode, UserCheck,
  RefreshCw, MapPin, Clock, Share2, Copy, Check, Undo2, Volume2, VolumeX,
  DoorOpen, UserPlus, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type ScanResult = {
  success: boolean
  error?: string
  user_name?: string
  user_email?: string
  event_title?: string
  ticket_id?: string
  scanned_at?: string
}

type AttendeeRow = {
  id: string
  user_id: string
  event_id: string
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
  created_at: string
  user_name: string | null
  user_email: string
}

// ── Utilities ────────────────────────────────────────────────────────────────

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

function useAnimatedNumber(value: number, duration = 400) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) { setDisplay(value); return }
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [value, duration])
  return display
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const { profile, events: userEvents, venue } = useAuth()

  // Tab & scanner state
  const [tab, setTab] = useState<'scan' | 'list' | 'door'>('scan')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Door registration state
  const [doorName, setDoorName] = useState('')
  const [doorEventId, setDoorEventId] = useState<string>('')
  const [doorLoading, setDoorLoading] = useState(false)
  const [doorResult, setDoorResult] = useState<{ success: boolean; name?: string; error?: string } | null>(null)

  // Attendee data
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [stats, setStats] = useState({ total: 0, scanned: 0, pending: 0 })
  const [loadingAttendees, setLoadingAttendees] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'pending'>('all')
  const [groupFilter, setGroupFilter] = useState<string>('all')

  // Export
  const [copied, setCopied] = useState(false)

  // Refs
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)
  const processedQRs = useRef<Set<string>>(new Set())
  const processingRef = useRef(false)
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Refs for fresh access inside scanner callback
  const attendeesRef = useRef(attendees)
  const eventNameMapRef = useRef<Record<string, string>>({})
  const soundEnabledRef = useRef(soundEnabled)
  const loadAttendeesRef = useRef<() => void>(() => {})

  // ── Derived data ───────────────────────────────────────────────────────────

  const eventIds = useMemo(
    () => userEvents.filter(m => m.is_active).map(m => m.event_id),
    [userEvents],
  )

  const groupNames = useMemo(
    () => userEvents.filter(m => m.is_active).map(m => m.event.group_name || m.event.title),
    [userEvents],
  )

  const eventNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    userEvents.forEach(m => { map[m.event_id] = m.event.group_name || m.event.title })
    return map
  }, [userEvents])

  const multipleEvents = eventIds.length > 1

  // Keep refs in sync
  useEffect(() => { attendeesRef.current = attendees }, [attendees])
  useEffect(() => { eventNameMapRef.current = eventNameMap }, [eventNameMap])
  useEffect(() => { soundEnabledRef.current = soundEnabled }, [soundEnabled])

  // Default door event to first event
  useEffect(() => {
    if (eventIds.length > 0 && !doorEventId) setDoorEventId(eventIds[0])
  }, [eventIds, doorEventId])

  // ── Load attendees ─────────────────────────────────────────────────────────

  const loadAttendees = useCallback(async () => {
    if (eventIds.length === 0) return
    setLoadingAttendees(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/scanner/attendees', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const data: AttendeeRow[] = await res.json()
      setAttendees(data)
      const total = data.length
      const scanned = data.filter(t => t.status === 'used').length
      setStats({ total, scanned, pending: total - scanned })
    } catch (err) {
      console.error('Error loading attendees:', err)
    } finally {
      setLoadingAttendees(false)
    }
  }, [eventIds])

  useEffect(() => { loadAttendeesRef.current = loadAttendees }, [loadAttendees])
  useEffect(() => { loadAttendees() }, [loadAttendees])

  // Realtime subscriptions
  useEffect(() => {
    if (eventIds.length === 0) return
    const channels = eventIds.map(eid =>
      supabase
        .channel(`scanner-tickets-${eid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `event_id=eq.${eid}` }, () => {
          loadAttendeesRef.current()
        })
        .subscribe(),
    )
    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [eventIds])

  // ── Scan logic ─────────────────────────────────────────────────────────────

  const processScan = useCallback(async (qrCode: string) => {
    try {
      const { data, error } = await supabase.rpc('scan_ticket', { ticket_qr: qrCode })

      let result: ScanResult
      if (error) {
        result = { success: false, error: error.message }
      } else {
        result = data as unknown as ScanResult
      }

      // Enrich duplicate scan with local data
      if (!result.success && result.error?.includes('escaneado')) {
        const att = attendeesRef.current.find(a => a.qr_code === qrCode)
        if (att) {
          result.user_name = att.user_name || undefined
          result.event_title = eventNameMapRef.current[att.event_id]
          result.scanned_at = att.scanned_at || undefined
        }
      }

      if (soundEnabledRef.current) playBeep(result.success)
      haptic(result.success)

      setScanResult(result)
      if (result.success) loadAttendeesRef.current()

      // Auto-dismiss overlay (continuous mode)
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
      resultTimeoutRef.current = setTimeout(() => {
        setScanResult(null)
        processingRef.current = false
      }, 2500)
    } catch {
      if (soundEnabledRef.current) playBeep(false)
      haptic(false)
      setScanResult({ success: false, error: 'Error de conexion' })
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
      resultTimeoutRef.current = setTimeout(() => {
        setScanResult(null)
        processingRef.current = false
      }, 2500)
    }
  }, [])

  // Keep ref for scanner callback
  const processScanRef = useRef(processScan)
  useEffect(() => { processScanRef.current = processScan }, [processScan])

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || scanning) return
    setScanResult(null)
    setScanning(true)
    processedQRs.current.clear()
    processingRef.current = false

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (processedQRs.current.has(decodedText)) return
          if (processingRef.current) return
          processingRef.current = true
          processedQRs.current.add(decodedText)
          processScanRef.current(decodedText)
          // Allow re-scan of same QR after 10s
          setTimeout(() => processedQRs.current.delete(decodedText), 10_000)
        },
        () => {},
      )
    } catch (err) {
      console.error('Scanner error:', err)
      setScanning(false)
    }
  }, [scanning])

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try { await (html5QrRef.current as { stop: () => Promise<void> }).stop() } catch { /* */ }
      html5QrRef.current = null
    }
    setScanning(false)
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current)
  }, [])

  useEffect(() => () => { stopScanner() }, [stopScanner])

  // ── Manual check-in ────────────────────────────────────────────────────────

  const manualCheckIn = async (_ticketId: string, qrCode: string) => {
    const { data, error } = await supabase.rpc('scan_ticket', { ticket_qr: qrCode })
    if (error) {
      if (soundEnabled) playBeep(false)
      haptic(false)
    } else if (data) {
      const result = data as unknown as ScanResult
      if (soundEnabled) playBeep(result.success)
      haptic(result.success)
      loadAttendees()
    }
  }

  // ── Undo scan ──────────────────────────────────────────────────────────────

  const undoScan = async (ticketId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/scanner/undo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      })
      if (res.ok) {
        haptic(true)
        loadAttendees()
      }
    } catch { /* */ }
  }

  // ── Door registration ──────────────────────────────────────────────────────

  const registerDoor = async () => {
    if (!doorName.trim() || !doorEventId) return
    setDoorLoading(true)
    setDoorResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/scanner/door-register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name: doorName.trim(), event_id: doorEventId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (soundEnabled) playBeep(true)
        haptic(true)
        setDoorResult({ success: true, name: data.user_name })
        setDoorName('')
        loadAttendees()
        // Auto-clear result
        setTimeout(() => setDoorResult(null), 3000)
      } else {
        if (soundEnabled) playBeep(false)
        haptic(false)
        setDoorResult({ success: false, error: data.error || 'Error' })
      }
    } catch {
      if (soundEnabled) playBeep(false)
      haptic(false)
      setDoorResult({ success: false, error: 'Error de conexion' })
    } finally {
      setDoorLoading(false)
    }
  }

  // Door entry count
  const doorCount = useMemo(
    () => attendees.filter(a => a.qr_code.startsWith('DOOR-')).length,
    [attendees],
  )

  // ── Filters ────────────────────────────────────────────────────────────────

  const filteredAttendees = useMemo(() => {
    return attendees.filter(a => {
      if (statusFilter === 'inside' && a.status !== 'used') return false
      if (statusFilter === 'pending' && a.status === 'used') return false
      if (groupFilter !== 'all' && a.event_id !== groupFilter) return false
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        (a.user_name || '').toLowerCase().includes(q) ||
        a.user_email.toLowerCase().includes(q) ||
        (eventNameMap[a.event_id] || '').toLowerCase().includes(q)
      )
    })
  }, [attendees, statusFilter, groupFilter, searchQuery, eventNameMap])

  // ── Export / Share ─────────────────────────────────────────────────────────

  const generateExportMessage = useCallback(() => {
    const date = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    const venueName = venue?.name || 'Evento'
    const pct = stats.total > 0 ? ((stats.scanned / stats.total) * 100).toFixed(1) : '0'

    let msg = `ASISTENCIA — ${venueName}\n${date}\n\n`
    msg += `Total: ${stats.total}\n`
    msg += `Dentro: ${stats.scanned} (${pct}%)\n`
    msg += `Pendiente: ${stats.pending}\n`

    const doorTotal = attendees.filter(a => a.qr_code.startsWith('DOOR-')).length
    if (doorTotal > 0) {
      msg += `Puerta: ${doorTotal}\n`
    }

    if (multipleEvents) {
      msg += '\n'
      for (const [eventId, name] of Object.entries(eventNameMap)) {
        const evAtt = attendees.filter(a => a.event_id === eventId)
        const inside = evAtt.filter(a => a.status === 'used').length
        const pending = evAtt.length - inside
        const doors = evAtt.filter(a => a.qr_code.startsWith('DOOR-')).length
        msg += `\n${name}\n  ${inside} dentro / ${pending} pendiente${doors > 0 ? ` / ${doors} puerta` : ''}\n`
      }
    }

    const noShows = attendees.filter(a => a.status !== 'used')
    if (noShows.length > 0) {
      msg += `\nPENDIENTES (${noShows.length}):\n`
      noShows.slice(0, 80).forEach(a => {
        const name = a.user_name || 'Sin nombre'
        const group = multipleEvents ? ` (${eventNameMap[a.event_id] || ''})` : ''
        msg += `- ${name}${group}\n`
      })
      if (noShows.length > 80) msg += `... y ${noShows.length - 80} mas\n`
    }

    return msg
  }, [attendees, eventNameMap, multipleEvents, stats, venue])

  const shareExport = async () => {
    const msg = generateExportMessage()
    if (navigator.share) {
      try { await navigator.share({ text: msg }); return } catch { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(msg)
      setCopied(true)
      haptic(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* */ }
  }

  // ── Animated stats ─────────────────────────────────────────────────────────

  const animTotal = useAnimatedNumber(stats.total)
  const animScanned = useAnimatedNumber(stats.scanned)
  const animPending = useAnimatedNumber(stats.pending)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Venue / Events info */}
      {multipleEvents && (
        <div className="card p-3 flex items-center gap-2.5">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white-muted">
              {eventIds.length} grupos en {venue?.name || 'el venue'}
            </p>
            <p className="text-[10px] text-white/30 truncate">{groupNames.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-xl font-bold text-white tabular-nums">{animTotal}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Total</div>
        </div>
        <div className="card p-3 text-center border-emerald-500/20">
          <div className="text-xl font-bold text-emerald-400 tabular-nums">{animScanned}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Dentro</div>
        </div>
        <div className="card p-3 text-center border-amber-500/20">
          <div className="text-xl font-bold text-amber-400 tabular-nums">{animPending}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Pendiente</div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
        <button
          onClick={() => { setTab('scan'); setScanResult(null) }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'scan' ? 'bg-primary text-white' : 'text-white-muted',
          )}
        >
          <QrCode className="w-3.5 h-3.5" />
          Escanear
        </button>
        <button
          onClick={() => { setTab('door'); stopScanner() }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'door' ? 'bg-primary text-white' : 'text-white-muted',
          )}
        >
          <DoorOpen className="w-3.5 h-3.5" />
          Puerta
          {doorCount > 0 && (
            <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded-full">{doorCount}</span>
          )}
        </button>
        <button
          onClick={() => { setTab('list'); stopScanner() }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all',
            tab === 'list' ? 'bg-primary text-white' : 'text-white-muted',
          )}
        >
          <Users className="w-3.5 h-3.5" />
          Lista
        </button>
      </div>

      {/* ─── SCAN TAB ───────────────────────────────────────────────── */}
      {tab === 'scan' && (
        <div className="space-y-3">
          {/* Camera + overlay */}
          <div
            ref={scannerRef}
            className="relative rounded-2xl overflow-hidden bg-black-card border border-black-border"
            style={{ minHeight: '300px' }}
          >
            <div id="qr-reader" className="w-full" />

            {!scanning && !scanResult && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Camera className="w-12 h-12 text-white-muted mb-3" />
                <p className="text-white-muted text-sm">Pulsa para escanear</p>
              </div>
            )}

            {/* Continuous scan result overlay */}
            {scanning && scanResult && (
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 p-3.5 flex items-center gap-3',
                  scanResult.success
                    ? 'bg-emerald-600/95 backdrop-blur-sm'
                    : 'bg-red-600/95 backdrop-blur-sm',
                )}
                style={{ animation: 'slideUp 0.2s ease-out' }}
              >
                {scanResult.success ? (
                  <CheckCircle2 className="w-8 h-8 text-white flex-shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-white flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-sm truncate">
                    {scanResult.success
                      ? scanResult.user_name || 'Entrada OK'
                      : scanResult.error?.includes('escaneado')
                        ? scanResult.user_name || 'Ya escaneado'
                        : 'Error'}
                  </p>
                  <p className="text-white/80 text-xs truncate">
                    {scanResult.success
                      ? `${scanResult.event_title || 'Validado'}`
                      : scanResult.error?.includes('escaneado')
                        ? `Ya entro ${scanResult.scanned_at ? 'a las ' + formatTime(scanResult.scanned_at) : ''}`
                        : scanResult.error}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {!scanning ? (
              <button onClick={startScanner} className="btn-primary flex-1 py-3.5">
                <Camera className="w-5 h-5" />
                Iniciar escaner
              </button>
            ) : (
              <button onClick={stopScanner} className="btn-ghost flex-1 py-3">
                Detener escaner
              </button>
            )}
            <button
              onClick={() => setSoundEnabled(s => !s)}
              className={cn(
                'w-12 flex items-center justify-center rounded-xl border transition-all',
                soundEnabled
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-black-border bg-white/5 text-white-muted',
              )}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Non-continuous scan result (when scanner is stopped) */}
          {!scanning && scanResult && (
            <div
              className={cn(
                'card p-5 text-center',
                scanResult.success ? 'border-emerald-500/30' : 'border-red-500/30',
              )}
            >
              <div
                className={cn(
                  'w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center',
                  scanResult.success ? 'bg-emerald-500/15' : 'bg-red-500/15',
                )}
              >
                {scanResult.success ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                ) : (
                  <XCircle className="w-7 h-7 text-red-400" />
                )}
              </div>
              {scanResult.success ? (
                <>
                  <h3 className="text-lg font-bold text-white">{scanResult.user_name}</h3>
                  <p className="text-white-muted text-sm mt-1">Entrada validada</p>
                  {scanResult.event_title && (
                    <p className="text-[11px] text-white/30 mt-0.5">{scanResult.event_title}</p>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-red-400">
                    {scanResult.error?.includes('escaneado') ? 'Ya escaneado' : 'Error'}
                  </h3>
                  <p className="text-white-muted text-sm mt-1">
                    {scanResult.error?.includes('escaneado') && scanResult.user_name
                      ? `${scanResult.user_name} ya entro${scanResult.scanned_at ? ' a las ' + formatTime(scanResult.scanned_at) : ''}`
                      : scanResult.error}
                  </p>
                  {scanResult.event_title && (
                    <p className="text-[11px] text-white/30 mt-0.5">{scanResult.event_title}</p>
                  )}
                </>
              )}
              <button
                onClick={() => { setScanResult(null); startScanner() }}
                className="btn-primary w-full mt-4 py-3"
              >
                Escanear otro
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── DOOR TAB ───────────────────────────────────────────────── */}
      {tab === 'door' && (
        <div className="space-y-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Registro en puerta</h3>
                <p className="text-[11px] text-white-muted">Para gente que paga en la entrada</p>
              </div>
            </div>

            {/* Name input */}
            <input
              type="text"
              value={doorName}
              onChange={e => setDoorName(e.target.value)}
              placeholder="Nombre de la persona"
              className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter' && doorName.trim()) registerDoor() }}
            />

            {/* Event selector (if multiple events) */}
            {multipleEvents && (
              <div className="space-y-1.5">
                <label className="text-[11px] text-white-muted font-medium">Grupo</label>
                <div className="flex gap-1.5 flex-wrap">
                  {eventIds.map(id => (
                    <button
                      key={id}
                      onClick={() => setDoorEventId(id)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                        doorEventId === id
                          ? 'bg-primary/15 text-primary border border-primary/20'
                          : 'bg-white/5 text-white-muted border border-transparent',
                      )}
                    >
                      {eventNameMap[id]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Register button */}
            <button
              onClick={registerDoor}
              disabled={!doorName.trim() || doorLoading}
              className={cn(
                'btn-primary w-full py-3.5 text-sm',
                (!doorName.trim() || doorLoading) && 'opacity-50 pointer-events-none',
              )}
            >
              {doorLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <DoorOpen className="w-4 h-4" />
              )}
              {doorLoading ? 'Registrando...' : 'Registrar entrada'}
            </button>
          </div>

          {/* Result feedback */}
          {doorResult && (
            <div
              className={cn(
                'card p-4 flex items-center gap-3',
                doorResult.success ? 'border-emerald-500/30' : 'border-red-500/30',
              )}
              style={{ animation: 'slideUp 0.2s ease-out' }}
            >
              {doorResult.success ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium text-white">
                  {doorResult.success ? `${doorResult.name} registrado` : 'Error'}
                </p>
                <p className="text-[11px] text-white-muted">
                  {doorResult.success ? 'Entrada en puerta confirmada' : doorResult.error}
                </p>
              </div>
            </div>
          )}

          {/* Door entry stats */}
          {doorCount > 0 && (
            <div className="card p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DoorOpen className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-white-muted">Entradas en puerta hoy</span>
              </div>
              <span className="text-sm font-bold text-amber-400 tabular-nums">{doorCount}</span>
            </div>
          )}

          {/* Recent door entries */}
          {(() => {
            const doorEntries = attendees
              .filter(a => a.qr_code.startsWith('DOOR-'))
              .slice(0, 10)
            if (doorEntries.length === 0) return null
            return (
              <div className="space-y-1.5">
                <p className="text-[11px] text-white/30 font-medium uppercase tracking-wider">Ultimas entradas</p>
                <div className="space-y-1.5">
                  {doorEntries.map(a => (
                    <div key={a.id} className="card p-3 flex items-center gap-2.5">
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-xs text-white flex-1 truncate">{a.user_name || 'Sin nombre'}</span>
                      {multipleEvents && (
                        <span className="text-[10px] text-white/25 truncate max-w-[80px]">
                          {eventNameMap[a.event_id]}
                        </span>
                      )}
                      <span className="text-[10px] text-white/25 tabular-nums">{formatTime(a.scanned_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ─── LIST TAB ───────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={multipleEvents ? 'Buscar nombre, email o grupo...' : 'Buscar asistente...'}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          {/* Status filter pills */}
          <div className="flex gap-1.5">
            {([
              { key: 'all' as const, label: 'Todos', count: stats.total },
              { key: 'inside' as const, label: 'Dentro', count: stats.scanned },
              { key: 'pending' as const, label: 'Pendiente', count: stats.pending },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all text-center',
                  statusFilter === f.key
                    ? f.key === 'inside'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : f.key === 'pending'
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        : 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-white/5 text-white-muted border border-transparent',
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {/* Group filter pills */}
          {multipleEvents && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              <button
                onClick={() => setGroupFilter('all')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap shrink-0',
                  groupFilter === 'all'
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-white/5 text-white-muted border border-transparent',
                )}
              >
                Todos
              </button>
              {Object.entries(eventNameMap).map(([id, name]) => (
                <button
                  key={id}
                  onClick={() => setGroupFilter(id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap shrink-0',
                    groupFilter === id
                      ? 'bg-primary/15 text-primary border border-primary/20'
                      : 'bg-white/5 text-white-muted border border-transparent',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Actions row */}
          <div className="flex gap-2">
            <button onClick={shareExport} className="flex-1 btn-ghost py-2 text-xs">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Compartir resumen'}
            </button>
            <button onClick={loadAttendees} className="flex-1 btn-ghost py-2 text-xs">
              <RefreshCw className={cn('w-3.5 h-3.5', loadingAttendees && 'animate-spin')} />
              Actualizar
            </button>
          </div>

          {/* Filtered count */}
          {(statusFilter !== 'all' || groupFilter !== 'all' || searchQuery) && (
            <p className="text-[11px] text-white/30 text-center">
              {filteredAttendees.length} de {attendees.length} asistentes
            </p>
          )}

          {/* Attendee list */}
          <div className="space-y-2">
            {filteredAttendees.map(attendee => (
              <div key={attendee.id} className="card p-3.5 flex items-center gap-3">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                    attendee.status === 'used' ? 'bg-emerald-500/15' : 'bg-white/5',
                  )}
                >
                  {attendee.status === 'used' ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Users className="w-4 h-4 text-white-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                    {attendee.user_name || 'Sin nombre'}
                    {attendee.qr_code.startsWith('DOOR-') && (
                      <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium shrink-0">
                        PUERTA
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-white-muted truncate">
                    {multipleEvents && eventNameMap[attendee.event_id]
                      ? `${eventNameMap[attendee.event_id]} · `
                      : ''}
                    {attendee.qr_code.startsWith('DOOR-') ? 'Pago en puerta' : attendee.user_email}
                  </p>
                </div>
                {attendee.status === 'used' ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {attendee.scanned_at && (
                      <span className="text-[10px] text-white/25 tabular-nums flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTime(attendee.scanned_at)}
                      </span>
                    )}
                    <span className="text-[10px] text-emerald-400 font-medium px-2 py-1 rounded-full bg-emerald-500/10">
                      Dentro
                    </span>
                    <button
                      onClick={() => undoScan(attendee.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-white/30 active:bg-white/10 active:text-white/60 transition-all"
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => manualCheckIn(attendee.id, attendee.qr_code)}
                    className="text-[10px] text-primary font-medium px-2.5 py-1 rounded-full bg-primary/10 active:scale-95 transition-transform flex-shrink-0"
                  >
                    Check-in
                  </button>
                )}
              </div>
            ))}
            {filteredAttendees.length === 0 && (
              <div className="text-center py-8">
                <Users className="w-8 h-8 text-white-muted mx-auto mb-2" />
                <p className="text-white-muted text-sm">
                  {searchQuery || statusFilter !== 'all' || groupFilter !== 'all'
                    ? 'No se encontraron resultados'
                    : 'No hay asistentes aun'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSS animation for scan overlay */}
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
