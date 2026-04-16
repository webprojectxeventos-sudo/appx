'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateNavigatorProps {
  dates: string[]
  selectedDate: string | null
  onSelect: (date: string) => void
  onAddDate: () => void
  onDeleteDate?: (date: string) => void
  eventCounts: Record<string, number>
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function getMonthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // Mon=0 … Sun=6
  let startDow = first.getDay() - 1
  if (startDow < 0) startDow = 6
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function DateNavigator({
  dates, selectedDate, onSelect, onAddDate, onDeleteDate, eventCounts,
}: DateNavigatorProps) {
  const todayKey = useMemo(() => {
    const n = new Date()
    return dateKey(n.getFullYear(), n.getMonth(), n.getDate())
  }, [])

  const [viewYear, setViewYear] = useState(() => {
    if (selectedDate) return Number(selectedDate.split('-')[0])
    return new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    if (selectedDate) return Number(selectedDate.split('-')[1]) - 1
    return new Date().getMonth()
  })

  // Follow selected date's month
  useEffect(() => {
    if (!selectedDate) return
    const [y, m] = selectedDate.split('-').map(Number)
    if (y !== viewYear || m - 1 !== viewMonth) {
      setViewYear(y)
      setViewMonth(m - 1)
    }
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateSet = useMemo(() => new Set(dates), [dates])
  const cells = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  // Months that contain events — for quick-jump dots
  const eventMonths = useMemo(() => {
    const set = new Set<string>()
    for (const d of dates) {
      set.add(d.slice(0, 7)) // "YYYY-MM"
    }
    return set
  }, [dates])

  const currentMonthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`

  return (
    <div className="rounded-2xl border border-black-border bg-black-card/60 p-4 max-w-md">
      {/* Row 1: Month nav + add button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-bold text-white capitalize min-w-[130px] text-center select-none">
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-white-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={onAddDate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-dashed border-black-border text-white-muted hover:border-primary/40 hover:text-primary transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Fecha
        </button>
      </div>

      {/* Row 2: Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-white-muted/50 py-1 select-none">
            {d}
          </div>
        ))}
      </div>

      {/* Row 3: Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} className="aspect-square" />

          const key = dateKey(viewYear, viewMonth, day)
          const hasEvents = dateSet.has(key)
          const isSelected = key === selectedDate
          const isToday = key === todayKey
          const count = eventCounts[key] || 0

          return (
            <div key={key} className="relative group/day flex items-center justify-center py-0.5">
              <button
                onClick={() => hasEvents && onSelect(key)}
                disabled={!hasEvents}
                className={cn(
                  'w-9 h-9 rounded-xl text-xs font-medium flex flex-col items-center justify-center transition-all relative',
                  isSelected
                    ? 'bg-primary text-white shadow-lg shadow-primary/25 scale-110'
                    : hasEvents
                      ? 'text-white hover:bg-white/[0.06] active:bg-white/10'
                      : 'text-white/15',
                  isToday && !isSelected && 'ring-1 ring-primary/40',
                )}
              >
                <span className="leading-none">{day}</span>
                {/* Event count dot */}
                {hasEvents && (
                  <span className={cn(
                    'text-[7px] font-bold leading-none mt-0.5',
                    isSelected ? 'text-white/60' : 'text-primary/60',
                  )}>
                    {count}
                  </span>
                )}
              </button>

              {/* Delete X on hover — desktop only */}
              {hasEvents && onDeleteDate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteDate(key) }}
                  className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500/90 text-white hidden md:flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity hover:bg-red-500 shadow-lg z-10"
                  title="Eliminar fecha"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Row 4: Selected date summary */}
      {selectedDate && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5 text-white-muted" />
            <span className="text-xs text-white capitalize">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
          </div>
          {(eventCounts[selectedDate] ?? 0) > 0 && (
            <span className="text-xs font-bold text-primary">
              {eventCounts[selectedDate]} grupos
            </span>
          )}
        </div>
      )}

      {/* Month dots — quick visual of which months have events */}
      {eventMonths.size > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {[...eventMonths].sort().map(mk => (
            <button
              key={mk}
              onClick={() => {
                const [y, m] = mk.split('-').map(Number)
                setViewYear(y)
                setViewMonth(m - 1)
              }}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                mk === currentMonthKey
                  ? 'bg-primary w-4'
                  : 'bg-white/20 hover:bg-white/40',
              )}
              title={new Date(Number(mk.split('-')[0]), Number(mk.split('-')[1]) - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
