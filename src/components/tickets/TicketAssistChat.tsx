import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  Loader2,
  Search,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import { cn } from '@/lib/utils'
import {
  persistAssistState,
  runAssistTurn,
  updateTicket,
  useLatestAssistState,
} from '@/lib/queries'
import type {
  AssistPhase,
  AssistState,
  NextStep,
  ShapePhaseEntry,
  ShapePhaseStatus,
} from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'

const PHASE_LABEL: Record<AssistPhase, string> = {
  shape: 'Shape',
  position: 'Position',
  next_steps: 'Next steps',
  done: 'Done',
}

const PHASE_ORDER: AssistPhase[] = ['shape', 'position', 'next_steps', 'done']

export function TicketAssistChat({
  ticket: initialTicket,
  onClose,
}: {
  ticket: Ticket
  onClose: () => void
}) {
  const [ticket, setTicket] = useState<Ticket>(initialTicket)
  const { data: persisted, loading: loadingState } = useLatestAssistState(
    ticket.id,
  )
  const [override, setOverride] = useState<AssistState | null>(null)
  const state = override ?? persisted ?? null
  const [readyToAdvance, setReadyToAdvance] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bootstrappedRef = useRef(false)
  const [lastApplied, setLastApplied] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Once the latest persisted run has finished loading, kick off the first
  // turn if there's nothing yet so the user sees something.
  useEffect(() => {
    if (loadingState) return
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    if (!persisted) {
      void doTurn({ state: null, userMessage: null, advance: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingState, persisted])

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [state, busy])

  async function doTurn(args: {
    state: AssistState | null
    userMessage: string | null
    advance: boolean
  }) {
    setBusy(true)
    setError(null)
    try {
      const result = await runAssistTurn({
        ticket,
        state: args.state,
        userMessage: args.userMessage,
        advance: args.advance,
      })
      setOverride(result.state)
      setReadyToAdvance(result.ready_to_advance)
      setTicket(result.ticket)
      setLastApplied(result.applied_updates.map((u) => u.field))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    const trimmed = draft.trim()
    if (!trimmed || busy) return
    setDraft('')
    await doTurn({ state, userMessage: trimmed, advance: false })
  }

  async function advance() {
    await doTurn({ state, userMessage: null, advance: true })
  }

  async function pickCurrentPhase(phaseId: string) {
    if (!state || !state.shape) return
    const phases = state.shape.phases
    const idx = phases.findIndex((p) => p.id === phaseId)
    if (idx === -1) return
    const picked = phases[idx]
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
        current_phase_id: picked.id,
        blockers: state.position?.blockers ?? [],
        notes: state.position?.notes ?? null,
      },
      messages: [
        ...state.messages,
        {
          role: 'assistant',
          text: `Marked "${picked.title}" as your current phase.`,
          ts: new Date().toISOString(),
        },
      ],
    }
    setOverride(nextState)
    setReadyToAdvance(true)
    try {
      await persistAssistState(ticket, nextState, 'pick_current_phase')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function setNextAction(title: string) {
    try {
      await updateTicket(
        ticket.id,
        { next_action: title },
        {
          changedFields: [
            { field: 'next_action', old: ticket.next_action, new: title },
          ],
        },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const phase = state?.phase ?? 'shape'
  const isDone = phase === 'done'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PhaseStepper phase={phase} />

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
      >
        {state?.shape ? (
          <ShapeCard
            phases={state.shape.phases}
            goal={state.shape.goal}
            currentPhaseId={state.position?.current_phase_id ?? null}
            onPickCurrent={
              phase === 'shape' && !busy ? pickCurrentPhase : undefined
            }
          />
        ) : null}

        {state && phase !== 'shape' && state.shape ? null : null}

        {state?.position && phase !== 'shape' ? (
          <PositionCard
            position={state.position}
            phaseTitle={
              state.shape?.phases.find(
                (p) => p.id === state.position?.current_phase_id,
              )?.title ?? null
            }
          />
        ) : null}

        {state?.next_steps && state.next_steps.length > 0 ? (
          <NextStepsCard
            steps={state.next_steps}
            ticket={ticket}
            onSetNextAction={setNextAction}
          />
        ) : null}

        <Conversation messages={state?.messages ?? []} />

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

        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Thinking…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="border-t px-6 py-4">
        {isDone ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              You can come back here any time to keep going.
            </p>
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            {readyToAdvance ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Sparkles
                  className="mt-0.5 h-3.5 w-3.5 text-primary"
                  aria-hidden
                />
                <div className="flex-1 text-sm">
                  <p>Ready to move on?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Or keep refining {PHASE_LABEL[phase].toLowerCase()} below.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={advance}
                  disabled={busy}
                >
                  Continue to {PHASE_LABEL[nextPhase(phase)]}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Button>
              </div>
            ) : null}

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <Textarea
                rows={2}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholderFor(phase)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || draft.trim() === ''}>
                Send
              </Button>
            </form>

            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                className="hover:underline"
                onClick={onClose}
              >
                Leave for now — I'll remember where we left off
              </button>
              {!readyToAdvance && phase !== 'next_steps' ? (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={advance}
                  disabled={busy}
                >
                  Skip to {PHASE_LABEL[nextPhase(phase)]}
                </button>
              ) : null}
              {phase === 'next_steps' ? (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={advance}
                  disabled={busy}
                >
                  Done with this loop
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function nextPhase(p: AssistPhase): AssistPhase {
  const i = PHASE_ORDER.indexOf(p)
  return PHASE_ORDER[Math.min(i + 1, PHASE_ORDER.length - 1)]
}

function placeholderFor(phase: AssistPhase) {
  switch (phase) {
    case 'shape':
      return 'Refine the shape, ask a question, or accept it.'
    case 'position':
      return 'Where are you on this? What\'s done, what\'s blocked?'
    case 'next_steps':
      return 'Tell me which suggestion you\'ll take, or ask for different ones.'
    default:
      return 'Anything else?'
  }
}

function PhaseStepper({ phase }: { phase: AssistPhase }) {
  return (
    <div className="flex items-center gap-1 border-b px-6 py-3 text-xs">
      {PHASE_ORDER.filter((p) => p !== 'done').map((p, i) => {
        const idx = PHASE_ORDER.indexOf(p)
        const currentIdx = PHASE_ORDER.indexOf(phase)
        const state =
          phase === 'done' || idx < currentIdx
            ? 'done'
            : idx === currentIdx
              ? 'active'
              : 'upcoming'
        return (
          <div key={p} className="flex items-center gap-1">
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-medium',
                state === 'active' &&
                  'border-primary bg-primary text-primary-foreground',
                state === 'done' &&
                  'border-primary/40 bg-primary/10 text-primary',
                state === 'upcoming' &&
                  'border-border bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
            </span>
            <span
              className={cn(
                'font-medium',
                state === 'active' && 'text-foreground',
                state !== 'active' && 'text-muted-foreground',
              )}
            >
              {PHASE_LABEL[p]}
            </span>
            {i < 2 ? (
              <span className="mx-1 h-px w-4 bg-border" aria-hidden />
            ) : null}
          </div>
        )
      })}
      {phase === 'done' ? (
        <span className="ml-auto text-muted-foreground">Wrapped up</span>
      ) : null}
    </div>
  )
}

function ShapeCard({
  phases,
  goal,
  currentPhaseId,
  onPickCurrent,
}: {
  phases: ShapePhaseEntry[]
  goal: string | null
  currentPhaseId?: string | null
  onPickCurrent?: (phaseId: string) => void
}) {
  if (phases.length === 0 && !goal) return null
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Shape
        </p>
        {onPickCurrent ? (
          <p className="text-[10px] text-muted-foreground">
            Click a phase to mark where you are
          </p>
        ) : null}
      </div>
      {goal ? (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">Goal:</span> {goal}
        </p>
      ) : null}
      {phases.length > 0 ? (
        <ol className="mt-2 space-y-1">
          {phases.map((p) => {
            const isCurrent = currentPhaseId === p.id
            const Row = onPickCurrent ? 'button' : 'div'
            return (
              <li key={p.id}>
                <Row
                  type={onPickCurrent ? 'button' : undefined}
                  onClick={
                    onPickCurrent ? () => onPickCurrent(p.id) : undefined
                  }
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors',
                    onPickCurrent && 'hover:bg-background',
                    isCurrent && 'bg-background ring-1 ring-primary/40',
                  )}
                >
                  <PhaseStatusIcon status={p.status} />
                  <span className="flex-1">
                    {p.title}
                    {p.description ? (
                      <span className="ml-1 text-muted-foreground">
                        — {p.description}
                      </span>
                    ) : null}
                  </span>
                  {isCurrent ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      You're here
                    </span>
                  ) : null}
                  <PhaseCategoryPill category={p.category} />
                </Row>
              </li>
            )
          })}
        </ol>
      ) : null}
    </div>
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

function PositionCard({
  position,
  phaseTitle,
}: {
  position: { current_phase_id: string | null; blockers: string[]; notes: string | null }
  phaseTitle: string | null
}) {
  if (!phaseTitle && position.blockers.length === 0 && !position.notes)
    return null
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Where you are
      </p>
      {phaseTitle ? (
        <p className="mt-1 text-sm">Currently in: {phaseTitle}</p>
      ) : null}
      {position.blockers.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">Blocked on</p>
          <ul className="mt-0.5 list-disc pl-5 text-sm">
            {position.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {position.notes ? (
        <p className="mt-2 text-sm text-muted-foreground">{position.notes}</p>
      ) : null}
    </div>
  )
}

function NextStepsCard({
  steps,
  ticket,
  onSetNextAction,
}: {
  steps: NextStep[]
  ticket: Ticket
  onSetNextAction: (title: string) => void
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Next steps
      </p>
      <ul className="mt-2 space-y-2">
        {steps.map((s, i) => (
          <SuggestionRow
            key={i}
            step={s}
            isCurrentNextAction={ticket.next_action === s.title}
            onSetNextAction={onSetNextAction}
          />
        ))}
      </ul>
    </div>
  )
}

function SuggestionRow({
  step,
  isCurrentNextAction,
  onSetNextAction,
}: {
  step: NextStep
  isCurrentNextAction: boolean
  onSetNextAction: (title: string) => void
}) {
  const Icon = step.kind === 'research' ? Search : Wand2
  const [applying, setApplying] = useState(false)
  return (
    <li className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-2">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm leading-snug">{step.title}</p>
          <PhaseCategoryPill category={step.category} />
        </div>
        {step.details ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{step.details}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant={isCurrentNextAction ? 'ghost' : 'outline'}
        size="xs"
        disabled={applying || isCurrentNextAction}
        onClick={async () => {
          setApplying(true)
          try {
            await onSetNextAction(step.title)
          } finally {
            setApplying(false)
          }
        }}
      >
        {isCurrentNextAction ? 'Set' : applying ? 'Setting…' : 'Set as next action'}
      </Button>
    </li>
  )
}

function Conversation({
  messages,
}: {
  messages: { role: 'user' | 'assistant'; text: string }[]
}) {
  if (messages.length === 0) return null
  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <Bubble key={i} role={m.role}>
          {m.text}
        </Bubble>
      ))}
    </div>
  )
}

function Bubble({
  role,
  children,
}: {
  role: 'user' | 'assistant'
  children: React.ReactNode
}) {
  if (role === 'assistant') {
    return (
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          {children}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  )
}
