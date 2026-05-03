import { useState } from 'react'
import { AlertDialog } from 'radix-ui'
import {
  CalendarClock,
  Clock,
  CornerDownLeft,
  Flag,
  History,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  deleteTicket,
  updateTicket,
  type FieldChangeValue,
} from '@/lib/queries'
import { EditableField } from '@/components/tickets/EditableField'
import { TicketAssistPanel } from '@/components/tickets/TicketAssistPanel'
import { TicketContextSections } from '@/components/tickets/TicketContextSections'
import {
  TicketActivity,
  TicketNoteComposer,
} from '@/components/tickets/TicketActivity'
import { Textarea } from '@/components/tickets/form-helpers'
import { TicketPlanRail } from '@/components/tickets/TicketPlanRail'
import {
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  SCALE_OPTIONS,
} from '@/components/tickets/form-constants'
import {
  STATUS_META,
  TYPE_META,
  urgencyMeta,
} from '@/components/tickets/status-meta'
import {
  PropertyMenu,
  PropertyPill,
  type PropertyMenuOption,
} from '@/components/tickets/PropertyPill'
import type {
  Ticket,
  TicketStatus,
  TicketType,
  TicketUpdate,
} from '@/types/orbit'

function trimOrEmpty(s: string): string {
  return s.trim()
}

// Non-modal ticket detail view. Replaces the dialog-based UI: the body
// now lives directly inside a route, with a tab strip + jump-to-loop bar
// rendered above us by `LoopPage`. Layout:
//
//   center column        — title + meta row + next action +
//                          horizontal property strip + assist + context
//                          + activity (scrolls)
//   right plan rail      — collapsible; numbered timeline + progress +
//                          stamps footer

