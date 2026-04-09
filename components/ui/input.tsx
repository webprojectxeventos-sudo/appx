import * as React from 'react'

import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border-2 border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-base text-white placeholder:text-gray-500 transition-colors focus:border-[#E41E2B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E41E2B] focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
