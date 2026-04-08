'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Radio, Send, FileText, Plus, Check, Clock, Users, X, Bell, BellRing, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import type { Database } from '@/lib/types'

type Event = Database['public']['Tables']['events']['Row']
type MessageTemplate = Database['public']['Tables']['message_templates']['Row']
type BroadcastLog = Database['public']['Tables']['broadcast_log']['Row']

export default function CommsPage() {
  const { user, organization, isSuperAdmin, initialized } = useAuth()
  const { events: venueEvents, allEvents, selectedVenueId } = useAdminSelection()
  const { error: showError, success } = useToast()
  // Use venue-filtered events for recipient selection
  const events = selectedVenueId ? venueEvents : allEvents
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [broadcasts, setBroadcasts] = useState<BroadcastLog[]>([])
  const [loading, setLoading] = useState(true)

  // Broadcast form
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [selectAll, setSelectAll] = useState(false)
  const [sendPush, setSendPush] = useState(false)

  // Direct push form
  const [showPushForm, setShowPushForm] = useState(false)
  const [pushTitle, setPushTitle] = useState('')
  const [pushBody, setPushBody] = useState('')
  const [pushUrl, setPushUrl] = useState('')
  const [pushTarget, setPushTarget] = useState<'all' | 'venue' | 'events'>('venue')
  const [sendingPush, setSendingPush] = useState(false)

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [templateTitle, setTemplateTitle] = useState('')
  const [templateContent, setTemplateContent] = useState('')

  useEffect(() => {
    if (!organization?.id) return
    let cancelled = false
    fetchData().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [organization?.id])

  // Reset selection when venue changes
  useEffect(() => {
    setSelectedEvents([])
    setSelectAll(false)
  }, [selectedVenueId])

  const fetchData = async () => {
    if (!organization?.id) return
    setLoading(true)
    const [tmplRes, logRes] = await Promise.all([
      supabase.from('message_templates').select('*').eq('organization_id', organization.id).order('created_at', { ascending: false }),
      supabase.from('broadcast_log').select('*').eq('organization_id', organization.id).order('sent_at', { ascending: false }).limit(20),
    ])
    setTemplates(tmplRes.data || [])
    setBroadcasts(logRes.data || [])
    setLoading(false)
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    )
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedEvents([])
    } else {
      setSelectedEvents(events.map(e => e.id))
    }
    setSelectAll(!selectAll)
  }

  const sendPushNotification = async (params: {
    title: string
    body: string
    url?: string
    event_ids?: string[]
    venue_id?: string
    send_to_all?: boolean
  }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return { sent: 0, failed: 0 }

      const res = await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(params),
      })
      return await res.json()
    } catch (err) {
      console.error('[Push] Error:', err)
      return { sent: 0, failed: 0 }
    }
  }

  const handleSendBroadcast = async () => {
    if (!message.trim() || selectedEvents.length === 0 || !user || !organization?.id) return
    setSending(true)

    try {
      // Insert a message in each selected event's chat as an announcement
      const messageInserts = selectedEvents.map(eventId => ({
        event_id: eventId,
        user_id: user.id,
        content: message.trim(),
        is_announcement: true,
      }))

      const { error: msgError } = await supabase.from('messages').insert(messageInserts)
      if (msgError) throw msgError

      // Log the broadcast
      const { error: logError } = await supabase.from('broadcast_log').insert({
        organization_id: organization.id,
        event_ids: selectedEvents,
        content: message.trim(),
        sent_by: user.id,
      })
      if (logError) console.error('Broadcast log error:', logError)

      // Send push notification if enabled
      let pushResult = null
      if (sendPush) {
        pushResult = await sendPushNotification({
          title: 'Anuncio',
          body: message.trim().slice(0, 200),
          url: '/chat',
          event_ids: selectedEvents,
        })
      }

      const pushMsg = pushResult?.sent ? ` (${pushResult.sent} push enviados)` : ''
      success(`Comunicado enviado correctamente${pushMsg}`)
      setMessage('')
      setSelectedEvents([])
      setSelectAll(false)
      setSendPush(false)
      fetchData()
    } catch (err) {
      console.error('Error sending broadcast:', err)
      showError('Error al enviar el comunicado')
    } finally {
      setSending(false)
    }
  }

  const handleSendDirectPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) return
    setSendingPush(true)

    try {
      const params: Parameters<typeof sendPushNotification>[0] = {
        title: pushTitle.trim(),
        body: pushBody.trim(),
        url: pushUrl.trim() || '/home',
      }

      if (pushTarget === 'all') {
        params.send_to_all = true
      } else if (pushTarget === 'venue' && selectedVenueId) {
        params.venue_id = selectedVenueId
      } else if (pushTarget === 'events' && selectedEvents.length > 0) {
        params.event_ids = selectedEvents
      } else {
        showError('Selecciona destinatarios')
        setSendingPush(false)
        return
      }

      const result = await sendPushNotification(params)
      if (result.sent > 0) {
        success(`Push enviado a ${result.sent} dispositivo(s)`)
      } else {
        showError(result.message || 'No se encontraron suscripciones push')
      }

      setPushTitle('')
      setPushBody('')
      setPushUrl('')
      setShowPushForm(false)
    } catch (err) {
      console.error('Error sending push:', err)
      showError('Error al enviar push')
    } finally {
      setSendingPush(false)
    }
  }

  const handleSaveTemplate = async () => {
    if (!templateTitle || !templateContent || !user || !organization?.id) return
    await supabase.from('message_templates').insert({
      organization_id: organization.id,
      title: templateTitle,
      content: templateContent,
      created_by: user.id,
    })
    setShowTemplateForm(false)
    setTemplateTitle('')
    setTemplateContent('')
    fetchData()
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Eliminar esta plantilla?')) return
    await supabase.from('message_templates').delete().eq('id', id)
    fetchData()
  }

  const useTemplate = (tmpl: MessageTemplate) => {
    setMessage(tmpl.content)
  }

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors'

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isSuperAdmin) return null

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" />
        {[0, 1, 2].map(i => <div key={i} className="card h-32 animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">Comunicados</h1>
        <p className="text-sm text-white-muted mt-0.5">Envia mensajes a todos los grupos o a grupos seleccionados</p>
      </div>

      {/* Broadcast Composer */}
      <div className="card-accent p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Radio className="w-5 h-5 text-primary" />
          <h2 className="text-base font-bold text-white">Nuevo comunicado</h2>
        </div>

        {/* Event selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-white-muted">Destinatarios</label>
            <button onClick={handleSelectAll} className="text-xs text-primary hover:underline">
              {selectAll ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {events.map(ev => {
              const selected = selectedEvents.includes(ev.id)
              return (
                <button
                  key={ev.id}
                  onClick={() => toggleEvent(ev.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    selected
                      ? 'border-primary bg-primary/12 text-primary'
                      : 'border-black-border text-white-muted hover:border-white/15'
                  )}
                >
                  {selected && <Check className="w-3 h-3" />}
                  {ev.group_name || ev.title}
                </button>
              )
            })}
          </div>
          {selectedEvents.length > 0 && (
            <p className="text-[11px] text-primary mt-2">{selectedEvents.length} grupo(s) seleccionado(s)</p>
          )}
        </div>

        {/* Message */}
        <div>
          <label className="text-sm text-white-muted mb-1 block">Mensaje</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Escribe el comunicado que quieres enviar a los grupos seleccionados..."
            rows={4}
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        {/* Quick templates */}
        {templates.length > 0 && (
          <div>
            <label className="text-[11px] text-white-muted mb-1.5 block">Plantillas rapidas</label>
            <div className="flex flex-wrap gap-2">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => useTemplate(t)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-black-border text-white-muted hover:border-primary/30 hover:text-primary transition-all"
                >
                  <FileText className="w-3 h-3 inline mr-1" /> {t.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Push toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => setSendPush(!sendPush)}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              sendPush ? 'bg-primary' : 'bg-white/10'
            )}
          >
            <div className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              sendPush && 'translate-x-5'
            )} />
          </button>
          <div className="flex items-center gap-2">
            {sendPush ? <BellRing className="w-4 h-4 text-primary" /> : <Bell className="w-4 h-4 text-white-muted" />}
            <span className={cn('text-sm', sendPush ? 'text-white' : 'text-white-muted')}>
              Enviar tambien como push notification
            </span>
          </div>
        </label>

        <button
          onClick={handleSendBroadcast}
          disabled={!message.trim() || selectedEvents.length === 0 || sending}
          className="btn-primary w-full py-3 text-sm"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Enviando...' : `Enviar a ${selectedEvents.length} grupo(s)`}
        </button>
      </div>

      {/* Direct Push Notification */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">Push Directo</h2>
          </div>
          <button onClick={() => setShowPushForm(!showPushForm)} className="btn-ghost text-xs">
            {showPushForm ? 'Cerrar' : 'Nuevo push'}
          </button>
        </div>
        <p className="text-[11px] text-white-muted">Envia una notificacion push sin mensaje en el chat. Ideal para avisos rapidos.</p>

        {showPushForm && (
          <div className="space-y-3 pt-2 border-t border-black-border">
            <input
              type="text"
              value={pushTitle}
              onChange={e => setPushTitle(e.target.value)}
              placeholder="Titulo de la notificacion"
              className={inputClass}
            />
            <textarea
              value={pushBody}
              onChange={e => setPushBody(e.target.value)}
              placeholder="Mensaje..."
              rows={2}
              className={cn(inputClass, 'resize-none')}
            />
            <input
              type="text"
              value={pushUrl}
              onChange={e => setPushUrl(e.target.value)}
              placeholder="URL destino (opcional, ej: /gallery)"
              className={inputClass}
            />

            {/* Target selector */}
            <div>
              <label className="text-[11px] text-white-muted mb-2 block">Destinatarios</label>
              <div className="flex gap-2">
                {([
                  { key: 'all' as const, label: 'Todos' },
                  { key: 'venue' as const, label: 'Este venue' },
                  { key: 'events' as const, label: 'Grupos seleccionados' },
                ]).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setPushTarget(opt.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      pushTarget === opt.key
                        ? 'border-amber-400 bg-amber-400/12 text-amber-400'
                        : 'border-black-border text-white-muted hover:border-white/15'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSendDirectPush}
              disabled={!pushTitle.trim() || !pushBody.trim() || sendingPush}
              className="w-full py-2.5 rounded-xl text-sm font-medium bg-amber-500/15 border border-amber-400/30 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-40"
            >
              <Zap className="w-4 h-4 inline mr-1.5" />
              {sendingPush ? 'Enviando...' : 'Enviar push'}
            </button>
          </div>
        )}
      </div>

      {/* Templates Management */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-white">Plantillas</h2>
          <button onClick={() => setShowTemplateForm(true)} className="btn-ghost text-xs">
            <Plus className="w-3.5 h-3.5" /> Nueva
          </button>
        </div>

        {showTemplateForm && (
          <div className="card p-4 mb-3 space-y-3 border-primary/20">
            <input type="text" placeholder="Titulo de la plantilla" value={templateTitle} onChange={e => setTemplateTitle(e.target.value)} className={inputClass} />
            <textarea placeholder="Contenido" value={templateContent} onChange={e => setTemplateContent(e.target.value)} rows={3} className={cn(inputClass, 'resize-none')} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowTemplateForm(false)} className="btn-ghost text-xs">Cancelar</button>
              <button onClick={handleSaveTemplate} className="btn-primary text-xs">Guardar</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {templates.map(t => (
            <div key={t.id} className="card p-4 flex items-start gap-3">
              <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{t.title}</p>
                <p className="text-[11px] text-white-muted line-clamp-2 mt-0.5">{t.content}</p>
              </div>
              <button onClick={() => handleDeleteTemplate(t.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Broadcast History */}
      <div>
        <h2 className="text-base font-bold text-white mb-3">Historial de comunicados</h2>
        <div className="space-y-2">
          {broadcasts.map(b => {
            const targetEvents = allEvents.filter(e => b.event_ids.includes(e.id))
            return (
              <div key={b.id} className="card p-4 space-y-2">
                <p className="text-sm text-white">{b.content}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-white-muted">
                    <Users className="w-3 h-3" />
                    <span>{targetEvents.map(e => e.group_name || e.title).join(', ')}</span>
                  </div>
                  <span className="text-[10px] text-white-muted flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(b.sent_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )
          })}
          {broadcasts.length === 0 && (
            <div className="card p-8 text-center">
              <Radio className="w-8 h-8 text-white-muted mx-auto mb-2" />
              <p className="text-white-muted text-sm">No hay comunicados enviados.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
