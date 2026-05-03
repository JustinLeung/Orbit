import { useRef, useState, type ReactNode } from 'react'
import { CalendarClock, CheckCircle2, GripVertical, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { EditableField } from '@/components/tickets/EditableField'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import {
  PropertyMenu,
  PropertyPill,
  type PropertyMenuOption,
} from '@/components/tickets/PropertyPill'
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
  acceptSuggestedStep,
  addPhaseToShape,
  buildPickedPhaseState,
  persistAssistState,
  removePhase,
  useLatestAssistState,
  type FieldChangeValue,
} from '@/lib/queries'
import { AddStepInline } from '@/components/tickets/AddStepInline'
import { SuggestedSteps } from '@/components/tickets/SuggestedSteps'
import type {
  AssistState,
  ShapePhaseEntry,
  SuggestedStep,
} from '@/lib/assistTypes'
import type {
  Ticket,
  TicketStatus,
  TicketType,
  TicketUpdate,
} from '@/types/orbit'

// Vertical step rail + (optionally) a properties stack underneath. The
// rail has two presentations:
//
//   - variant="dialog": left-side rail with the full properties stack
//     (Status / Type / Importance / Energy / Schedule / stamps) below
//     the plan. Used historically by the modal detail dialog.
//   - variant="detail": right-side rail used by the non-modal
//     `TicketDetailView`. Plan only; properties move into a horizontal
//     pill row in the body. A compact created/updated footer takes the
//     place of the properties stack so timestamps stay reachable.

export type SaveField = <K extends keyof Ticket>(
  field: K,
  next: FieldChangeValue,
  patch: TicketUpdate,
) => Promise<void>

export type TicketPlanRailVariant = 'dialog' | 'detail'