export function TicketDetailView({
  ticket: initial,
  planCollapsed,
  onAfterDelete,
}: {
  ticket: Ticket
  planCollapsed: boolean
  onAfterDelete: () => void
}) {
  const [editing, setEditing] = useState<Ticket>(initial)
  const [trackedId, setTrackedId] = useState(initial.id)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // When the route param changes to a different ticket, re-seed local
  // editing state. Same render-time pattern as the legacy dialog used.
  if (initial.id !== trackedId) {
    setTrackedId(initial.id)
    setEditing(initial)
  }

  async function handleConfirmDelete() {
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      await deleteTicket(editing.id)
      setConfirmDeleteOpen(false)
      setDeleteBusy(false)
      onAfterDelete()
    } catch (err) {
      console.error('delete ticket failed', err)
      setDeleteError(err instanceof Error ? err.message : String(err))
      setDeleteBusy(false)
    }
  }

  async function saveField<K extends keyof Ticket>(
    field: K,
    next: FieldChangeValue,
    patch: TicketUpdate,
  ) {
    const prev = editing
    const targetId = editing.id
    const oldValue = (editing[field] ?? null) as FieldChangeValue
    setEditing({ ...editing, ...patch } as Ticket)
    try {
      const server = await updateTicket(targetId, patch, {
        changedFields: [{ field: field as string, old: oldValue, new: next }],
      })
      setEditing((cur) => (cur.id === targetId ? server : cur))
    } catch (err) {
      setEditing((cur) => (cur.id === targetId ? prev : cur))
      throw err
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Body — center column ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[760px] px-8 py-7">
            <TicketHero
              ticket={editing}
              saveField={saveField}
              onDelete={() => {
                setDeleteError(null)
                setConfirmDeleteOpen(true)
              }}
            />

            {/* Title — large, inline-editable, no chrome */}
            <div className="mt-2.5">
              <EditableField<string>
                label=""
                value={editing.title}
                serialize={(v) => v}
                toDraft={(v) => v}
                placeholder="Untitled loop"
                parse={(d) => {
                  const t = trimOrEmpty(d)
                  if (t === '')
                    return { ok: false, error: "Title can't be empty" }
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
                    className="h-auto border-none bg-transparent px-0 py-0 text-[22px] font-semibold leading-tight tracking-tight shadow-none focus-visible:ring-0"
                  />
                )}
                readClassName="block w-full text-left text-[22px] font-semibold leading-tight tracking-tight rounded-md -mx-2 px-2 py-1 hover:bg-muted/50"
              />
            </div>

            {/* Description */}
            <div className="mt-1">
              <EditableField<string | null>
                label=""
                value={editing.description}
                serialize={(v) => v}
                toDraft={(v) => v ?? ''}
                placeholder="Add a description…"
                parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
                onSave={(v) => saveField('description', v, { description: v })}
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
                    rows={4}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={onCommit}
                    onKeyDown={onKeyDown}
                    aria-invalid={invalid}
                    className="border-none bg-transparent px-0 text-[13px] leading-relaxed text-muted-foreground shadow-none focus-visible:ring-0"
                    placeholder="Add a description…"
                  />
                )}
                readClassName="block w-full text-left text-[13px] leading-relaxed text-muted-foreground rounded-md -mx-2 px-2 py-1 hover:bg-muted/50 whitespace-pre-wrap"
              />
            </div>

            {/* Next action — high-prominence row, like the design */}
            <NextActionRow
              ticket={editing}
              onSave={(v) => saveField('next_action', v, { next_action: v })}
            />

            {/* Horizontal property strip — replaces the right-hand
                properties sidebar from the legacy dialog. Status / Type
                stay in the hero meta row above. */}
            <PropertyStrip ticket={editing} saveField={saveField} />

            {/* Goal + (conditional) Waiting on field rows */}
            <FieldRow
              icon={Flag}
              label="Goal"
              placeholder="Why does this matter?"
              value={editing.goal}
              onSave={(v) => saveField('goal', v, { goal: v })}
            />
            {(editing.status === 'waiting' || editing.waiting_on) && (
              <FieldRow
                icon={Clock}
                label="Waiting on"
                placeholder="Who or what is blocking this?"
                value={editing.waiting_on}
                onSave={(v) => saveField('waiting_on', v, { waiting_on: v })}
              />
            )}

            {/* Per-phase assist surface (planning, doing, …) — the rail
                already shows the plan visualization, so the panel here
                runs in `hideActions`-equivalent mode. */}
            <div className="mt-6">
              <TicketAssistPanel
                ticket={editing}
                onTicketChange={(next) =>
                  setEditing((cur) => (cur.id === next.id ? next : cur))
                }
              />
            </div>

            {/* DoD checklist / open questions / references */}
            <div className="mt-6">
              <TicketContextSections
                ticket={editing}
                onTicketChange={(next) =>
                  setEditing((cur) => (cur.id === next.id ? next : cur))
                }
              />
            </div>

            {/* Free-form context note */}
            <div className="mt-6">
              <SectionLabel>Context</SectionLabel>
              <div className="mt-1.5">
                <EditableField<string | null>
                  label=""
                  value={editing.context}
                  serialize={(v) => v}
                  toDraft={(v) => v ?? ''}
                  placeholder="Add background, links, prior decisions…"
                  parse={(d) => ({
                    ok: true,
                    value: trimOrEmpty(d) || null,
                  })}
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
                      className="text-sm"
                    />
                  )}
                  readClassName="block w-full text-left text-sm rounded-md -mx-1 px-1 py-1 hover:bg-muted/50 whitespace-pre-wrap"
                />
              </div>
            </div>

            {/* Activity timeline + note composer */}
            <div className="mt-8 border-t pt-5">
              <div className="mb-3 flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <SectionLabel>Activity</SectionLabel>
              </div>
              <TicketNoteComposer ticketId={editing.id} />
              <TicketActivity ticketId={editing.id} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Plan rail — RIGHT, collapsible ───────────────────────── */}
      {!planCollapsed ? (
        <TicketPlanRail
          ticket={editing}
          saveField={saveField}
          variant="detail"
        />
      ) : null}

      <ConfirmDeleteDialog
        open={confirmDeleteOpen}
        onOpenChange={(next) => {
          if (deleteBusy) return
          setConfirmDeleteOpen(next)
          if (!next) setDeleteError(null)
        }}
        title={editing.title}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  )
}

// ── Hero meta row + delete button ──────────────────────────────────────
//
// The design's hero is a tight inline strip: status (clickable),
// "·", type (clickable), "·", #id, "·", due. We keep the same shape but
// add a delete button at the right edge so the action survives the
// dialog → page transition.

