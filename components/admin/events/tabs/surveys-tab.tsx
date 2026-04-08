'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, BarChart3, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { useAuth } from '@/lib/auth-context'

interface AdminPoll {
  id: string
  question: string
  is_active: boolean
  allow_multiple: boolean
  options: { id: string; option_text: string; votes: number }[]
  total_votes: number
}

interface SurveysTabProps {
  eventId: string
}

export function SurveysTab({ eventId }: SurveysTabProps) {
  const { profile } = useAuth()
  const { error: showError, success } = useToast()
  const [polls, setPolls] = useState<AdminPoll[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newOptions, setNewOptions] = useState(['', ''])
  const [newMultiple, setNewMultiple] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchPolls() }, [eventId])

  const fetchPolls = async () => {
    setLoading(true)
    const { data: pollsData } = await supabase
      .from('polls')
      .select('id, question, is_active, allow_multiple')
      .eq('event_id', eventId)
      .eq('poll_type', 'survey')
      .order('created_at', { ascending: false })

    if (!pollsData) { setLoading(false); return }

    const enriched: AdminPoll[] = await Promise.all(
      pollsData.map(async poll => {
        const { data: options } = await supabase.from('poll_options').select('id, option_text').eq('poll_id', poll.id)
        const { data: votes } = await supabase.from('poll_votes').select('poll_option_id').eq('poll_id', poll.id)
        const voteCounts: Record<string, number> = {}
        votes?.forEach(v => { voteCounts[v.poll_option_id] = (voteCounts[v.poll_option_id] || 0) + 1 })
        return {
          ...poll,
          options: (options || []).map(o => ({ ...o, votes: voteCounts[o.id] || 0 })),
          total_votes: votes?.length || 0,
        }
      })
    )
    setPolls(enriched)
    setLoading(false)
  }

  const handleCreate = async () => {
    if (!newQuestion || !profile?.id) return
    const validOptions = newOptions.filter(o => o.trim())
    if (validOptions.length < 2) { showError('Minimo 2 opciones'); return }

    setCreating(true)
    const { data: poll, error } = await supabase
      .from('polls')
      .insert({ event_id: eventId, question: newQuestion, poll_type: 'survey', allow_multiple: newMultiple, created_by: profile.id })
      .select('id')
      .single()

    if (poll && !error) {
      await supabase.from('poll_options').insert(validOptions.map(text => ({ poll_id: poll.id, option_text: text.trim() })))
    }

    success('Encuesta creada')
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

  if (loading) return <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />)}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white font-medium">{polls.length} encuestas</span>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary text-xs px-3 py-1.5">
          <Plus className="w-3 h-3" /> Nueva
        </button>
      </div>

      {showCreate && (
        <div className="p-4 rounded-xl border border-primary/20 bg-white/[0.02] space-y-3">
          <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Pregunta..." className="w-full px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40" />
          <div className="space-y-2">
            {newOptions.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={opt} onChange={e => { const copy = [...newOptions]; copy[i] = e.target.value; setNewOptions(copy) }} placeholder={`Opcion ${i + 1}`} className="flex-1 px-3 py-2 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40" />
                {newOptions.length > 2 && <button onClick={() => setNewOptions(newOptions.filter((_, j) => j !== i))} className="p-2 text-red-400"><Trash2 className="w-3 h-3" /></button>}
              </div>
            ))}
            <button onClick={() => setNewOptions([...newOptions, ''])} className="text-xs text-primary">+ Opcion</button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <button onClick={() => setNewMultiple(!newMultiple)} className="text-white-muted">
              {newMultiple ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <span className="text-xs text-white">Multiples respuestas</span>
          </label>
          <button onClick={handleCreate} disabled={creating || !newQuestion} className="btn-primary w-full py-2 text-sm">{creating ? 'Creando...' : 'Crear encuesta'}</button>
        </div>
      )}

      {polls.length === 0 ? (
        <div className="py-8 text-center">
          <BarChart3 className="w-8 h-8 text-white-muted mx-auto mb-2" />
          <p className="text-white-muted text-sm">No hay encuestas</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {polls.map(poll => (
            <div key={poll.id} className="p-4 rounded-xl border border-black-border bg-white/[0.02] space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex-1">{poll.question}</h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(poll.id, poll.is_active)} className="p-1 rounded-lg hover:bg-white/5">
                    {poll.is_active ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-white-muted" />}
                  </button>
                  <button onClick={() => deletePoll(poll.id)} className="p-1 rounded-lg hover:bg-red-500/10 text-white-muted hover:text-red-400">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {poll.options.map(opt => {
                  const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0
                  return (
                    <div key={opt.id} className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-primary/20 rounded-lg" style={{ width: `${pct}%` }} />
                        <span className="relative text-xs text-white px-2 leading-6">{opt.option_text}</span>
                      </div>
                      <span className="text-[10px] text-white-muted w-8 text-right">{pct}%</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] text-white-muted">
                <span>{poll.total_votes} votos</span>
                <span className={poll.is_active ? 'text-emerald-400' : ''}>{poll.is_active ? 'Activa' : 'Inactiva'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