export function TicketPlanRail({
  ticket,
  saveField,
  variant = 'dialog',
}: {
  ticket: Ticket
  saveField: SaveField
  variant?: TicketPlanRailVariant
}) {
  const { data: assistState } = useLatestAssistState(ticket.id)
  const phases: ShapePhaseEntry[] = assistState?.shape?.phases ?? []
  const currentPhaseId = assistState?.position?.current_phase_id ?? null
  const currentIdx = phases.findIndex((p) => p.id === currentPhaseId)
  const doneCount = phases.filter((p) => p.status === 'done').length
  const progressPct =
    phases.length > 0 ? Math.round((doneCount / phases.length) * 100) : 0

  // ── Drag-reorder ────────────────────────────────────────────────────
  // While a drag is in progress we keep the working order in a ref AND in
  // an `orderOverride` state so the rail re-renders. On pointerup, persist
  // the new order. The ref is the source of truth inside the document
  // listeners (closures would otherwise capture stale state).
  const dragStateRef = useRef<{ id: string; order: string[] } | null>(null)
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)

  function startDrag(id: string) {
    return (e: React.PointerEvent) => {
      if (!assistState?.shape) return
      e.preventDefault()
      e.stopPropagation()
      const initialOrder = phases.map((p) => p.id)
      dragStateRef.current = { id, order: initialOrder }
      setOrderOverride(initialOrder)

      const onMove = (ev: PointerEvent) => {
        const ds = dragStateRef.current
        if (!ds) return
        const els = document.querySelectorAll<HTMLElement>(
          '[data-rail-instance="1"] [data-plan-step]',
        )
        let overId: string | null = null
        els.forEach((el) => {
          const r = el.getBoundingClientRect()
          if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
            overId = el.getAttribute('data-plan-step')
          }
        })
        if (!overId || overId === ds.id) return
        const fromIdx = ds.order.indexOf(ds.id)
        const toIdx = ds.order.indexOf(overId)
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return
        const next = ds.order.slice()
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        ds.order = next
        setOrderOverride(next)
      }

      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        const ds = dragStateRef.current
        dragStateRef.current = null
        if (!ds || !assistState?.shape) {
          setOrderOverride(null)
          return
        }
        const originalKey = phases.map((p) => p.id).join(',')
        const newKey = ds.order.join(',')
        if (originalKey === newKey) {
          setOrderOverride(null)
          return
        }
        const phaseMap = new Map(
          assistState.shape.phases.map((p) => [p.id, p] as const),
        )
        const reordered = ds.order
          .map((pid) => phaseMap.get(pid))
          .filter((p): p is ShapePhaseEntry => p !== undefined)
        const nextState: AssistState = {
          ...assistState,
          shape: { ...assistState.shape, phases: reordered },
          next_question: assistState.next_question ?? null,
        }
        persistAssistState(ticket, nextState, 'reorder_phases').then(
          () => setOrderOverride(null),
          (err) => {
            console.error('reorder phases failed', err)
            setOrderOverride(null)
          },
        )
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    }
  }

  const phaseMap = new Map(phases.map((p) => [p.id, p] as const))
  const displayPhases: ShapePhaseEntry[] =
    orderOverride !== null
      ? orderOverride
          .map((id) => phaseMap.get(id))
          .filter((p): p is ShapePhaseEntry => p !== undefined)
      : phases

  async function pickPhase(id: string) {
    if (!assistState) return
    if (id === currentPhaseId) return
    const next = buildPickedPhaseState(assistState, id)
    if (!next) return
    try {
      await persistAssistState(ticket, next, 'pick_current_phase')
    } catch (err) {
      console.error('pick phase failed', err)
    }
  }

  async function addStep(input: { title: string; category: ShapePhaseEntry['category'] }) {
    if (!assistState) return
    const next = await addPhaseToShape(ticket, assistState, input)
    if (!next) throw new Error('Could not add step (no shape yet)')
  }

  async function removeStep(p: ShapePhaseEntry) {
    if (!assistState) return
    // Mild guard for the current phase since removing it loses
    // user-selected state (current_phase_id, any pending next_question).
    if (
      p.id === currentPhaseId &&
      !window.confirm(`Remove "${p.title}"? It's the phase you're currently on.`)
    ) {
      return
    }
    try {
      await removePhase(ticket, assistState, p.id)
    } catch (err) {
      console.error('remove phase failed', err)
    }
  }

  async function acceptSuggestion(s: SuggestedStep) {
    if (!assistState) return
    const position =
      s.position === 'end' || !s.anchor_phase_id
        ? ({ kind: 'end' } as const)
        : ({ kind: s.position, anchor_phase_id: s.anchor_phase_id } as const)
    const next = await acceptSuggestedStep(
      ticket,
      assistState,
      { id: s.id, title: s.title, category: s.category },
      position,
    )
    if (!next) throw new Error('Could not accept suggestion')
  }

  // Pitch the affordance more loudly for single-step rails — the model
  // deliberately classified this as a one-step task, so we want to make
  // it obvious the user CAN grow it if they realize it's bigger.
  const addStepTone: 'primary' | 'secondary' =
    phases.length === 1 ? 'primary' : 'secondary'

  const suggestedSteps: SuggestedStep[] =
    assistState?.shape?.suggested_steps ?? []

  return (
    <aside
      data-rail-instance="1"
      className={cn(
        'hidden shrink-0 flex-col overflow-y-auto bg-muted/20 lg:flex',
        variant === 'detail'
          ? 'w-[300px] border-l'
          : 'w-[288px] border-r',
      )}
    >
      {/* Plan header — always present, shows progress even before bootstrap. */}
      <div className="border-b px-3 py-3">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Plan</SectionLabel>
          <span className="text-[10px] text-muted-foreground">
            {phases.length > 0 && currentIdx >= 0
              ? `${currentIdx + 1} / ${phases.length}`
              : `${phases.length} step${phases.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progressPct}%` }}
              aria-hidden
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Vertical step list. */}
      <div className="px-2 py-2">
        {phases.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-muted-foreground">
            Assist hasn't mapped a plan yet.
          </p>
        ) : (
          <>
          <ol className="relative">
            {/* Connecting line behind step markers. */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-[19px] top-[18px] bottom-[18px] w-px bg-border"
            />
            {displayPhases.map((p, i) => {
              const isCurrent = p.id === currentPhaseId
              const isDone = p.status === 'done'
              return (
                <li key={p.id} data-plan-step={p.id} className="relative">
                  <div
                    className={cn(
                      'group relative flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors',
                      isCurrent
                        ? 'bg-background ring-1 ring-border'
                        : 'hover:bg-background/80',
                    )}
                  >
                    <span
                      onPointerDown={startDrag(p.id)}
                      className="absolute left-[2px] top-1/2 hidden -translate-y-1/2 cursor-grab text-muted-foreground/60 group-hover:block"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeStep(p)
                      }}
                      className="absolute right-1 top-1 hidden rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-destructive group-hover:block"
                      aria-label={`Remove "${p.title}"`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void pickPhase(p.id)}
                      className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          'relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isCurrent
                              ? 'bg-foreground text-background'
                              : 'bg-background text-muted-foreground ring-1 ring-border',
                        )}
                      >
                        {isDone ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[12.5px] leading-tight',
                            isCurrent
                              ? 'font-semibold text-foreground'
                              : isDone
                                ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                                : 'text-foreground/90',
                          )}
                        >
                          {p.title}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <PhaseCategoryPill category={p.category} />
                          {p.definition_of_done.length > 0 ? (
                            <span
                              className="text-[10px] tabular-nums text-muted-foreground"
                              aria-label={`${p.definition_of_done.filter((d) => d.done).length} of ${p.definition_of_done.length} DoD items done`}
                            >
                              {p.definition_of_done.filter((d) => d.done).length}/
                              {p.definition_of_done.length}
                            </span>
                          ) : null}
                        </span>
                        {p.action ? (
                          <span className="mt-1 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
                            {p.action}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
          <SuggestedSteps
            suggestions={suggestedSteps}
            phases={phases}
            onAccept={acceptSuggestion}
          />
          <AddStepInline onAdd={addStep} tone={addStepTone} />
          </>
        )}
      </div>

      {/* Footer — properties stack in the dialog, slim stamps row in the
          non-modal detail view (where properties live as pill row in the
          body instead). */}
      {variant === 'dialog' ? (
        <PropertiesPanel ticket={ticket} saveField={saveField} />
      ) : (
        <StampsFooter ticket={ticket} />
      )}
    </aside>
  )
}

