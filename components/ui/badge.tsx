import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#E41E2B] focus:ring-offset-2 focus:ring-offset-black',
  {
    variants: {
      variant: {
        default: 'border border-transparent bg-[#E41E2B] text-white hover:bg-[#C41824]',
        secondary:
          'border border-transparent bg-[#2a2a2a] text-gray-100 hover:bg-[#3a3a3a]',
        outline: 'border-2 border-[#E41E2B] bg-transparent text-[#E41E2B]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
