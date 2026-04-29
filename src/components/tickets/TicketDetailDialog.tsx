import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { updateTicket, type FieldChangeValue } from '@/lib/queries'
import { EditableField } from '@/components/tickets/EditableField'
import { TicketAssistView } from '@/components/tickets/TicketAssistView'
import { TicketContextSections } from '@/components/tickets/TicketContextSections'
import {
  AGENT_MODE_OPTIONS,
  ScaleSelect,
  Select,
  STATUS_OPTIONS,
  Textarea,
} from '@/components/tickets/form-helpers'
import type {
  AgentMode,
  Ticket,
  TicketType,
  TicketStatus,
  TicketUpdate,
} from '@/types/orbit'

const TYPE_LABEL: Record<TicketType, string> = {
  task: 'Task',
  research: 'Research',
  decision: 'Decision',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  admin: 'Admin',
  relationship: 'Relationship',
}

const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  none: 'None',
  assist: 'Assist',
  semi_auto: 'Semi-auto',
  auto: 'Auto',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// ISO ↔ datetime-local round-trip. The input expects local-tz "yyyy-MM-ddTHH:mm".
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(local: string): string | null {
  if (local === '') return null
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function trimOrEmpty(s: string): string {
  return s.trim()
}

function ReadOnlyField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  )
}

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Local copy seeded from the prop. We reset it only when a *different*
  // ticket is selected — same id with a new prop reference (which happens
  // after our own save triggers a list refetch) keeps our local state so
  // an in-flight optimistic update isn't clobbered. We use the render-time
  // sync pattern (set state during render based on a tracked id) rather
  // than an effect — see https://react.dev/reference/react/useState#storing-information-from-previous-renders.
  const [editing, setEditing] = useState<Ticket | null>(ticket)
  const [trackedId, setTrackedId] = useState(ticket?.id)
  if (ticket?.id !== trackedId) {
    setTrackedId(ticket?.id)
    setEditing(ticket)
  }

  async function saveField<K extends keyof Ticket>(
    field: K,
    next: FieldChangeValue,
    patch: TicketUpdate,
  ) {
    if (!editing) return
    const prev = editing
    const targetId = editing.id
    const oldValue = (editing[field] ?? null) as FieldChangeValue
    setEditing({ ...editing, ...patch } as Ticket)
    try {
      const server = await updateTicket(targetId, patch, {
        changedFields: [{ field: field as string, old: oldValue, new: next }],
      })
      // Only adopt the server result if the user hasn't switched tickets.
      setEditing((cur) => (cur && cur.id === targetId ? server : cur))
    } catch (err) {
      setEditing((cur) => (cur && cur.id === targetId ? prev : cur))
      throw err
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(820px,90vh)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-describedby={undefined}
        >
          {editing ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {TYPE_LABEL[editing.type]}
                    </span>
                    <select
                      aria-label="Status"
                      value={editing.status}
                      onChange={(e) => {
                        const next = e.target.value as TicketStatus
                        if (next === editing.status) return
                        void saveField('status', next, { status: next }).catch(
                          (err) => console.error('status update failed', err),
                        )
                      }}
                      className="h-[22px] rounded border bg-muted px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Dialog.Close
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <Dialog.Title className="sr-only">{editing.title}</Dialog.Title>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <TicketAssistView ticket={editing} />

                <EditableField<string>
                  label="Title"
                  value={editing.title}
                  serialize={(v) => v}
                  toDraft={(v) => v}
                  placeholder="Add title"
                  parse={(d) => {
                    const t = trimOrEmpty(d)
                    if (t === '') return { ok: false, error: "Title can't be empty" }
                    return { ok: true, value: t }
                  }}
                  onSave={(v) => saveField('title', v, { title: v })}
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Input
                      ref={inputRef as React.Ref<HTMLInputElement>}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                      className="text-base font-semibold"
                    />
                  )}
                />

                <EditableField<string | null>
                  label="Goal"
                  value={editing.goal}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add goal"
                  parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                  onSave={(v) => saveField('goal', v, { goal: v })}
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Input
                      ref={inputRef as React.Ref<HTMLInputElement>}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                      placeholder="Why does this matter?"
                    />
                  )}
                />

                <TicketContextSections
                  ticket={editing}
                  onTicketChange={(next) =>
                    setEditing((cur) =>
                      cur && cur.id === next.id ? next : cur,
                    )
                  }
                />

                <EditableField<string | null>
                  label="Description"
                  value={editing.description}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add description"
                  parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                  onSave={(v) =>
                    saveField('description', v, { description: v })
                  }
                  multiline
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Textarea
                      ref={inputRef as React.Ref<HTMLTextAreaElement>}
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                    />
                  )}
                />

                <EditableField<string | null>
                  label="Next action"
                  value={editing.next_action}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add next action"
                  parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                  onSave={(v) =>
                    saveField('next_action', v, { next_action: v })
                  }
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Input
                      ref={inputRef as React.Ref<HTMLInputElement>}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                      placeholder="The single concrete next step"
                    />
                  )}
                />

                <EditableField<string | null>
                  label="Next action at"
                  value={editing.next_action_at}
                  serialize={formatDate}
                  toDraft={isoToLocalInput}
                  placeholder="Add next action time"
                  parse={(d) => ({ ok: true, value: localInputToIso(d) })}
                  onSave={(v) =>
                    saveField('next_action_at', v, { next_action_at: v })
                  }
                  commitOnChange
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    commitWith,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Input
                      ref={inputRef as React.Ref<HTMLInputElement>}
                      type="datetime-local"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value)
                        commitWith(e.target.value)
                      }}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                    />
                  )}
                />

                <EditableField<string | null>
                  label="Waiting on"
                  value={editing.waiting_on}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add who/what we're waiting on"
                  parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                  onSave={(v) => saveField('waiting_on', v, { waiting_on: v })}
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Input
                      ref={inputRef as React.Ref<HTMLInputElement>}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                    />
                  )}
                />

                <EditableField<string | null>
                  label="Context"
                  value={editing.context}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add context"
                  parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                  onSave={(v) => saveField('context', v, { context: v })}
                  multiline
                  renderInput={({
                    draft,
                    setDraft,
                    onCommit,
                    onKeyDown,
                    invalid,
                    inputRef,
                  }) => (
                    <Textarea
                      ref={inputRef as React.Ref<HTMLTextAreaElement>}
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={onCommit}
                      onKeyDown={onKeyDown}
                      aria-invalid={invalid}
                    />
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <ScaleField
                    label="Urgency"
                    value={editing.urgency}
                    onSave={(v) => saveField('urgency', v, { urgency: v })}
                  />
                  <ScaleField
                    label="Importance"
                    value={editing.importance}
                    onSave={(v) =>
                      saveField('importance', v, { importance: v })
                    }
                  />
                  <ScaleField
                    label="Energy"
                    value={editing.energy_required}
                    onSave={(v) =>
                      saveField('energy_required', v, { energy_required: v })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <EditableField<AgentMode>
                    label="Agent mode"
                    value={editing.agent_mode}
                    serialize={(v) => AGENT_MODE_LABEL[v]}
                    toDraft={(v) => v}
                    placeholder="—"
                    parse={(d) => ({ ok: true, value: d as AgentMode })}
                    onSave={(v) =>
                      saveField('agent_mode', v, { agent_mode: v })
                    }
                    commitOnChange
                    renderInput={({
                      draft,
                      setDraft,
                      onCommit,
                      commitWith,
                      onKeyDown,
                      invalid,
                      inputRef,
                    }) => (
                      <Select
                        ref={inputRef as React.Ref<HTMLSelectElement>}
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value)
                          commitWith(e.target.value)
                        }}
                        onBlur={onCommit}
                        onKeyDown={onKeyDown}
                        aria-invalid={invalid}
                      >
                        {AGENT_MODE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                  <ReadOnlyField label="Agent status">
                    {editing.agent_status}
                  </ReadOnlyField>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-5 text-xs text-muted-foreground">
                  <ReadOnlyField label="Created">
                    {formatDate(editing.created_at)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Updated">
                    {formatDate(editing.updated_at)}
                  </ReadOnlyField>
                  {editing.closed_at ? (
                    <ReadOnlyField label="Closed">
                      {formatDate(editing.closed_at)}
                    </ReadOnlyField>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ScaleField({
  label,
  value,
  onSave,
}: {
  label: string
  value: number | null
  onSave: (next: number | null) => Promise<void>
}) {
  return (
    <EditableField<number | null>
      label={label}
      value={value}
      serialize={(v) => (v == null ? null : `${v}/5`)}
      toDraft={(v) => (v == null ? '' : String(v))}
      placeholder="—"
      parse={(d) => {
        if (d === '') return { ok: true, value: null }
        const n = Number(d)
        return Number.isFinite(n)
          ? { ok: true, value: n }
          : { ok: false, error: 'Invalid number' }
      }}
      onSave={onSave}
      commitOnChange
      renderInput={({
        draft,
        onCommit,
        commitWith,
        onKeyDown,
        invalid,
        inputRef,
      }) => (
        <ScaleSelect
          ref={inputRef as React.Ref<HTMLSelectElement>}
          value={draft}
          onChange={(v) => commitWith(v)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          aria-invalid={invalid}
        />
      )}
    />
  )
}
