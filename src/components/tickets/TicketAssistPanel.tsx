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
import { resolveAgent } from '@/components/tickets/agents'
import { cn } from '@/lib/utils'
import {
  markAssistBootstrapped,
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
  hideActions,
}: {
  ticket: Ticket
  // Lets the parent dialog keep its own `editing` state in sync with
  // ticket mutations we make here (Set as next action, runAssistTurn's
  // ticket_updates). Without this, the dialog's other field rows show
  // stale values until the next refetch — visible as a flash.
  onTicketChange?: (next: Ticket) => void
  // When true, suppress the inline plan (ActionsSection + ShapePicker).
  // Used when the parent renders the plan elsewhere (e.g. the dialog's
  // left rail), so the assist panel stays focused on refining the
  // current step without duplicating the plan.
  hideActions?: boolean
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

  // External changes to persisted (e.g. the sidebar phase dropdown) need
  // to flush any stale optimistic override the panel was holding from a
  // prior in-panel turn — otherwise `state = override ?? persisted` would
  // mask the new value. Same render-time pattern used for trackedTicketId
  // above so we don't fire setState inside an effect.
  const [trackedPersisted, setTrackedPersisted] =
    useState<AssistState | null>(persisted)
  if (persisted !== trackedPersisted) {
    setTrackedPersisted(persisted)
    if (override !== null) setOverride(null)
  }

  // Wrapped doTurn for per-phase agents. Agents emit (userMessage, advance)
  // tuples; the panel owns state and busy/error/lastApplied. We close
  // the refine surface on a successful turn so the post-refine action
  // becomes the primary thing the user sees again.
  async function agentRunTurn(args: {
    userMessage: string | null
    advance: boolean
  }) {
    if (!state) return null
    const result = await doTurn({
      state,
      userMessage: args.userMessage,
      advance: args.advance,
    })
    if (result && args.userMessage) setRefiningOpen(false)
    return result?.state ?? null
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
  // Resolve the per-phase agent. Defaults to the static-form agent when
  // the category doesn't have a bespoke entry yet — preserves the
  // pre-dispatcher behavior for research/doing/waiting/deciding/closing.
  const Agent = currentPhase ? resolveAgent(currentPhase.category) : null
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
    <div className="space-y-4">
      {/* Actions section lives OUTSIDE the assist panel once a phase has
          been picked — it's the user's plan, not an assistant interaction.
          Hidden when the parent renders the plan itself (rail mode). */}
      {!hideActions && shape && currentPhase ? (
        <ActionsSection
          shape={shape}
          currentPhaseId={currentPhaseId}
          ticket={liveTicket}
          onSetNextAction={setNextAction}
          onRefine={
            busy || isDone ? undefined : () => setRefiningOpen(true)
          }
          refineActive={showQuestions}
        />
      ) : null}

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
        </div>

        <div className="space-y-3 px-3 py-3">
          {/* Stage 1: generating shape */}
          {!shape && (busy || loadingState) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Mapping out the shape of this loop…
            </div>
          ) : null}

          {/* Stage 2: shape exists but no phase picked — the read-only
              preview of phases. The picker dropdown lives in the sidebar.
              Hidden in rail mode since the rail itself shows the phases. */}
          {!hideActions && shape && !currentPhase ? (
            <ShapePicker
              shape={shape}
              requirePick={!currentPhaseId && !isDone}
              ticket={liveTicket}
              onSetNextAction={setNextAction}
            />
          ) : null}

          {hideActions && shape && !currentPhase && !isDone ? (
            <p className="text-xs font-medium text-primary">
              Pick the phase you're in from the plan rail →
            </p>
          ) : null}

        {/* Stage 3: structured questions, collapsed behind "Refine this phase" */}
          {/* Once a phase is picked, the assist panel switches role — it
              becomes help for the current action. The phase title acts as
              the subject line so it's clear what this is helping with. */}
          {currentPhase && !isDone ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  Help with: {currentPhase.title}
                </p>
                {currentPhase.action ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {currentPhase.action}
                  </p>
                ) : null}
              </div>
              <PhaseCategoryPill category={currentPhase.category} />
            </div>
          ) : null}

          {showQuestions && currentPhase && state && Agent ? (
            // eslint-disable-next-line react-hooks/static-components
            <Agent
              // Remount on phase change so any local state in the agent
              // (answer drafts, kickoff guards) resets cleanly.
              key={currentPhase.id}
              ticket={liveTicket}
              state={state}
              phase={currentPhase}
              busy={busy}
              loadingState={loadingState}
              refiningOpen={refiningOpen}
              onCancel={() => setRefiningOpen(false)}
              runTurn={agentRunTurn}
            />
          ) : null}

          {/* When a phase is picked but the structured form is hidden,
              surface a primary "Refine this action" affordance so the
              assistant has something obvious to do. */}
          {currentPhase && !isDone && !showQuestions ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Answer a few questions to refine this action.
              </p>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setRefiningOpen(true)}
                disabled={busy}
              >
                <RefreshCcw className="h-3 w-3" aria-hidden />
                Refine action
              </Button>
            </div>
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
    </div>
  )
}

