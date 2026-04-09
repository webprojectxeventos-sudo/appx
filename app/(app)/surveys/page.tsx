'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import { BarChart3, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PollOption {
  id: string
  option_text: string
  vote_count: number
}

interface Poll {
  id: string
  question: string
  is_active: boolean
  allow_multiple: boolean
  ends_at: string | null
  options: PollOption[]
  user_votes: string[]
  total_votes: number
}

export default function SurveysPage() {
  const { user, event } = useAuth()
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState<string | null>(null)

  const eventId = event?.id
  const userId = user?.id

  const fetchPolls = useCallback(async () => {
    if (!eventId || !userId) return
    setLoading(true)

    const { data: pollsData } = await supabase
      .from('polls')
      .select('id, question, is_active, allow_multiple, ends_at')
      .eq('event_id', eventId)
      .eq('poll_type', 'survey')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (!pollsData || pollsData.length === 0) { setPolls([]); setLoading(false); return }

    // Batch queries: 3 calls instead of 3*N
    const pollIds = pollsData.map(p => p.id)
    const [optionsResult, allVotesResult] = await Promise.all([
      supabase.from('poll_options').select('id, option_text, poll_id').in('poll_id', pollIds),
      supabase.from('poll_votes').select('poll_option_id, poll_id, user_id').in('poll_id', pollIds),
    ])

    // Group options by poll
    const optionsByPoll: Record<string, { id: string; option_text: string }[]> = {}
    optionsResult.data?.forEach(o => {
      if (!optionsByPoll[o.poll_id]) optionsByPoll[o.poll_id] = []
      optionsByPoll[o.poll_id].push(o)
    })

    // Count votes and track user votes per poll
    const voteCountsByPoll: Record<string, Record<string, number>> = {}
    const totalByPoll: Record<string, number> = {}
    const userVotesByPoll: Record<string, string[]> = {}

    allVotesResult.data?.forEach(v => {
      // Vote counts
      if (!voteCountsByPoll[v.poll_id]) voteCountsByPoll[v.poll_id] = {}
      voteCountsByPoll[v.poll_id][v.poll_option_id] = (voteCountsByPoll[v.poll_id][v.poll_option_id] || 0) + 1
      totalByPoll[v.poll_id] = (totalByPoll[v.poll_id] || 0) + 1
      // User's own votes
      if (v.user_id === userId) {
        if (!userVotesByPoll[v.poll_id]) userVotesByPoll[v.poll_id] = []
        userVotesByPoll[v.poll_id].push(v.poll_option_id)
      }
    })

    const enriched: Poll[] = pollsData.map(poll => ({
      ...poll,
      options: (optionsByPoll[poll.id] || []).map(o => ({
        ...o,
        vote_count: voteCountsByPoll[poll.id]?.[o.id] || 0,
      })),
      user_votes: userVotesByPoll[poll.id] || [],
      total_votes: totalByPoll[poll.id] || 0,
    }))

    setPolls(enriched)
    setLoading(false)
  }, [eventId, userId])

  useEffect(() => { fetchPolls() }, [fetchPolls])

  useEffect(() => {
    if (!eventId) return
    const channel = supabase
      .channel(`surveys-realtime-${eventId}`)
      // poll_votes no tiene event_id — filtro server-side imposible.
      // Se filtra client-side: fetchPolls() filtra polls por event.id
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => fetchPolls())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, fetchPolls])

  const handleVote = async (pollId: string, optionId: string) => {
    if (!user?.id) return
    setVoting(optionId)

    const poll = polls.find((p) => p.id === pollId)
    if (!poll) return

    const alreadyVoted = poll.user_votes.includes(optionId)

    if (alreadyVoted) {
      await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('poll_option_id', optionId).eq('user_id', user.id)
    } else {
      if (!poll.allow_multiple && poll.user_votes.length > 0) {
        await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', user.id)
      }
      await supabase.from('poll_votes').insert({ poll_id: pollId, poll_option_id: optionId, user_id: user.id })
    }

    await fetchPolls()
    setVoting(null)
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        {[0, 1].map((i) => (
          <div key={i} className="card p-5 space-y-3">
            <div className="h-5 w-3/4 bg-white/5 rounded animate-pulse" />
            <div className="space-y-2">
              {[0, 1, 2].map((j) => <div key={j} className="h-12 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (polls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <BarChart3 className="w-10 h-10 text-white-muted mb-3" />
        <p className="text-white font-medium">No hay encuestas activas</p>
        <p className="text-white-muted text-sm mt-1">Vuelve mas tarde</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-white">Encuestas</h1>
      </div>

      {polls.map((poll) => {
        const hasVoted = poll.user_votes.length > 0
        const isExpired = poll.ends_at && new Date(poll.ends_at) < new Date()

        return (
          <div key={poll.id} className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-white flex-1">{poll.question}</h2>
              {poll.allow_multiple && (
                <span className="text-[10px] text-white-muted bg-white/5 px-2 py-0.5 rounded-full whitespace-nowrap">Multiple</span>
              )}
            </div>

            {poll.ends_at && (
              <div className="flex items-center gap-1.5 text-xs text-white-muted">
                <Clock className="w-3.5 h-3.5" />
                {isExpired ? 'Finalizada' : `Termina ${new Date(poll.ends_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
              </div>
            )}

            <div className="space-y-2">
              {poll.options.map((option) => {
                const isSelected = poll.user_votes.includes(option.id)
                const percentage = poll.total_votes > 0 ? Math.round((option.vote_count / poll.total_votes) * 100) : 0

                return (
                  <button
                    key={option.id}
                    onClick={() => !isExpired && handleVote(poll.id, option.id)}
                    disabled={!!isExpired || voting === option.id}
                    className={cn(
                      'relative w-full text-left px-4 py-3 rounded-xl border transition-all overflow-hidden active:scale-[0.98]',
                      isSelected ? 'border-primary bg-primary/8' : 'border-black-border hover:border-white/15'
                    )}
                  >
                    {hasVoted && (
                      <div
                        className={cn('absolute inset-y-0 left-0 transition-all duration-500', isSelected ? 'bg-primary/10' : 'bg-white/3')}
                        style={{ width: `${percentage}%` }}
                      />
                    )}
                    <div className="relative flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />}
                        <span className={cn('text-sm font-medium', isSelected ? 'text-primary' : 'text-white')}>{option.option_text}</span>
                      </div>
                      {hasVoted && <span className="text-xs text-white-muted tabular-nums">{percentage}%</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            <p className="text-[11px] text-white-muted text-center">
              {poll.total_votes} {poll.total_votes === 1 ? 'voto' : 'votos'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
