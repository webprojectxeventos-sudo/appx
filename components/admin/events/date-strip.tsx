'use client'

import { useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateStripProps {
  dates: string[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onAddDate: () => void
  onDeleteDate?: (date: string) => void
  eventCounts: Record<string, number>
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function DateStrip({ dates, selectedDate, onSelect, onAddDate, onDeleteDate, eventCounts }: DateStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [selectedDate])

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {dates.map((date) => {
        const isActive = date === selectedDate
        const count = eventCounts[date] || 0
        return (
          <div key={date} className="relative group/date shrink-0">
            <button
              ref={isActive ? activeRef : null}
              onClick={() => onSelect(date)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'border border-black-border text-white-muted hover:border-white/20 hover:text-white'
              )}
            >
              <span className="capitalize">{formatDateLabel(date)}</span>
              {count > 0 && (
                <span className={cn(
                  'text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-white/20' : 'bg-white/5'
                )}>
                  {count}
                </span>
              )}
            </button>
            {onDeleteDate && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteDate(date) }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover/date:opacity-100 transition-opacity hover:bg-red-500 shadow-lg"
                title="Eliminar fecha"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={onAddDate}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-dashed border-black-border text-white-muted hover:border-primary/40 hover:text-primary transition-all shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        Fecha
      </button>
    </div>
  )
}
