import { useState } from 'react'
import { Popover } from 'radix-ui'
import {
  CalendarDays,
  Check,
  DollarSign,
  Gauge,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  EMPTY_CONSTRAINTS,
  applyConstraints,
  extractConstraints,
  type ConstraintEffort,
  type Constraints,
} from '@/lib/contextConstraints'
import { updateTicket, type FieldChangeValue } from '@/lib/queries'
import type { Ticket } from '@/types/orbit'

// Constraint pills (Budget / Deadline / People / Effort) — a horizontal
// row above the plan rail's phase list. Tapping a pill opens a small
// popover with a kind-appropriate input. Values compile into the
// ticket's `context` field via a stable marker block (see
// contextConstraints.ts) so they round-trip through the model and stay
// re-editable. The pills only render on the planning surface — the
// surrounding rail decides when to show this component.

const EFFORT_OPTIONS: ConstraintEffort[] = ['S', 'M', 'L', 'XL']

const EFFORT_LABEL: Record<ConstraintEffort, string> = {
  S: 'S · light',
  M: 'M · medium',
  L: 'L · heavy',
  XL: 'XL · multi-week',
}

export function ConstraintPills({
  ticket,
  onTicketChange,
}: {
  ticket: Ticket
  onTicketChange?: (next: Ticket) => void
}) {
  const constraints = extractConstraints(ticket.context)
  const [busyKey, setBusyKey] = useState<keyof Constraints | null>(null)

  async function save<K extends keyof Constraints>(key: K, value: Constraints[K]) {
    const next: Constraints = { ...constraints, [key]: value }
    const nextContext = applyConstraints(ticket.context, next)
    if (nextContext === (ticket.context ?? null)) return
    setBusyKey(key)
    try {
      const updated = await updateTicket(
        ticket.id,
        { context: nextContext },
        {
          changedFields: [
            {
              field: 'context',
              old: (ticket.context ?? null) as FieldChangeValue,
              new: nextContext as FieldChangeValue,
            },
          ],
        },
      )
      onTicketChange?.(updated)
    } catch (err) {
      console.error('save constraint failed', err)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ConstraintPill
        icon={DollarSign}
        label="Budget"
        value={constraints.budget}
        placeholder="Budget"
        busy={busyKey === 'budget'}
        renderEditor={(close) => (
          <FreeFormEditor
            kind="text"
            initial={constraints.budget ?? ''}
            placeholder="$500, ~5k, etc."
            onCommit={async (v) => {
              await save('budget', v.trim() === '' ? null : v.trim())
              close()
            }}
            onClear={
              constraints.budget
                ? async () => {
                    await save('budget', null)
                    close()
                  }
                : undefined
            }
          />
        )}
      />
      <ConstraintPill
        icon={CalendarDays}
        label="Deadline"
        value={formatDeadline(constraints.deadline)}
        placeholder="Deadline"
        busy={busyKey === 'deadline'}
        renderEditor={(close) => (
          <FreeFormEditor
            kind="date"
            initial={constraints.deadline ?? ''}
            placeholder="YYYY-MM-DD"
            onCommit={async (v) => {
              await save('deadline', v.trim() === '' ? null : v.trim())
              close()
            }}
            onClear={
              constraints.deadline
                ? async () => {
                    await save('deadline', null)
                    close()
                  }
                : undefined
            }
          />
        )}
      />
      <ConstraintPill
        icon={Users}
        label="People"
        value={constraints.people}
        placeholder="People"
        busy={busyKey === 'people'}
        renderEditor={(close) => (
          <FreeFormEditor
            kind="text"
            initial={constraints.people ?? ''}
            placeholder="8 guests, family of 4, …"
            onCommit={async (v) => {
              await save('people', v.trim() === '' ? null : v.trim())
              close()
            }}
            onClear={
              constraints.people
                ? async () => {
                    await save('people', null)
                    close()
                  }
                : undefined
            }
          />
        )}
      />
      <ConstraintPill
        icon={Gauge}
        label="Effort"
        value={constraints.effort ? EFFORT_LABEL[constraints.effort] : null}
        placeholder="Effort"
        busy={busyKey === 'effort'}
        renderEditor={(close) => (
          <ul role="listbox" className="space-y-px">
            {EFFORT_OPTIONS.map((opt) => {
              const selected = constraints.effort === opt
              return (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={async () => {
                      await save('effort', selected ? null : opt)
                      close()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    )}
                  >
                    <span className="flex-1">{EFFORT_LABEL[opt]}</span>
                    {selected ? <Check className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      />
    </div>
  )
}

function ConstraintPill({
  icon: Icon,
  label,
  value,
  placeholder,
  busy,
  renderEditor,
}: {
  icon: LucideIcon
  label: string
  value: string | null
  placeholder: string
  busy: boolean
  renderEditor: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const filled = value !== null && value !== ''
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={busy}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            filled
              ? 'border-primary/40 bg-primary/10 text-foreground'
              : 'border-dashed border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="max-w-[140px] truncate">
            {filled ? value : placeholder}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-[60] w-64 overflow-hidden rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          )}
        >
          {renderEditor(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function FreeFormEditor({
  kind,
  initial,
  placeholder,
  onCommit,
  onClear,
}: {
  kind: 'text' | 'date'
  initial: string
  placeholder: string
  onCommit: (next: string) => Promise<void> | void
  onClear?: () => Promise<void> | void
}) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          await onCommit(draft)
        } finally {
          setBusy(false)
        }
      }}
      className="flex flex-col gap-2"
    >
      <Input
        autoFocus
        type={kind === 'date' ? 'date' : 'text'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        className="h-7 text-sm"
      />
      <div className="flex items-center justify-end gap-1.5">
        {onClear ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onClear()
              } finally {
                setBusy(false)
              }
            }}
          >
            Clear
          </Button>
        ) : null}
        <Button type="submit" size="xs" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

function formatDeadline(value: string | null): string | null {
  if (!value) return null
  // Accept ISO-style YYYY-MM-DD and render as a short human label. Fall
  // back to the raw string if it doesn't parse.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return value
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// Re-export the shared empty value so consumers don't need a separate
// import path when they just need a "nothing set" baseline.
export const EMPTY = EMPTY_CONSTRAINTS
