import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createTicket } from '@/lib/queries'
import {
  FormField,
  ScaleSelect,
  Select,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  Textarea,
  scaleOrNull,
  trimOrNull,
} from '@/components/tickets/form-helpers'
import type { Ticket, TicketStatus, TicketType } from '@/types/orbit'

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

export type TicketCreatePrefill = Partial<{
  title: string
  description: string | null
  type: TicketType
  status: TicketStatus
  goal: string | null
  next_action: string | null
  next_action_at: string | null
  urgency: number | null
  importance: number | null
  energy_required: number | null
  context: string | null
}>

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

// ISO datetime → "yyyy-MM-ddTHH:mm" in local tz, for <input type="datetime-local">
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromPrefill(
  prefill: TicketCreatePrefill | undefined,
  defaultStatus: TicketStatus | undefined,
): FormState {
  return {
    ...EMPTY,
    status: prefill?.status ?? defaultStatus ?? 'inbox',
    title: prefill?.title ?? '',
    description: prefill?.description ?? '',
    type: prefill?.type ?? 'task',
    goal: prefill?.goal ?? '',
    next_action: prefill?.next_action ?? '',
    next_action_at: isoToLocalInput(prefill?.next_action_at),
    urgency: prefill?.urgency != null ? String(prefill.urgency) : '',
    importance: prefill?.importance != null ? String(prefill.importance) : '',
    energy_required:
      prefill?.energy_required != null ? String(prefill.energy_required) : '',
    context: prefill?.context ?? '',
  }
}

export function TicketCreateDialog({
  open,
  onOpenChange,
  onCreated,
  defaultStatus,
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (ticket: Ticket) => void
  defaultStatus?: TicketStatus
  prefill?: TicketCreatePrefill
}) {
  const [form, setForm] = useState<FormState>(() =>
    fromPrefill(prefill, defaultStatus),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setForm(fromPrefill(prefill, defaultStatus))
      setError(null)
      setSubmitting(false)
    }
  }, [open, defaultStatus, prefill])

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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,90vh)] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
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

