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

/**
 * EventDayGroups — selector de eventos agrupados por día.
 *
 * Diseño oscuro alineado con el resto de la app:
 *   - Pill seleccionada: gradient primary/15 + border primary/45
 *   - Pill neutral: bg-white/[0.03] + border-white/[0.08] (más claro al hover)
 *   - Etiqueta de día en text-white/40 uppercase (meta-info discreta)
 *   - Hora pequeña embebida en la pill con tabular-nums para alineación
 */
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
            'w-full px-3 py-2 rounded-lg text-[11px] font-semibold transition-all text-center border',
            selectedId === 'all'
              ? 'bg-primary/15 border-primary/45 text-primary-light shadow-soft'
              : 'bg-white/[0.03] border-white/[0.08] text-white/70 hover:border-white/15 hover:bg-white/[0.05]',
          )}
        >
          Todos los grupos{totalCount != null ? ` (${totalCount})` : ''}
        </button>
      )}
      <div className="space-y-2.5">
        {eventsByDay.map(({ key, label, events }) => (
          <div key={key} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold px-1">
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
                      'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 border',
                      selected
                        ? 'bg-primary/15 border-primary/45 text-primary-light shadow-soft'
                        : 'bg-white/[0.03] border-white/[0.08] text-white/70 hover:border-white/15 hover:bg-white/[0.05]',
                    )}
                  >
                    <span className="truncate max-w-[160px]">{name}</span>
                    <span
                      className={cn(
                        'text-[10px] tabular-nums font-normal',
                        selected ? 'text-primary-light/80' : 'text-white/40',
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
