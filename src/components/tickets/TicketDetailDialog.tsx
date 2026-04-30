import { useState } from 'react'
import { AlertDialog, Dialog } from 'radix-ui'
import {
  Clock,
  CornerDownLeft,
  Flag,
  History,
  Trash2,
  X,
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
import { STATUS_OPTIONS } from '@/components/tickets/form-constants'
import { STATUS_META } from '@/components/tickets/status-meta'
import {
  PropertyMenu,
  PropertyPill,
  type PropertyMenuOption,
} from '@/components/tickets/PropertyPill'
import type { Ticket, TicketStatus, TicketUpdate } from '@/types/orbit'

function trimOrEmpty(s: string): string {
  return s.trim()
}

// ── Detail Dialog ─────────────────────────────────────────────────────────
//
// Three-column layout:
//   Left  — `TicketPlanRail`: vertical step rail + properties stack.
//   Centre — title, description, field rows, current-step card,
//            structured context (DoD / open questions / refs), free-form
//            context note, activity feed.
//   Right — pinned `TicketAssistPanel` (rail mode): refine flow + ask
//           follow-up. Plan is suppressed because the left rail owns it.

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [editing, setEditing] = useState<Ticket | null>(ticket)
  const [trackedId, setTrackedId] = useState(ticket?.id)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  if (ticket?.id !== trackedId) {
    setTrackedId(ticket?.id)
    setEditing(ticket)
  }

  async function handleConfirmDelete() {
    if (!editing) return
    setDeleteError(null)
    setDeleteBusy(true)
    try {
      await deleteTicket(editing.id)
      setConfirmDeleteOpen(false)
      setDeleteBusy(false)
      onOpenChange(false)
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
    if (!editing) return
    const prev = editing
    const targetId = editing.id
    const oldValue = (editing[field] ?? null) as FieldChangeValue
    setEditing({ ...editing, ...patch } as Ticket)
    try {
      const server = await updateTicket(targetId, patch, {
        changedFields: [{ field: field as string, old: oldValue, new: next }],
      })
      setEditing((cur) => (cur && cur.id === targetId ? server : cur))
    } catch (err) {
      setEditing((cur) => (cur && cur.id === targetId ? prev : cur))
      throw err
    }
  }

  const statusMeta = editing ? STATUS_META[editing.status] : null

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(880px,92vh)] w-[min(1280px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-describedby={undefined}
        >
          {editing && statusMeta ? (
            <>
              {/* ── Full-width header ─────────────────────────────────── */}
              <div className="flex shrink-0 items-center gap-3 border-b px-5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusMenu
                    value={editing.status}
                    onChange={(next) => {
                      if (next === editing.status) return
                      void saveField('status', next, { status: next }).catch(
                        (err) => console.error('status update failed', err),
                      )
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    #{editing.short_id}
                  </span>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmDeleteOpen(true)
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete ticket"
                    title="Delete ticket"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <Dialog.Close
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
              </div>

              <Dialog.Title className="sr-only">{editing.title}</Dialog.Title>

              {/* ── Body: rails + centre ─────────────────────────────── */}
              <div className="flex min-h-0 flex-1">
                {/* Left rail */}
                <TicketPlanRail
                  ticket={editing}
                  saveField={saveField}
                  onTicketChange={(next) =>
                    setEditing((cur) =>
                      cur && cur.id === next.id ? next : cur,
                    )
                  }
                />

                {/* Centre pane */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex-1 overflow-y-auto">
                  <div className="px-7 py-6">
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
                          className="h-auto border-none bg-transparent px-0 py-0 text-2xl font-semibold leading-tight shadow-none focus-visible:ring-0"
                        />
                      )}
                      readClassName="block w-full text-left text-2xl font-semibold leading-tight tracking-tight rounded-md -mx-2 px-2 py-1 hover:bg-muted/50"
                    />

                    <div className="mt-3">
                      <EditableField<string | null>
                        label=""
                        value={editing.description}
                        serialize={(v) => v}
                        toDraft={(v) => v ?? ''}
                        placeholder="Add a description…"
                        parse={(d) => ({
                          ok: true,
                          value: trimOrEmpty(d) || null,
                        })}
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
                            rows={5}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={onCommit}
                            onKeyDown={onKeyDown}
                            aria-invalid={invalid}
                            className="border-none bg-transparent px-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
                            placeholder="Add a description…"
                          />
                        )}
                        readClassName="block w-full text-left text-[15px] leading-relaxed text-foreground rounded-md -mx-2 px-2 py-1.5 hover:bg-muted/50 whitespace-pre-wrap"
                      />
                    </div>

                    <FieldRow
                      icon={Flag}
                      label="Goal"
                      placeholder="Why does this matter?"
                      value={editing.goal}
                      onSave={(v) => saveField('goal', v, { goal: v })}
                    />

                    <FieldRow
                      icon={CornerDownLeft}
                      label="Next action"
                      placeholder="The single concrete next step"
                      value={editing.next_action}
                      onSave={(v) =>
                        saveField('next_action', v, { next_action: v })
                      }
                    />

                    {(editing.status === 'waiting' || editing.waiting_on) && (
                      <FieldRow
                        icon={Clock}
                        label="Waiting on"
                        placeholder="Who or what is blocking this?"
                        value={editing.waiting_on}
                        onSave={(v) =>
                          saveField('waiting_on', v, { waiting_on: v })
                        }
                      />
                    )}

                    {/* Assist — refine flow + follow-up. Plan is suppressed
                        because the left rail owns it. */}
                    <div className="mt-6">
                      <TicketAssistPanel
                        ticket={editing}
                        onTicketChange={(next) =>
                          setEditing((cur) =>
                            cur && cur.id === next.id ? next : cur,
                          )
                        }
                        hideActions
                      />
                    </div>

                    {/* Sub-issues / open questions / references */}
                    <div className="mt-6">
                      <TicketContextSections
                        ticket={editing}
                        onTicketChange={(next) =>
                          setEditing((cur) =>
                            cur && cur.id === next.id ? next : cur,
                          )
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
                          onSave={(v) =>
                            saveField('context', v, { context: v })
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
                              className="text-sm"
                            />
                          )}
                          readClassName="block w-full text-left text-sm rounded-md -mx-1 px-1 py-1 hover:bg-muted/50 whitespace-pre-wrap"
                        />
                      </div>
                    </div>

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
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>

      {editing ? (
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
      ) : null}
    </Dialog.Root>
  )
}

// ── ConfirmDeleteDialog ──────────────────────────────────────────────────
//
// Custom destructive-action confirm. Uses radix's AlertDialog so focus,
// escape, and trap-on-modal behaviour all match the existing dialog.
// Mounted as a sibling to the detail dialog inside the same Dialog.Root,
// so closing the alert doesn't unmount the editor.

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
            <span className="font-medium text-foreground">"{title}"</span>{' '}
            and its activity, open questions, and references will be permanently
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

// ── Section primitives ────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  )
}

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

// ── Status menu ───────────────────────────────────────────────────────────

function StatusMenu({
  value,
  onChange,
}: {
  value: TicketStatus
  onChange: (next: TicketStatus) => void
}) {
  const meta = STATUS_META[value]
  const Icon = meta.icon
  const options: PropertyMenuOption<TicketStatus>[] = STATUS_OPTIONS.map(
    (o) => ({
      value: o.value,
      label: STATUS_META[o.value].label,
      icon: STATUS_META[o.value].icon,
      iconClass: STATUS_META[o.value].tone,
    }),
  )
  return (
    <PropertyPill
      icon={Icon}
      iconClass={meta.tone}
      label="Status"
      variant="inline"
      value={
        <span className={cn('font-medium', meta.pillFg)}>{meta.label}</span>
      }
      menu={
        <PropertyMenu options={options} value={value} onSelect={onChange} />
      }
    />
  )
}
