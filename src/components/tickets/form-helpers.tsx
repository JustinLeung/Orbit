import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SCALE_OPTIONS } from '@/components/tickets/form-constants'

export function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  )
}

export function Textarea(props: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
    />
  )
}

export function Select(props: React.ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
    />
  )
}

export function ScaleSelect({
  value,
  onChange,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
} & Omit<React.ComponentProps<'select'>, 'value' | 'onChange'>) {
  return (
    <Select
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {SCALE_OPTIONS.map((n) => (
        <option key={n} value={String(n)}>
          {n}
        </option>
      ))}
    </Select>
  )
}
