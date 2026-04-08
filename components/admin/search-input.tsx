'use client'

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
  className?: string
}

export function SearchInput({ value, onChange, placeholder = 'Buscar...', debounceMs = 300, className }: SearchInputProps) {
  const [internal, setInternal] = useState(value)

  // Sync external value changes
  useEffect(() => { setInternal(value) }, [value])

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (internal !== value) onChange(internal)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [internal, debounceMs])

  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white-muted pointer-events-none" />
      <input
        type="text"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-black-border bg-transparent text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-primary/40 transition-colors"
      />
      {internal && (
        <button
          onClick={() => { setInternal(''); onChange('') }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white-muted" />
        </button>
      )}
    </div>
  )
}
