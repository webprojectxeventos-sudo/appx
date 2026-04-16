'use client'

import { cn } from '@/lib/utils'
import type { DayGroup } from './scanner-types'

interface EventDayGroupsProps {
  eventsByDay: DayGroup[]
  selectedId: string
  onSelect: (id: string) => void
  /** Show "Todos los grupos" reset button (used in list tab filter) */
  showAll?: boolean
  totalCount?: number
}

export function EventDayGroups({
  eventsByDay,
  selectedId,
  onSelect,
  showAll,
  totalCount,
}: EventDayGroupsProps) {
  if (eventsByDay.length === 0) return null

  return (
    <div className="space-y-2">
      {showAll && (
        <button
          onClick={() => onSelect('all')}
          className={cn(
            'w-full px-3 py-2 rounded-lg text-[11px] font-medium transition-all text-center',
            selectedId === 'all'
              ? 'bg-primary/15 text-primary border border-primary/20'
              : 'bg-white/5 text-white-muted border border-transparent',
          )}
        >
          Todos los grupos{totalCount != null ? ` (${totalCount})` : ''}
        </button>
      )}
      <div className="space-y-2.5">
        {eventsByDay.map(({ key, label, events }) => (
          <div key={key} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">
              {label}
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {events.map((ev) => {
                const name = ev.group_name || ev.title
                const time = new Date(ev.date).toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
                const selected = selectedId === ev.id
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5',
                      selected
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : 'bg-white/5 text-white-muted border border-transparent',
                    )}
                  >
                    <span className="truncate max-w-[160px]">{name}</span>
                    <span
                      className={cn(
                        'text-[10px] tabular-nums',
                        selected ? 'text-primary/70' : 'text-white/30',
                      )}
                    >
                      {time}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
