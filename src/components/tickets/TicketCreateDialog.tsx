import { useEffect, useState, type ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createTicket } from '@/lib/queries'
import type { Ticket, TicketStatus, TicketType } from '@/types/orbit'

const TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'research', label: 'Research' },
  { value: 'decision', label: 'Decision' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'admin', label: 'Admin' },
  { value: 'relationship', label: 'Relationship' },
]

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'review', label: 'Review' },
  { value: 'closed', label: 'Closed' },
  { value: 'dropped', label: 'Dropped' },
]

const SCALE_OPTIONS = [1, 2, 3, 4, 5] as const

type FormState = {
  title: string
  description: string
  type: TicketType
  status: TicketStatus
  goal: string
  next_action: string
  next_action_at: string // datetime-local string (yyyy-MM-ddTHH:mm)
  urgency: string // '' or '1'..'5'
  importance: string
  energy_required: string
  context: string
}

const EMPTY: FormState = {
  title: '',
  description: '',
  type: 'task',
  status: 'inbox',
  goal: '',
  next_action: '',
  next_action_at: '',
  urgency: '',
  importance: '',
  energy_required: '',
  context: '',
}

function trimOrNull(value: string): string | null {
  const t = value.trim()
  return t === '' ? null : t
}

function scaleOrNull(value: string): number | null {
  if (value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function TicketCreateDialog({
  open,
  onOpenChange,
  onCreated,
  defaultStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (ticket: Ticket) => void
  defaultStatus?: TicketStatus
}) {
  const [form, setForm] = useState<FormState>(() => ({
    ...EMPTY,
    status: defaultStatus ?? 'inbox',
  }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, status: defaultStatus ?? 'inbox' })
      setError(null)
      setSubmitting(false)
    }
  }, [open, defaultStatus])

  const titleValid = form.title.trim().length > 0

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titleValid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await createTicket({
        title: form.title.trim(),
        description: trimOrNull(form.description),
        type: form.type,
        status: form.status,
        goal: trimOrNull(form.goal),
        next_action: trimOrNull(form.next_action),
        next_action_at:
          form.next_action_at === ''
            ? null
            : new Date(form.next_action_at).toISOString(),
        urgency: scaleOrNull(form.urgency),
        importance: scaleOrNull(form.importance),
        energy_required: scaleOrNull(form.energy_required),
        context: trimOrNull(form.context),
      })
      onCreated?.(ticket)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-background shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
            <Dialog.Title className="text-base font-semibold leading-snug">
              New ticket
            </Dialog.Title>
            <Dialog.Close
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <FormField label="Title" required>
                <Input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  placeholder="What's the open loop?"
                />
              </FormField>

              <FormField label="Description">
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Type">
                  <Select
                    value={form.type}
                    onChange={(e) =>
                      update('type', e.target.value as TicketType)
                    }
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) =>
                      update('status', e.target.value as TicketStatus)
                    }
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>

              <FormField label="Goal">
                <Input
                  value={form.goal}
                  onChange={(e) => update('goal', e.target.value)}
                  placeholder="Why does this matter?"
                />
              </FormField>

              <FormField label="Next action">
                <Input
                  value={form.next_action}
                  onChange={(e) => update('next_action', e.target.value)}
                  placeholder="The single concrete next step"
                />
              </FormField>

              <FormField label="Next action at">
                <Input
                  type="datetime-local"
                  value={form.next_action_at}
                  onChange={(e) => update('next_action_at', e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Urgency">
                  <ScaleSelect
                    value={form.urgency}
                    onChange={(v) => update('urgency', v)}
                  />
                </FormField>
                <FormField label="Importance">
                  <ScaleSelect
                    value={form.importance}
                    onChange={(v) => update('importance', v)}
                  />
                </FormField>
                <FormField label="Energy">
                  <ScaleSelect
                    value={form.energy_required}
                    onChange={(v) => update('energy_required', v)}
                  />
                </FormField>
              </div>

              <FormField label="Context">
                <Textarea
                  rows={3}
                  value={form.context}
                  onChange={(e) => update('context', e.target.value)}
                  placeholder="Background, links, anything that helps when you come back to this."
                />
              </FormField>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={submitting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!titleValid || submitting}>
                {submitting ? 'Creating…' : 'Create ticket'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FormField({
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

function Textarea(props: React.ComponentProps<'textarea'>) {
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

function Select(props: React.ComponentProps<'select'>) {
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

function ScaleSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {SCALE_OPTIONS.map((n) => (
        <option key={n} value={String(n)}>
          {n}
        </option>
      ))}
    </Select>
  )
}
