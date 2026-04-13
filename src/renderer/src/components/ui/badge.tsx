import * as React from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'border border-indigo-400/30 bg-indigo-500/10 text-indigo-300',
  secondary: 'border border-zinc-700 bg-zinc-800/80 text-zinc-300',
  success: 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  warning: 'border border-amber-400/30 bg-amber-500/10 text-amber-300',
  danger: 'border border-rose-400/30 bg-rose-500/10 text-rose-300',
  outline: 'border border-zinc-700 text-zinc-300'
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
