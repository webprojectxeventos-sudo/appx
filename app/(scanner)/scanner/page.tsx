'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { Camera, Search, Users, CheckCircle2, XCircle, QrCode, UserCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  scanned_at: string | null
  created_at: string
  users: { full_name: string | null; email: string }
}

export default function ScannerPage() {
  const { profile, event } = useAuth()
  const [tab, setTab] = useState<'scan' | 'list'>('scan')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [attendees, setAttendees] = useState<AttendeeRow[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState({ total: 0, scanned: 0, pending: 0 })
  const [loadingAttendees, setLoadingAttendees] = useState(false)
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<unknown>(null)

  // Load attendee list
  const loadAttendees = useCallback(async () => {
    if (!event?.id) return
    setLoadingAttendees(true)
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, user_id, qr_code, status, scanned_at, created_at, users!inner(full_name, email)')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false })

      if (data && !error) {
        setAttendees(data as unknown as AttendeeRow[])
        const total = data.length
        const scanned = data.filter((t) => t.status === 'used').length
        setStats({ total, scanned, pending: total - scanned })
      }
    } catch (err) {
      console.error('Error loading attendees:', err)
    } finally {
      setLoadingAttendees(false)
    }
  }, [event?.id])

  useEffect(() => {
    loadAttendees()
  }, [loadAttendees])

  // Realtime subscription for ticket updates
  useEffect(() => {
    if (!event?.id) return
    const channel = supabase
      .channel(`scanner-tickets-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `event_id=eq.${event.id}` }, () => {
        loadAttendees()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, loadAttendees])

  // Start QR scanner
  const startScanner = useCallback(async () => {
    if (!scannerRef.current || scanning) return
    setScanResult(null)
    setScanning(true)

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('qr-reader')
      html5QrRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Stop scanning immediately
          try {
            await scanner.stop()
          } catch { /* ignore */ }
          setScanning(false)
          html5QrRef.current = null

          // Process the scanned QR
          handleScan(decodedText)
        },
        () => { /* ignore errors during scanning */ }
      )
    } catch (err) {
      console.error('Scanner error:', err)
      setScanning(false)
    }
  }, [scanning])

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await (html5QrRef.current as { stop: () => Promise<void> }).stop()
      } catch { /* ignore */ }
      html5QrRef.current = null
    }
    setScanning(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopScanner() }
  }, [stopScanner])

  const handleScan = async (qrCode: string) => {
    try {
      const { data, error } = await supabase.rpc('scan_ticket', { ticket_qr: qrCode })
      if (error) {
        setScanResult({ success: false, error: error.message })
      } else {
        setScanResult(data as unknown as ScanResult)
        loadAttendees() // Refresh list
      }
    } catch (err) {
      setScanResult({ success: false, error: 'Error al procesar el ticket' })
    }
  }

  // Manual check-in
  const manualCheckIn = async (ticketId: string, qrCode: string) => {
    const { data, error } = await supabase.rpc('scan_ticket', { ticket_qr: qrCode })
    if (error) {
      setScanResult({ success: false, error: error.message })
    } else if (data) {
      setScanResult(data as unknown as ScanResult)
      loadAttendees()
    }
  }

  const filteredAttendees = attendees.filter((a) => {
    if (!searchQuery) return true
    const name = (a.users?.full_name || '').toLowerCase()
    const email = (a.users?.email || '').toLowerCase()
    const q = searchQuery.toLowerCase()
    return name.includes(q) || email.includes(q)
  })

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-xl font-bold text-white">{stats.total}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Total</div>
        </div>
        <div className="card p-3 text-center border-emerald-500/20">
          <div className="text-xl font-bold text-emerald-400">{stats.scanned}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Dentro</div>
        </div>
        <div className="card p-3 text-center border-amber-500/20">
          <div className="text-xl font-bold text-amber-400">{stats.pending}</div>
          <div className="text-[10px] uppercase tracking-widest text-white-muted">Pendiente</div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
        <button
          onClick={() => { setTab('scan'); setScanResult(null) }}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
            tab === 'scan' ? 'bg-primary text-white' : 'text-white-muted'
          )}
        >
          <QrCode className="w-4 h-4" />
          Escanear
        </button>
        <button
          onClick={() => { setTab('list'); stopScanner() }}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
            tab === 'list' ? 'bg-primary text-white' : 'text-white-muted'
          )}
        >
          <Users className="w-4 h-4" />
          Asistentes
        </button>
      </div>

      {/* Scanner Tab */}
      {tab === 'scan' && (
        <div className="space-y-4">
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
          </div>

          {!scanning && !scanResult && (
            <button onClick={startScanner} className="btn-primary w-full py-3.5">
              <Camera className="w-5 h-5" />
              Iniciar escaner
            </button>
          )}

          {scanning && (
            <button onClick={stopScanner} className="btn-ghost w-full py-3">
              Detener escaner
            </button>
          )}

          {/* Scan Result */}
          {scanResult && (
            <div className={cn(
              'card p-5 text-center',
              scanResult.success ? 'border-emerald-500/30' : 'border-red-500/30'
            )}>
              <div className={cn(
                'w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center',
                scanResult.success ? 'bg-emerald-500/15' : 'bg-red-500/15'
              )}>
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
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-red-400">Error</h3>
                  <p className="text-white-muted text-sm mt-1">{scanResult.error}</p>
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

      {/* Attendee List Tab */}
      {tab === 'list' && (
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar asistente..."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          {/* Refresh */}
          <button onClick={loadAttendees} className="btn-ghost w-full py-2 text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', loadingAttendees && 'animate-spin')} />
            Actualizar lista
          </button>

          {/* List */}
          <div className="space-y-2">
            {filteredAttendees.map((attendee) => (
              <div key={attendee.id} className="card p-3.5 flex items-center gap-3">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  attendee.status === 'used' ? 'bg-emerald-500/15' : 'bg-white/5'
                )}>
                  {attendee.status === 'used' ? (
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Users className="w-4 h-4 text-white-muted" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {attendee.users?.full_name || 'Sin nombre'}
                  </p>
                  <p className="text-[11px] text-white-muted truncate">{attendee.users?.email}</p>
                </div>
                {attendee.status === 'used' ? (
                  <span className="text-[10px] text-emerald-400 font-medium px-2 py-1 rounded-full bg-emerald-500/10">
                    Dentro
                  </span>
                ) : (
                  <button
                    onClick={() => manualCheckIn(attendee.id, attendee.qr_code)}
                    className="text-[10px] text-primary font-medium px-2.5 py-1 rounded-full bg-primary/10 active:scale-95 transition-transform"
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
                  {searchQuery ? 'No se encontraron resultados' : 'No hay asistentes aun'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
