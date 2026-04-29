import { useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  Loader2,
  RefreshCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import {
  ASSIST_QUESTIONS,
  formatStructuredAnswers,
  type AssistQuestion,
} from '@/components/tickets/assistQuestions'
import { cn } from '@/lib/utils'
import {
  markAssistBootstrapped,
  persistAssistState,
  runAssistTurn,
  updateTicket,
  useLatestAssistState,
} from '@/lib/queries'
import type {
  AssistState,
  ShapePhaseEntry,
  ShapePhaseStatus,
} from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'

// Inline assist surface that lives inside TicketDetailDialog. Drives the
// shape → refine walkthrough as a structured form rather than a chat:
//   1. Generate the shape automatically (one turn) when the ticket has none.
//      Each phase carries a concrete `action` — phases ARE the action plan.
//   2. Force the user to click their current phase from that shape.
//   3. Render category-specific structured questions for that phase.
//   4. Submit refines the current phase's action in place. Each phase row
//      offers "Set as next action" so the user can promote the action to
//      the ticket's primary next_action.
// Free-form chat is demoted to an "Ask a follow-up" affordance below.
export function TicketAssistPanel({
  ticket,
  onTicketChange,
}: {
  ticket: Ticket
  // Lets the parent dialog keep its own `editing` state in sync with
  // ticket mutations we make here (Set as next action, runAssistTurn's
  // ticket_updates). Without this, the dialog's other field rows show
  // stale values until the next refetch — visible as a flash.
  onTicketChange?: (next: Ticket) => void
}) {
  const { data: persisted, loading: loadingState } = useLatestAssistState(
    ticket.id,
  )
  const [override, setOverride] = useState<AssistState | null>(null)
  const state = override ?? persisted ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState('')
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [lastApplied, setLastApplied] = useState<string[]>([])
  const [refiningOpen, setRefiningOpen] = useState(false)
  // Mirror the prop ticket into local state so we can show optimistic
  // updates from runAssistTurn / setNextAction without waiting for the
  // parent to refetch. Sync on prop change using the same render-time
  // pattern as TicketDetailDialog (avoids set-state-in-effect).
  const [liveTicket, setLiveTicket] = useState<Ticket>(ticket)
  const [trackedTicketId, setTrackedTicketId] = useState(ticket.id)
  if (ticket.id !== trackedTicketId) {
    setTrackedTicketId(ticket.id)
    setLiveTicket(ticket)
  }

  // Kick off the first turn so the user sees a shape without having to
  // click anything. Sticky module-level guard so we never fire twice for
  // the same ticket within a page session — protects against StrictMode
  // double-mount, dialog re-opens, or refetches that briefly invalidate
  // `persisted` while a bootstrap is in flight.
  useEffect(() => {
    if (loadingState) return
    if (persisted) return
    if (!markAssistBootstrapped(ticket.id)) return
    void doTurn({ state: null, userMessage: null, advance: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingState, persisted, ticket.id])

  async function doTurn(args: {
    state: AssistState | null
    userMessage: string | null
    advance: boolean
  }) {
    setBusy(true)
    setError(null)
    try {
      const result = await runAssistTurn({
        ticket: liveTicket,
        state: args.state,
        userMessage: args.userMessage,
        advance: args.advance,
      })
      setOverride(result.state)
      setLiveTicket(result.ticket)
      onTicketChange?.(result.ticket)
      setLastApplied(result.applied_updates.map((u) => u.field))
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setBusy(false)
    }
  }

  // Pick current phase: deterministic local state edit (no model call), then
  // persisted as a fresh agent_run so reloading the ticket preserves it.
  async function pickCurrentPhase(phaseId: string) {
    if (!state || !state.shape || busy) return
    const phases = state.shape.phases
    const idx = phases.findIndex((p) => p.id === phaseId)
    if (idx === -1) return
    const updatedPhases = phases.map((p, i) => ({
      ...p,
      status:
        i < idx
          ? ('done' as const)
          : i === idx
            ? ('in_progress' as const)
            : ('not_started' as const),
    }))
    const nextState: AssistState = {
      ...state,
      shape: { ...state.shape, phases: updatedPhases },
      position: {
        current_phase_id: phaseId,
        blockers: state.position?.blockers ?? [],
        notes: state.position?.notes ?? null,
      },
    }
    setOverride(nextState)
    setRefiningOpen(false)
    try {
      await persistAssistState(liveTicket, nextState, 'pick_current_phase')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Clear the current phase pick — drops back to "pick where you are".
  async function clearCurrentPhase() {
    if (!state || !state.shape || busy) return
    const updatedPhases = state.shape.phases.map((p) => ({
      ...p,
      status: 'not_started' as const,
    }))
    const nextState: AssistState = {
      ...state,
      shape: { ...state.shape, phases: updatedPhases },
      position: { current_phase_id: null, blockers: [], notes: null },
    }
    setOverride(nextState)
    setRefiningOpen(false)
    try {
      await persistAssistState(liveTicket, nextState, 'clear_current_phase')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function submitStructured(answers: Record<string, string>) {
    if (!state || !state.shape) return
    const phaseId = state.position?.current_phase_id
    const phase = state.shape.phases.find((p) => p.id === phaseId)
    if (!phase) return
    const message = formatStructuredAnswers(phase.category, phase.title, answers)
    // Advance from 'shape' → 'refine' on first submit; subsequent submits
    // stay in 'refine'.
    await doTurn({
      state,
      userMessage: message,
      advance: state.phase === 'shape',
    })
    setRefiningOpen(false)
  }

  async function setNextAction(title: string) {
    // Optimistic update first — the button state and the dialog's other
    // fields (Next action row up top, etc.) all flip immediately, so
    // there's no visible flash between click and the server returning.
    const prev = liveTicket
    const optimistic = { ...liveTicket, next_action: title }
    setLiveTicket(optimistic)
    onTicketChange?.(optimistic)
    try {
      const updated = await updateTicket(
        prev.id,
        { next_action: title },
        {
          changedFields: [
            {
              field: 'next_action',
              old: prev.next_action,
              new: title,
            },
          ],
        },
      )
      setLiveTicket(updated)
      onTicketChange?.(updated)
    } catch (err) {
      // Rollback so we don't lie about state on failure.
      setLiveTicket(prev)
      onTicketChange?.(prev)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function sendFollowUp() {
    const trimmed = followUp.trim()
    if (!trimmed || busy) return
    setFollowUp('')
    await doTurn({ state, userMessage: trimmed, advance: false })
  }

  const shape = state?.shape ?? null
  const currentPhaseId = state?.position?.current_phase_id ?? null
  const currentPhase =
    shape?.phases.find((p) => p.id === currentPhaseId) ?? null
  const isDone = state?.phase === 'done'
  // While we're still in the initial shape phase and a current phase has
  // been picked, surface the questions form by default — that's how we
  // help the assistant help. Once we've refined at least once
  // (state.phase === 'refine'), tuck it back behind a "Refine" button so
  // the action is the primary thing the user sees.
  const showQuestions =
    !!shape &&
    !!currentPhase &&
    !isDone &&
    (refiningOpen || state?.phase === 'shape')

  return (
    <div className="rounded-lg border bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assist
          </span>
          {isDone ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Wrapped
            </span>
          ) : null}
        </div>
        {shape && currentPhase && !isDone ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => void clearCurrentPhase()}
            disabled={busy}
          >
            Change phase
          </button>
        ) : null}
      </div>

      <div className="space-y-3 px-3 py-3">
        {/* Stage 1: generating shape */}
        {!shape && (busy || loadingState) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Mapping out the shape of this loop…
          </div>
        ) : null}

        {/* Stage 2+: the shape itself, with each phase showing its action */}
        {shape ? (
          <ShapeBlock
            shape={shape}
            currentPhaseId={currentPhaseId}
            onPickCurrent={busy || isDone ? undefined : pickCurrentPhase}
            requirePick={!currentPhaseId && !isDone}
            ticket={liveTicket}
            onSetNextAction={setNextAction}
            onRefine={
              busy || isDone || !currentPhase
                ? undefined
                : () => setRefiningOpen(true)
            }
            refineActive={showQuestions}
          />
        ) : null}

        {/* Stage 3: structured questions, collapsed behind "Refine this phase" */}
        {showQuestions && currentPhase ? (
          <StructuredQuestionsForm
            // key keyed on phase id so picking a different phase remounts
            // the form with empty answers — no setState-in-effect needed.
            key={currentPhase.id}
            phase={currentPhase}
            busy={busy}
            onCancel={() => setRefiningOpen(false)}
            onSubmit={submitStructured}
          />
        ) : null}

        {lastApplied.length > 0 && !busy ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3 w-3 text-primary" aria-hidden />
            <span>
              Updated{' '}
              <span className="text-foreground">{lastApplied.join(', ')}</span>{' '}
              on the ticket.
            </span>
          </div>
        ) : null}

        {busy && shape ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Thinking…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {/* Demoted free-form follow-up */}
        {shape && !isDone ? (
          <div className="border-t pt-3">
            {showFollowUp ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendFollowUp()
                }}
              >
                <Textarea
                  rows={2}
                  autoFocus
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="Add anything else, or ask a question…"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendFollowUp()
                    }
                  }}
                  disabled={busy}
                  className="text-sm"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setShowFollowUp(false)
                      setFollowUp('')
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="xs"
                    disabled={busy || followUp.trim() === ''}
                  >
                    Send
                  </Button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setShowFollowUp(true)}
                disabled={busy}
              >
                + Ask a follow-up
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ShapeBlock({
  shape,
  currentPhaseId,
  onPickCurrent,
  requirePick,
  ticket,
  onSetNextAction,
  onRefine,
  refineActive,
}: {
  shape: NonNullable<AssistState['shape']>
  currentPhaseId: string | null
  onPickCurrent?: (id: string) => void
  requirePick: boolean
  ticket: Ticket
  onSetNextAction: (title: string) => void
  onRefine?: () => void
  refineActive: boolean
}) {
  return (
    <div>
      {shape.goal ? (
        <p className="mb-2 text-sm">
          <span className="text-muted-foreground">Goal:</span> {shape.goal}
        </p>
      ) : null}
      {requirePick ? (
        <p className="mb-2 text-xs font-medium text-primary">
          Pick the phase you're in →
        </p>
      ) : null}
      <ol className="space-y-1.5">
        {shape.phases.map((p) => {
          const isCurrent = currentPhaseId === p.id
          return (
            <PhaseRow
              key={p.id}
              phase={p}
              isCurrent={isCurrent}
              ticket={ticket}
              pickHover={requirePick}
              onPick={onPickCurrent ? () => onPickCurrent(p.id) : undefined}
              onSetNextAction={onSetNextAction}
              onRefine={isCurrent && !refineActive ? onRefine : undefined}
            />
          )
        })}
      </ol>
    </div>
  )
}

function PhaseRow({
  phase,
  isCurrent,
  ticket,
  pickHover,
  onPick,
  onSetNextAction,
  onRefine,
}: {
  phase: ShapePhaseEntry
  isCurrent: boolean
  ticket: Ticket
  pickHover: boolean
  onPick?: () => void
  onSetNextAction: (title: string) => void
  onRefine?: () => void
}) {
  const [applying, setApplying] = useState(false)
  const isCurrentNextAction =
    !!phase.action && ticket.next_action === phase.action

  return (
    <li
      className={cn(
        'rounded-md px-2 py-1.5 text-sm',
        isCurrent && 'bg-background ring-1 ring-primary/40',
        pickHover && 'ring-1 ring-primary/20 hover:ring-primary/50',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Click target for "I'm here" — the title row. Keeping it as a
            button when onPick is supplied gives the keyboard a clean
            focus loop. */}
        <button
          type="button"
          onClick={onPick}
          disabled={!onPick}
          className={cn(
            'flex flex-1 items-start gap-2 rounded-md text-left',
            onPick && 'hover:bg-muted/40',
            !onPick && 'cursor-default',
          )}
        >
          <PhaseStatusIcon status={phase.status} />
          <span className="flex-1">
            <span className="font-medium">{phase.title}</span>
            {phase.description ? (
              <span className="ml-1 text-muted-foreground">
                — {phase.description}
              </span>
            ) : null}
          </span>
          {isCurrent ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              You're here
            </span>
          ) : null}
          <PhaseCategoryPill category={phase.category} />
        </button>
      </div>
      {phase.action ? (
        <div className="mt-1 flex items-start gap-2 pl-5">
          <ArrowRight
            className="mt-1 h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug">{phase.action}</p>
            {phase.action_details ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {phase.action_details}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isCurrent && onRefine ? (
              <button
                type="button"
                onClick={onRefine}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RefreshCcw className="h-3 w-3" aria-hidden />
                Refine
              </button>
            ) : null}
            <Button
              type="button"
              variant={isCurrentNextAction ? 'ghost' : 'outline'}
              size="xs"
              disabled={applying || isCurrentNextAction || !phase.action}
              onClick={async () => {
                if (!phase.action) return
                setApplying(true)
                try {
                  await onSetNextAction(phase.action)
                } finally {
                  setApplying(false)
                }
              }}
            >
              {applying
                ? 'Setting…'
                : isCurrentNextAction
                  ? 'Set'
                  : 'Set as next action'}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function PhaseStatusIcon({ status }: { status: ShapePhaseStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
  if (status === 'in_progress')
    return <CircleDashed className="mt-0.5 h-3.5 w-3.5 text-primary" />
  if (status === 'blocked')
    return <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
  return <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
}

function StructuredQuestionsForm({
  phase,
  busy,
  onCancel,
  onSubmit,
}: {
  phase: ShapePhaseEntry
  busy: boolean
  onCancel: () => void
  onSubmit: (answers: Record<string, string>) => Promise<void>
}) {
  const questions = ASSIST_QUESTIONS[phase.category]
  // Parent passes a unique key per phase id, so this component remounts
  // with empty answers on phase change. No effect needed.
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const anyAnswer = Object.values(answers).some((v) => v.trim() !== '')

  return (
    <form
      className="space-y-3 rounded-md border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!anyAnswer) return
        void onSubmit(answers)
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Refine the action for this phase
          </p>
          <p className="text-sm">{phase.title}</p>
        </div>
        <PhaseCategoryPill category={phase.category} />
      </div>
      <div className="space-y-2.5">
        {questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={answers[q.id] ?? ''}
            onChange={(v) =>
              setAnswers((cur) => ({ ...cur, [q.id]: v }))
            }
            disabled={busy}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !anyAnswer}>
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Refining…
            </>
          ) : (
            <>
              Refine action
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: AssistQuestion
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{question.label}</span>
      <Textarea
        rows={question.multiline ? 2 : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        disabled={disabled}
        className="text-sm"
      />
    </label>
  )
}
