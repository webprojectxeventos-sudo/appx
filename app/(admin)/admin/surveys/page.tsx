'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAdminSelection } from '@/lib/admin-context'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, BarChart3, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

interface AdminPoll {
  id: string
  question: string
  is_active: boolean
  allow_multiple: boolean
  ends_at: string | null
  event_id: string
  options: { id: string; option_text: string; votes: number }[]
  total_votes: number
}

export default function AdminSurveysPage() {
  const { user, profile, isAdmin, initialized } = useAuth()
  const { selectedEventId: selectedEvent } = useAdminSelection()
  const { error: showError, success } = useToast()
  const [polls, setPolls] = useState<AdminPoll[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newOptions, setNewOptions] = useState(['', ''])
  const [newMultiple, setNewMultiple] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (selectedEvent) fetchPolls()
  }, [selectedEvent])

  const fetchPolls = async () => {
    setLoading(true)
    const { data: pollsData } = await supabase
      .from('polls')
      .select('id, question, is_active, allow_multiple, ends_at, event_id')
      .eq('event_id', selectedEvent!)
      .eq('poll_type', 'survey')
      .order('created_at', { ascending: false })

    if (!pollsData) { setLoading(false); return }

    const enriched: AdminPoll[] = await Promise.all(
      pollsData.map(async (poll) => {
        const { data: options } = await supabase.from('poll_options').select('id, option_text').eq('poll_id', poll.id)
        const { data: votes } = await supabase.from('poll_votes').select('poll_option_id').eq('poll_id', poll.id)

        const voteCounts: Record<string, number> = {}
        votes?.forEach((v) => { voteCounts[v.poll_option_id] = (voteCounts[v.poll_option_id] || 0) + 1 })

        return {
          ...poll,
          options: (options || []).map((o) => ({ ...o, votes: voteCounts[o.id] || 0 })),
          total_votes: votes?.length || 0,
        }
      })
    )

    setPolls(enriched)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newQuestion || !selectedEvent || !profile?.id) return
    const validOptions = newOptions.filter((o) => o.trim())
    if (validOptions.length < 2) { showError('Minimo 2 opciones'); return }

    setCreating(true)
    const { data: poll, error } = await supabase
      .from('polls')
      .insert({
        event_id: selectedEvent!,
        question: newQuestion,
        poll_type: 'survey',
        allow_multiple: newMultiple,
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (poll && !error) {
      await supabase.from('poll_options').insert(
        validOptions.map((text) => ({ poll_id: poll.id, option_text: text.trim() }))
      )
    }

    success('Encuesta creada correctamente')
    setNewQuestion('')
    setNewOptions(['', ''])
    setNewMultiple(false)
    setShowCreate(false)
    setCreating(false)
    fetchPolls()
  }

  const toggleActive = async (pollId: string, current: boolean) => {
    await supabase.from('polls').update({ is_active: !current }).eq('id', pollId)
    fetchPolls()
  }

  const deletePoll = async (pollId: string) => {
    if (!confirm('Eliminar esta encuesta?')) return
    await supabase.from('poll_votes').delete().eq('poll_id', pollId)
    await supabase.from('poll_options').delete().eq('poll_id', pollId)
    await supabase.from('polls').delete().eq('id', pollId)
    fetchPolls()
  }

  if (!initialized) return <div className="space-y-6 animate-fade-in"><div className="h-8 w-48 bg-white/5 rounded-lg animate-pulse" /><div className="card h-24 animate-pulse" /></div>
  if (!isAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Encuestas</h1>
          <p className="text-sm text-white-muted mt-0.5">Crea y gestiona encuestas para tu evento</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary px-4 py-2 text-sm">
          <Plus className="w-4 h-4" />
          Nueva
        </button>
      </div>

      {!selectedEvent && (
        <div className="card p-8 text-center">
          <p className="text-white-muted">Selecciona un instituto en la barra superior.</p>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="card p-5 space-y-4 border-primary/20">
          <h3 className="font-semibold text-white">Nueva encuesta</h3>
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Pregunta..."
            className="w-full px-4 py-3 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
          />
          <div className="space-y-2">
            {newOptions.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const copy = [...newOptions]
                    copy[i] = e.target.value
                    setNewOptions(copy)
                  }}
                  placeholder={`Opcion ${i + 1}`}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40"
                />
                {newOptions.length > 2 && (
                  <button onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setNewOptions([...newOptions, ''])} className="text-xs text-primary hover:text-primary-light">
              + Anadir opcion
            </button>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button onClick={() => setNewMultiple(!newMultiple)} className="text-white-muted">
              {newMultiple ? <ToggleRight className="w-6 h-6 text-primary" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
            <span className="text-sm text-white">Permitir multiples respuestas</span>
          </label>
          <button onClick={handleCreate} disabled={creating || !newQuestion} className="btn-primary w-full py-2.5 text-sm">
            {creating ? 'Creando...' : 'Crear encuesta'}
          </button>
        </div>
      )}

      {/* Poll List */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <div key={i} className="card p-5 h-32 animate-pulse" />)}
        </div>
      ) : polls.length === 0 ? (
        <div className="text-center py-12">
          <BarChart3 className="w-10 h-10 text-white-muted mx-auto mb-3" />
          <p className="text-white-muted">No hay encuestas para este evento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => (
            <div key={poll.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex-1">{poll.question}</h3>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleActive(poll.id, poll.is_active)} className="p-1.5 rounded-lg hover:bg-white/5">
                    {poll.is_active ? (
                      <ToggleRight className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-white-muted" />
                    )}
                  </button>
                  <button onClick={() => deletePoll(poll.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white-muted hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Results */}
              <div className="space-y-1.5">
                {poll.options.map((opt) => {
                  const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0
                  return (
                    <div key={opt.id} className="flex items-center gap-3">
                      <div className="flex-1 h-7 bg-white/5 rounded-lg overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-primary/20 rounded-lg" style={{ width: `${pct}%` }} />
                        <span className="relative text-xs text-white font-medium px-2.5 leading-7">{opt.option_text}</span>
                      </div>
                      <span className="text-xs text-white-muted tabular-nums w-10 text-right">{pct}%</span>
                      <span className="text-[10px] text-white-muted tabular-nums w-6 text-right">{opt.votes}</span>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-white-muted">
                <span>{poll.total_votes} votos</span>
                <span className={poll.is_active ? 'text-emerald-400' : 'text-white-muted'}>
                  {poll.is_active ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
