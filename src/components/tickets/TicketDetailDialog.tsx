import { useState } from 'react'
import { Dialog } from 'radix-ui'
import {
  CalendarClock,
  Clock,
  CornerDownLeft,
  Flag,
  History,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { updateTicket, type FieldChangeValue } from '@/lib/queries'
import { EditableField } from '@/components/tickets/EditableField'
import { TicketAssistPanel } from '@/components/tickets/TicketAssistPanel'
import { TicketContextSections } from '@/components/tickets/TicketContextSections'
import {
  TicketActivity,
  TicketNoteComposer,
} from '@/components/tickets/TicketActivity'
import { Textarea } from '@/components/tickets/form-helpers'
import {
  AGENT_MODE_OPTIONS,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
  SCALE_OPTIONS,
} from '@/components/tickets/form-constants'
import {
  AGENT_MODE_META,
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
  AgentMode,
  Ticket,
  TicketType,
  TicketStatus,
  TicketUpdate,
} from '@/types/orbit'

// ── Date helpers ──────────────────────────────────────────────────────────

function formatDateLong(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDateShort(iso: string | null) {
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

function trimOrEmpty(s: string): string {
  return s.trim()
}

// ── Detail Dialog ─────────────────────────────────────────────────────────

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
  const [propertiesOpen, setPropertiesOpen] = useState(true)
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
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(880px,92vh)] w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-describedby={undefined}
        >
          {editing && statusMeta ? (
            <>
              {/* ── Main pane ─────────────────────────────────────────── */}
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b px-5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusMenu
                      value={editing.status}
                      onChange={(next) => {
                        if (next === editing.status) return
                        void saveField('status', next, { status: next }).catch(
                          (err) =>
                            console.error('status update failed', err),
                        )
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      #{editing.short_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPropertiesOpen((v) => !v)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={
                        propertiesOpen
                          ? 'Hide properties'
                          : 'Show properties'
                      }
                    >
                      {propertiesOpen ? (
                        <PanelRightClose className="h-4 w-4" />
                      ) : (
                        <PanelRightOpen className="h-4 w-4" />
                      )}
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

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-2xl px-8 py-6">
                    {/* Title — no label, large editable heading */}
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

                    {/* Description — primary canvas */}
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

                    {/* Goal */}
                    <FieldRow
                      icon={Flag}
                      label="Goal"
                      placeholder="Why does this matter?"
                      value={editing.goal}
                      onSave={(v) => saveField('goal', v, { goal: v })}
                    />

                    {/* Next action — flagship row */}
                    <FieldRow
                      icon={CornerDownLeft}
                      label="Next action"
                      placeholder="The single concrete next step"
                      value={editing.next_action}
                      onSave={(v) =>
                        saveField('next_action', v, { next_action: v })
                      }
                    />

                    {/* Waiting on */}
                    {(editing.status === 'waiting' ||
                      editing.waiting_on) && (
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

                    {/* Assist panel — drives shape → pick phase → structured Qs → next steps inline */}
                    <div className="mt-6">
                      <TicketAssistPanel
                        ticket={editing}
                        onTicketChange={(next) =>
                          setEditing((cur) =>
                            cur && cur.id === next.id ? next : cur,
                          )
                        }
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

                    {/* Context note (free-form) */}
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

                    {/* Activity */}
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

              {/* ── Properties sidebar ────────────────────────────────── */}
              {propertiesOpen ? (
                <PropertiesSidebar
                  ticket={editing}
                  saveField={saveField}
                />
              ) : null}
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

// ── Properties sidebar ────────────────────────────────────────────────────

function PropertiesSidebar({
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
  const statusMeta = STATUS_META[ticket.status]
  const typeMeta = TYPE_META[ticket.type]
  const urgency = urgencyMeta(ticket.urgency)
  const importance = urgencyMeta(ticket.importance)
  const energy = urgencyMeta(ticket.energy_required)
  const agentMeta = AGENT_MODE_META[ticket.agent_mode]
  const StatusIcon = statusMeta.icon
  const TypeIcon = typeMeta.icon
  const UrgencyIcon = urgency.icon
  const ImportanceIcon = importance.icon
  const EnergyIcon = energy.icon
  const AgentIcon = agentMeta.icon

  const statusOptions: PropertyMenuOption<TicketStatus>[] = STATUS_OPTIONS.map(
    (o) => ({
      value: o.value,
      label: STATUS_META[o.value].label,
      icon: STATUS_META[o.value].icon,
      iconClass: STATUS_META[o.value].tone,
    }),
  )

  const typeOptions: PropertyMenuOption<TicketType>[] = TYPE_OPTIONS.map(
    (o) => ({
      value: o.value,
      label: TYPE_META[o.value].label,
      icon: TYPE_META[o.value].icon,
      iconClass: TYPE_META[o.value].tone,
    }),
  )

  const agentOptions: PropertyMenuOption<AgentMode>[] = AGENT_MODE_OPTIONS.map(
    (o) => ({
      value: o.value,
      label: AGENT_MODE_META[o.value].label,
      icon: AGENT_MODE_META[o.value].icon,
      iconClass: AGENT_MODE_META[o.value].tone,
    }),
  )

  const scaleOptions = (type: 'urgency' | 'importance' | 'energy'): PropertyMenuOption<number>[] => {
    return [
      { value: 0, label: 'No value' },
      ...SCALE_OPTIONS.map((n) => ({
        value: n,
        label:
          type === 'energy'
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
  }

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-l bg-muted/20 lg:flex">
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        <SectionLabel>Properties</SectionLabel>

        <div className="space-y-0.5">
          <PropertyPill
            icon={StatusIcon}
            iconClass={statusMeta.tone}
            label="Status"
            value={statusMeta.label}
            menu={
              <PropertyMenu
                options={statusOptions}
                value={ticket.status}
                onSelect={(next) => {
                  if (next === ticket.status) return
                  void saveField('status', next, { status: next }).catch(
                    (err) => console.error('status update failed', err),
                  )
                }}
              />
            }
          />

          <PropertyPill
            icon={TypeIcon}
            iconClass={typeMeta.tone}
            label="Type"
            value={typeMeta.label}
            menu={
              <PropertyMenu
                options={typeOptions}
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

          <PropertyPill
            icon={UrgencyIcon}
            iconClass={urgency.tone}
            label="Priority"
            value={ticket.urgency != null ? urgency.label : undefined}
            placeholder="No priority"
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
            icon={ImportanceIcon}
            iconClass={importance.tone}
            label="Importance"
            value={ticket.importance != null ? importance.label : undefined}
            placeholder="—"
            menu={
              <PropertyMenu
                options={scaleOptions('importance')}
                value={ticket.importance ?? 0}
                onSelect={(next) => {
                  const v = next === 0 ? null : next
                  void saveField('importance', v, {
                    importance: v,
                  }).catch((err) =>
                    console.error('importance update failed', err),
                  )
                }}
              />
            }
          />

          <PropertyPill
            icon={EnergyIcon}
            iconClass={energy.tone}
            label="Energy"
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
        </div>

        <div className="border-t pt-4">
          <SectionLabel>Schedule</SectionLabel>
          <div className="mt-1 space-y-0.5">
            <DateRow
              label="Due"
              value={ticket.next_action_at}
              onSave={(v) =>
                saveField('next_action_at', v, { next_action_at: v })
              }
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <SectionLabel>Assist</SectionLabel>
          <div className="mt-1 space-y-0.5">
            <PropertyPill
              icon={AgentIcon}
              iconClass={agentMeta.tone}
              label="Mode"
              value={agentMeta.label}
              menu={
                <PropertyMenu
                  options={agentOptions}
                  value={ticket.agent_mode}
                  onSelect={(next) => {
                    if (next === ticket.agent_mode) return
                    void saveField('agent_mode', next, {
                      agent_mode: next,
                    }).catch((err) =>
                      console.error('agent mode update failed', err),
                    )
                  }}
                />
              }
            />
            <PropertyPill
              icon={Sparkles}
              iconClass="text-muted-foreground"
              label="Status"
              value={ticket.agent_status}
            />
          </div>
        </div>

        <div className="border-t pt-4 text-xs text-muted-foreground">
          <SectionLabel>Activity</SectionLabel>
          <dl className="mt-2 space-y-1.5">
            <Stamp label="Created" value={formatDateLong(ticket.created_at)} />
            <Stamp label="Updated" value={formatDateLong(ticket.updated_at)} />
            {ticket.closed_at ? (
              <Stamp
                label="Closed"
                value={formatDateLong(ticket.closed_at)}
              />
            ) : null}
          </dl>
        </div>
      </div>
    </aside>
  )
}

function Stamp({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground/80">{value}</dd>
    </div>
  )
}

function DateRow({
  label,
  value,
  onSave,
}: {
  label: string
  value: string | null
  onSave: (next: string | null) => Promise<void>
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarClock className="h-4 w-4" />
        {label}
      </span>
      <EditableField<string | null>
        label=""
        value={value}
        serialize={(v) => formatDateShort(v) ?? null}
        toDraft={isoToLocalInput}
        placeholder="No date"
        parse={(d) => ({ ok: true, value: localInputToIso(d) })}
        onSave={onSave}
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
            className="h-7 w-[180px] text-xs"
          />
        )}
        readClassName="rounded px-1.5 py-0.5 text-sm hover:bg-background"
      />
    </div>
  )
}
