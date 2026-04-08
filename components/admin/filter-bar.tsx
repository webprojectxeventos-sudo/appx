'use client'

import { cn } from '@/lib/utils'

interface Filter {
  key: string
  label: string
  count?: number
}

interface FilterBarProps {
  filters: Filter[]
  activeFilter: string
  onFilterChange: (key: string) => void
  className?: string
}

export function FilterBar({ filters, activeFilter, onFilterChange, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onFilterChange(f.key)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
            activeFilter === f.key
              ? 'border-primary bg-primary/12 text-primary'
              : 'border-black-border text-white-muted hover:border-white/15'
          )}
        >
          {f.label}
          {f.count !== undefined && (
            <span className="ml-1.5 opacity-60">({f.count})</span>
          )}
        </button>
      ))}
    </div>
  )
}
