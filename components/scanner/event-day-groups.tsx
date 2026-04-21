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
 * Diseño claro inspirado en entradas.projectxeventos.es:
 *   - Pill seleccionada: gradient blue→indigo suave + border blue-500/60
 *   - Pill neutral: bg-white/80 + border-gray-200 (transparent al hover)
 *   - Etiqueta de día en text-gray-400 uppercase (meta-info discreta)
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
              ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-500/60 text-blue-700 shadow-soft'
              : 'bg-white/80 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-white',
          )}
        >
          Todos los grupos{totalCount != null ? ` (${totalCount})` : ''}
        </button>
      )}
      <div className="space-y-2.5">
        {eventsByDay.map(({ key, label, events }) => (
          <div key={key} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold px-1">
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
                        ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-500/60 text-blue-700 shadow-soft'
                        : 'bg-white/80 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-white',
                    )}
                  >
                    <span className="truncate max-w-[160px]">{name}</span>
                    <span
                      className={cn(
                        'text-[10px] tabular-nums font-normal',
                        selected ? 'text-blue-500/80' : 'text-gray-400',
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