// Lives OUTSIDE the assist panel once a phase is picked. Groups phases
// into previous / current / remaining buckets so the user sees a clear
// "where I've been, where I am, where I'm going" arc. `blocked` phases
// haven't been completed and aren't the active focus, so they sit with
// "remaining".
function ActionsSection({
  shape,
  currentPhaseId,
  ticket,
  onSetNextAction,
  onRefine,
  refineActive,
}: {
  shape: NonNullable<AssistState['shape']>
  currentPhaseId: string | null
  ticket: Ticket
  onSetNextAction: (title: string) => void
  onRefine?: () => void
  refineActive: boolean
}) {
  const previous = shape.phases.filter((p) => p.status === 'done')
  const current = shape.phases.filter((p) => p.status === 'in_progress')
  const remaining = shape.phases.filter(
    (p) => p.status === 'not_started' || p.status === 'blocked',
  )
  const renderRow = (p: ShapePhaseEntry) => {
    const isCurrent = currentPhaseId === p.id
    return (
      <PhaseRow
        key={p.id}
        phase={p}
        isCurrent={isCurrent}
        ticket={ticket}
        onSetNextAction={onSetNextAction}
        onRefine={isCurrent && !refineActive ? onRefine : undefined}
      />
    )
  }
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Actions
        </span>
      </div>
      <div className="space-y-3">
        {previous.length > 0 ? (
          <ActionGroup label="Previous">
            {previous.map(renderRow)}
          </ActionGroup>
        ) : null}
        {current.length > 0 ? (
          <ActionGroup label="Current">{current.map(renderRow)}</ActionGroup>
        ) : null}
        {remaining.length > 0 ? (
          <ActionGroup label="Remaining">
            {remaining.map(renderRow)}
          </ActionGroup>
        ) : null}
      </div>
    </div>
  )
}

// Lives INSIDE the assist panel before a phase is picked. Read-only
// preview of the proposed phases; the actual picker dropdown sits in
// the sidebar's Assist section so it's discoverable from anywhere on
// the ticket.
function ShapePicker({
  shape,
  requirePick,
  ticket,
  onSetNextAction,
}: {
  shape: NonNullable<AssistState['shape']>
  requirePick: boolean
  ticket: Ticket
  onSetNextAction: (title: string) => void
}) {
  return (
    <div className="space-y-2">
      {requirePick ? (
        <p className="text-xs font-medium text-primary">
          Pick the phase you're in from the sidebar →
        </p>
      ) : null}
      <ol className="space-y-1.5">
        {shape.phases.map((p) => (
          <PhaseRow
            key={p.id}
            phase={p}
            isCurrent={false}
            ticket={ticket}
            onSetNextAction={onSetNextAction}
          />
        ))}
      </ol>
    </div>
  )
}

function ActionGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      <ol className="space-y-1.5">{children}</ol>
    </div>
  )
}

function PhaseRow({
  phase,
  isCurrent,
  ticket,
  onSetNextAction,
  onRefine,
}: {
  phase: ShapePhaseEntry
  isCurrent: boolean
  ticket: Ticket
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
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-1 items-start gap-2">
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
        </div>
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

