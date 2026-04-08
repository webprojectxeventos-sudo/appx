'use client'

import { useState, useRef } from 'react'
import { Plus, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/toast'

function generateEventCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

interface QuickAddInputProps {
  venueId: string
  date: string
  eventType: 'eso' | 'fiesta'
  organizationId: string
  userId: string
  onCreated: () => void
}

export function QuickAddInput({ venueId, date, eventType, organizationId, userId, onCreated }: QuickAddInputProps) {
  const { error: showError } = useToast()
  const [value, setValue] = useState('')
  const [showCheck, setShowCheck] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    const name = value.trim()
    if (!name) return
    setLoading(true)
    const { error } = await supabase.from('events').insert({
      title: name,
      group_name: name,
      date: date + 'T00:00:00',
      venue_id: venueId,
      event_type: eventType,
      event_code: generateEventCode(),
      organization_id: organizationId,
      created_by: userId,
    })
    setLoading(false)
    if (error) {
      showError('Error al crear grupo')
      return
    }
    setValue('')
    setShowCheck(true)
    setTimeout(() => setShowCheck(false), 800)
    inputRef.current?.focus()
    onCreated()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Plus className="w-3.5 h-3.5 text-white-muted shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Nombre del grupo..."
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white-muted/40 outline-none"
        disabled={loading}
      />
      {showCheck && <Check className="w-3.5 h-3.5 text-emerald-400 animate-fade-in" />}
    </div>
  )
}
