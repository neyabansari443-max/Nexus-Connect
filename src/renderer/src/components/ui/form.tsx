import * as React from 'react'
import { cn } from '../../lib/utils'

const Form = React.forwardRef<HTMLFormElement, React.FormHTMLAttributes<HTMLFormElement>>(({ className, ...props }, ref) => (
  <form ref={ref} className={cn('space-y-5', className)} {...props} />
))
Form.displayName = 'Form'

function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-2', className)} {...props} />
}

function FormLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-zinc-200', className)} {...props} />
}

function FormDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-zinc-500', className)} {...props} />
}

function FormMessage({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-rose-300', className)} {...props} />
}

export { Form, FormItem, FormLabel, FormDescription, FormMessage }
