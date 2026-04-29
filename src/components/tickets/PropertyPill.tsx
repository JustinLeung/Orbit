import { useState, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Linear-style property pill — small, icon-led, clickable. Two variants:
//   - "sidebar": full row in the right-hand properties panel
//   - "inline":  compact pill used in list rows

export type PropertyPillProps = {
  icon: LucideIcon
  iconClass?: string
  label: string
  // The "value" rendering. Pass a string for plain text, or a node for
  // richer content (icon + label).
  value?: ReactNode
  placeholder?: string
  variant?: 'sidebar' | 'inline'
  // The popover content (usually <PropertyMenu>). When omitted the pill is
  // non-interactive (read-only).
  menu?: ReactNode
  disabled?: boolean
}

export function PropertyPill({
  icon: Icon,
  iconClass,
  label,
  value,
  placeholder,
  variant = 'sidebar',
  menu,
  disabled,
}: PropertyPillProps) {
  const [open, setOpen] = useState(false)

  // Decide what to render in the value slot:
  //   - undefined + placeholder → muted placeholder
  //   - undefined + no placeholder → nothing (icon-only)
  //   - null → muted "—"
  //   - anything else → as-is
  const display: ReactNode | null =
    value !== undefined
      ? value === null
        ? (
            <span className="text-muted-foreground">
              {placeholder ?? '—'}
            </span>
          )
        : value
      : placeholder
        ? <span className="text-muted-foreground">{placeholder}</span>
        : null

  if (variant === 'inline') {
    const trigger = (
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-transparent px-1.5 text-xs text-muted-foreground transition-colors',
          'hover:border-border hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          'aria-expanded:border-border aria-expanded:bg-muted aria-expanded:text-foreground',
          disabled && 'pointer-events-none opacity-60',
        )}
        aria-label={label}
      >
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconClass)} aria-hidden />
        {display !== null ? (
          <span className="min-w-0 truncate">{display}</span>
        ) : null}
      </button>
    )
    if (!menu) return trigger
    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
        <PropertyPopoverContent>{menu}</PropertyPopoverContent>
      </Popover.Root>
    )
  }

  // Sidebar variant: a full row, label on the left, value on the right.
  const trigger = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors',
        'hover:border-border hover:bg-muted',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'aria-expanded:border-border aria-expanded:bg-muted',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
        <Icon className={cn('h-4 w-4 shrink-0', iconClass)} aria-hidden />
        <span className="truncate text-xs">{label}</span>
      </span>
      <span className="min-w-0 truncate text-right text-sm">{display}</span>
    </button>
  )
  if (!menu) return trigger
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <PropertyPopoverContent>{menu}</PropertyPopoverContent>
    </Popover.Root>
  )
}

function PropertyPopoverContent({ children }: { children: ReactNode }) {
  return (
    <Popover.Portal>
      <Popover.Content
        align="start"
        sideOffset={4}
        className={cn(
          'z-[60] w-56 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
        )}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  )
}

// ── PropertyMenu ──────────────────────────────────────────────────────────
//
// A keyboard-friendly list of options used inside a PropertyPill popover.
// Each option renders as a row with optional icon + check mark on the
// currently-selected value.

export type PropertyMenuOption<T> = {
  value: T
  label: string
  icon?: LucideIcon
  iconClass?: string
}

export function PropertyMenu<T extends string | number>({
  options,
  value,
  onSelect,
}: {
  options: ReadonlyArray<PropertyMenuOption<T>>
  value: T | null
  onSelect: (next: T) => void
}) {
  return (
    <ul role="listbox" className="space-y-px">
      {options.map((opt) => {
        const Icon = opt.icon
        const selected = opt.value === value
        return (
          <li key={String(opt.value)}>
            <Popover.Close asChild>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  'hover:bg-muted focus-visible:outline-none focus-visible:bg-muted',
                )}
              >
                {Icon ? (
                  <Icon
                    className={cn('h-4 w-4 shrink-0', opt.iconClass)}
                    aria-hidden
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="flex-1 truncate">{opt.label}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                ) : null}
              </button>
            </Popover.Close>
          </li>
        )
      })}
    </ul>
  )
}