function TicketHero({
  ticket,
  saveField,
  onDelete,
}: {
  ticket: Ticket
  saveField: <K extends keyof Ticket>(
    field: K,
    next: FieldChangeValue,
    patch: TicketUpdate,
  ) => Promise<void>
  onDelete: () => void
}) {
  const statusMeta = STATUS_META[ticket.status]
  const typeMeta = TYPE_META[ticket.type]

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <PropertyPill
        icon={statusMeta.icon}
        iconClass={statusMeta.tone}
        label="Status"
        variant="inline"
        value={
          <span className={cn('font-medium', statusMeta.pillFg)}>
            {statusMeta.label}
          </span>
        }
        menu={
          <PropertyMenu
            options={STATUS_OPTIONS.map<PropertyMenuOption<TicketStatus>>(
              (o) => ({
                value: o.value,
                label: STATUS_META[o.value].label,
                icon: STATUS_META[o.value].icon,
                iconClass: STATUS_META[o.value].tone,
              }),
            )}
            value={ticket.status}
            onSelect={(next) => {
              if (next === ticket.status) return
              void saveField('status', next, { status: next }).catch((err) =>
                console.error('status update failed', err),
              )
            }}
          />
        }
      />
      <span className="text-muted-foreground/60">·</span>
      <PropertyPill
        icon={typeMeta.icon}
        iconClass={typeMeta.tone}
        label="Type"
        variant="inline"
        value={typeMeta.label}
        menu={
          <PropertyMenu
            options={TYPE_OPTIONS.map<PropertyMenuOption<TicketType>>((o) => ({
              value: o.value,
              label: TYPE_META[o.value].label,
              icon: TYPE_META[o.value].icon,
              iconClass: TYPE_META[o.value].tone,
            }))}
            value={ticket.type}
            onSelect={(next) => {
              if (next === ticket.type) return
              void saveField('type', next, { type: next }).catch((err) =>
                console.error('type update failed', err),
              )
            }}
          />
        }
      />
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums">#{ticket.short_id}</span>
      {ticket.next_action_at ? (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            Due {formatDueShort(ticket.next_action_at)}
          </span>
        </>
      ) : null}
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete ticket"
        title="Delete ticket"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── PropertyStrip — horizontal pill row ────────────────────────────────
//
// Replaces the right-hand sidebar's properties stack in the dialog.
// Inline-editable: each pill opens its own popover. Priority maps to
// `urgency`; Energy maps to `energy_required`.

function PropertyStrip({
  ticket,
  saveField,
}: {
  ticket: Ticket
  saveField: <K extends keyof Ticket>(
    field: K,
    next: FieldChangeValue,
    patch: TicketUpdate,
  ) => Promise<void>
}) {
  const urgency = urgencyMeta(ticket.urgency)
  const importance = urgencyMeta(ticket.importance)
  const energy = urgencyMeta(ticket.energy_required)

  const scaleOptions = (
    kind: 'urgency' | 'importance' | 'energy',
  ): PropertyMenuOption<number>[] => [
    { value: 0, label: 'No value' },
    ...SCALE_OPTIONS.map((n) => ({
      value: n,
      label:
        kind === 'energy'
          ? n <= 2
            ? `${n}/5 · Light`
            : n >= 4
              ? `${n}/5 · Heavy`
              : `${n}/5 · Medium`
          : n <= 2
            ? `${n}/5 · Low`
            : n >= 4
              ? `${n}/5 · High`
              : `${n}/5 · Medium`,
    })),
  ]

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <PropertyPill
        icon={urgency.icon}
        iconClass={urgency.tone}
        label="Priority"
        variant="inline"
        value={ticket.urgency != null ? urgency.label : undefined}
        placeholder="—"
        menu={
          <PropertyMenu
            options={scaleOptions('urgency')}
            value={ticket.urgency ?? 0}
            onSelect={(next) => {
              const v = next === 0 ? null : next
              void saveField('urgency', v, { urgency: v }).catch((err) =>
                console.error('urgency update failed', err),
              )
            }}
          />
        }
      />
      <PropertyPill
        icon={importance.icon}
        iconClass={importance.tone}
        label="Importance"
        variant="inline"
        value={
          ticket.importance != null ? `${ticket.importance}/5` : undefined
        }
        placeholder="—"
        menu={
          <PropertyMenu
            options={scaleOptions('importance')}
            value={ticket.importance ?? 0}
            onSelect={(next) => {
              const v = next === 0 ? null : next
              void saveField('importance', v, { importance: v }).catch((err) =>
                console.error('importance update failed', err),
              )
            }}
          />
        }
      />
      <PropertyPill
        icon={energy.icon}
        iconClass={energy.tone}
        label="Energy"
        variant="inline"
        value={
          ticket.energy_required != null
            ? `${ticket.energy_required}/5`
            : undefined
        }
        placeholder="—"
        menu={
          <PropertyMenu
            options={scaleOptions('energy')}
            value={ticket.energy_required ?? 0}
            onSelect={(next) => {
              const v = next === 0 ? null : next
              void saveField('energy_required', v, {
                energy_required: v,
              }).catch((err) =>
                console.error('energy update failed', err),
              )
            }}
          />
        }
      />
      <DuePill ticket={ticket} saveField={saveField} />
      <PropertyPill
        icon={Sparkles}
        iconClass="text-muted-foreground"
        label="Assist"
        variant="inline"
        value={ticket.agent_status ?? 'idle'}
      />
    </div>
  )
}

