'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

interface DialogProps extends React.HTMLAttributes<HTMLDialogElement> {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const Dialog = React.forwardRef<HTMLDialogElement, DialogProps>(
  ({ className, open, onOpenChange, children, ...props }, ref) => {
    const dialogRef = React.useRef<HTMLDialogElement>(null)
    const finalRef = (ref as React.MutableRefObject<HTMLDialogElement | null>) || dialogRef

    React.useEffect(() => {
      const dialog = finalRef.current
      if (!dialog) return

      if (open) {
        dialog.showModal()
      } else {
        dialog.close()
      }
    }, [open, finalRef])

    const handleClose = () => {
      onOpenChange?.(false)
    }

    return (
      <dialog
        ref={finalRef}
        className={cn(
          'fixed inset-0 z-50 max-w-lg rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 text-white shadow-lg backdrop:bg-black/50',
          className,
        )}
        onClose={handleClose}
        {...props}
      >
        {children}
      </dialog>
    )
  },
)
Dialog.displayName = 'Dialog'

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-gray-400', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

export { Dialog, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
