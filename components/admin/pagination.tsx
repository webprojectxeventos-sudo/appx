'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null

  // Generate page numbers: show max 5, with ellipsis
  const pages: (number | 'ellipsis')[] = []
  if (totalPages <= 5) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('ellipsis')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('ellipsis')
    pages.push(totalPages)
  }

  return (
    <div className={cn('flex items-center justify-center gap-1.5', className)}>
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white-muted hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Anterior
      </button>

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-1 text-white-muted text-xs">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              'w-8 h-8 rounded-lg text-xs font-medium transition-colors',
              currentPage === p
                ? 'bg-primary text-white'
                : 'text-white-muted hover:bg-white/5 hover:text-white'
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white-muted hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
      >
        Siguiente <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