// Compact "Created / Updated / Closed" footer for the detail-view rail.
// In the modal these stamps live inside `PropertiesPanel`; the non-modal
// rail drops PropertiesPanel so we surface them on their own.
function StampsFooter({ ticket }: { ticket: Ticket }) {
  return (
    <div className="mt-auto space-y-0.5 border-t px-3 py-2 text-[10.5px] text-muted-foreground">
      <Stamp label="Created" value={formatDateLong(ticket.created_at)} />
      <Stamp label="Updated" value={formatDateLong(ticket.updated_at)} />
      {ticket.closed_at ? (
        <Stamp label="Closed" value={formatDateLong(ticket.closed_at)} />
      ) : null}
    </div>
  )
}

// ── SectionLabel ───────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  )
}

// ── PropertiesPanel ────────────────────────────────────────────────────
//
// Below-the-plan stack of inline-editable property pills. Mirrors what
// the old right-hand sidebar had so users don't lose access to any field
// when the layout shifts.

function PropertiesPanel({
  ticket,
  saveField,
}: {
  ticket: Ticket
  saveField: SaveField
}) {
  const statusMeta = STATUS_META[ticket.status]
  const typeMeta = TYPE_META[ticket.type]
  const importance = urgencyMeta(ticket.importance)
  const energy = urgencyMeta(ticket.energy_required)
  const StatusIcon = statusMeta.icon
  const TypeIcon = typeMeta.icon
  const ImportanceIcon = importance.icon
  const EnergyIcon = energy.icon

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
  const scaleOptions = (
    type: 'importance' | 'energy',
  ): PropertyMenuOption<number>[] => [
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

  return (
    <div className="mt-auto space-y-3 border-t px-2 py-3">
      <div>
        <div className="px-1.5 pb-1">
          <SectionLabel>Properties</SectionLabel>
        </div>
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
                  void saveField('importance', v, { importance: v }).catch(
                    (err) => console.error('importance update failed', err),
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
      </div>

      <div className="border-t pt-3">
        <div className="px-1.5 pb-1">
          <SectionLabel>Schedule</SectionLabel>
        </div>
        <div className="space-y-0.5">
          <DateRow
            label="Due"
            value={ticket.next_action_at}
            onSave={(v) =>
              saveField('next_action_at', v, { next_action_at: v })
            }
          />
        </div>
      </div>

      <div className="space-y-1 border-t px-1.5 pt-3 text-xs text-muted-foreground">
        <Stamp label="Created" value={formatDateLong(ticket.created_at)} />
        <Stamp label="Updated" value={formatDateLong(ticket.updated_at)} />
        {ticket.closed_at ? (
          <Stamp label="Closed" value={formatDateLong(ticket.closed_at)} />
        ) : null}
      </div>
    </div>
  )
}

function Stamp({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="text-foreground/80">{value}</span>
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