function DuePill({
  ticket,
  saveField,
}: {
  ticket: Ticket
  saveField: <K extends keyof Ticket>(
    field: K,
    next: FieldChangeValue,
    patch: TicketUpdate,
  ) => Promise<void>
}) {
  // The pill's read-mode value displays a short formatted date; clicking
  // opens a popover with a single datetime-local input. Mirrors the
  // schedule row in the dialog's PropertiesPanel without dragging the
  // whole `<DateRow>` over (that one is sidebar-styled).
  const display =
    ticket.next_action_at != null
      ? formatDueShort(ticket.next_action_at)
      : undefined
  return (
    <PropertyPill
      icon={CalendarClock}
      iconClass="text-muted-foreground"
      label="Due"
      variant="inline"
      value={display}
      placeholder="—"
      menu={
        <DueMenu
          value={ticket.next_action_at}
          onSave={(v) =>
            saveField('next_action_at', v, { next_action_at: v })
          }
        />
      }
    />
  )
}

function DueMenu({
  value,
  onSave,
}: {
  value: string | null
  onSave: (next: string | null) => Promise<void>
}) {
  const [draft, setDraft] = useState<string>(isoToLocalInput(value))
  return (
    <div className="px-1 pb-1 pt-0.5">
      <input
        type="datetime-local"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const iso = localInputToIso(e.target.value)
          void onSave(iso).catch((err) =>
            console.error('next_action_at update failed', err),
          )
        }}
        className="h-7 w-full rounded-md border bg-background px-2 text-xs"
      />
      <button
        type="button"
        onClick={() => {
          setDraft('')
          void onSave(null).catch((err) =>
            console.error('next_action_at clear failed', err),
          )
        }}
        className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
      >
        Clear
      </button>
    </div>
  )
}

// ── Next action — featured row ─────────────────────────────────────────

function NextActionRow({
  ticket,
  onSave,
}: {
  ticket: Ticket
  onSave: (next: string | null) => Promise<void>
}) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
      <CornerDownLeft className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Next action
        </div>
        <div className="mt-0.5">
          <EditableField<string | null>
            label=""
            value={ticket.next_action}
            serialize={(v) => v}
            toDraft={(v) => v ?? ''}
            placeholder="The single concrete next step"
            parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
            onSave={onSave}
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
                className="h-7 text-[13px]"
                placeholder="The single concrete next step"
              />
            )}
            readClassName="block w-full text-left text-[13px] font-medium text-foreground rounded-md -mx-1 px-1 py-0.5 hover:bg-background"
          />
        </div>
      </div>
    </div>
  )
}

// ── Field row (Goal / Waiting on) ──────────────────────────────────────

function FieldRow({
  icon: Icon,
  label,
  placeholder,
  value,
  onSave,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  placeholder: string
  value: string | null
  onSave: (next: string | null) => Promise<void>
}) {
  return (
    <div className="mt-4 flex items-start gap-3">
      <div className="flex w-28 shrink-0 items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">
        <EditableField<string | null>
          label=""
          value={value}
          serialize={(v) => v}
          toDraft={(v) => v ?? ''}
          placeholder={placeholder}
          parse={(d) => ({ ok: true, value: trimOrEmpty(d) || null })}
          onSave={onSave}
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
              className="h-7 text-sm"
              placeholder={placeholder}
            />
          )}
          readClassName="block w-full text-left text-sm text-foreground rounded-md -mx-1 px-1 py-1 hover:bg-muted/50"
        />
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  )
}

// ── ConfirmDeleteDialog ────────────────────────────────────────────────
//
// Same destructive-confirm shape as the legacy dialog. Lives outside
// the Dialog.Root tree now, so it's just a top-level AlertDialog.

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  busy,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  busy: boolean
  error: string | null
  onConfirm: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <AlertDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[70] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          <AlertDialog.Title className="text-base font-semibold">
            Delete this ticket?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">"{title}"</span> and
            its activity, open questions, and references will be permanently
            removed. This can't be undone.
          </AlertDialog.Description>
          {error ? (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <AlertDialog.Cancel
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
              disabled={busy}
            >
              Cancel
            </AlertDialog.Cancel>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete ticket'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

// ── Date helpers — duplicated from `TicketPlanRail`. The rail's helpers
// aren't exported and live behind a sidebar-styled DateRow component;
// we want a different presentation here (popover + short label), so
// re-implementing the trio is cheaper than refactoring the rail's
// internals. Keep both in sync if formatting changes.

function formatDueShort(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

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
