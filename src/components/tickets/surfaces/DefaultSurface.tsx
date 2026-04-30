import { CheckCircle2, RefreshCcw, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import { resolveAgent } from '@/components/tickets/agents'
import { togglePhaseDodItem } from '@/lib/queries'
import type { AssistState, ShapePhaseEntry } from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'
import type { SurfaceProps } from './types'

// Default surface — the body the assist panel had before per-phase
// surfaces existed. Used for every PhaseCategory without a bespoke
// surface entry. Renders:
//   - "Help with: <title>" header + the phase's category pill
//   - The current phase's per-phase DoD checklist
//   - The per-category agent dispatcher (refine form)
//   - A "Refine action" button when no refine surface is showing
//
// The panel still owns shape bootstrap, error display, and follow-up.
export function DefaultSurface({
  ticket,
  state,
  phase,
  busy,
  loadingState,
  refiningOpen,
  isShapePhase,
  lastAppliedFields,
  onCancelRefine,
  onOpenRefine,
  runTurn,
}: SurfaceProps) {
  const Agent = resolveAgent(phase.category)
  // Same predicate the original panel used: while the user is on the
  // initial shape turn for this phase, show the refine form by default;
  // once we're in 'refine', tuck it behind the "Refine action" button.
  const showQuestions = refiningOpen || isShapePhase

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            Help with: {phase.title}
          </p>
          {phase.action ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {phase.action}
            </p>
          ) : null}
        </div>
        <PhaseCategoryPill category={phase.category} />
      </div>

      {/* Per-phase DoD checklist for the current phase. The compact
          per-row variant lives in PhaseRow elsewhere (action plan
          summary); this is the standalone surface variant. */}
      {phase.definition_of_done.length > 0 ? (
        <PhaseDodChecklist ticket={ticket} state={state} phase={phase} />
      ) : null}

      {showQuestions ? (
        // eslint-disable-next-line react-hooks/static-components
        <Agent
          // Remount on phase change so any local state in the agent
          // (answer drafts, kickoff guards) resets cleanly.
          key={phase.id}
          ticket={ticket}
          state={state}
          phase={phase}
          busy={busy}
          loadingState={loadingState}
          refiningOpen={refiningOpen}
          onCancel={onCancelRefine}
          runTurn={runTurn}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Answer a few questions to refine this action.
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onOpenRefine}
            disabled={busy}
          >
            <RefreshCcw className="h-3 w-3" aria-hidden />
            Refine action
          </Button>
        </div>
      )}

      {lastAppliedFields.length > 0 && !busy ? (
        <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3 w-3 text-primary" aria-hidden />
          <span>
            Updated{' '}
            <span className="text-foreground">{lastAppliedFields.join(', ')}</span>{' '}
            on the ticket.
          </span>
        </div>
      ) : null}

      {busy ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Thinking…
        </div>
      ) : null}
    </div>
  )
}

// Per-phase DoD checklist. Standalone variant used by surfaces — full
// header ("Definition of done · this phase") + count, since the
// surface body has room for it. The compact variant for the rail/list
// rows lives inline in TicketAssistPanel.PhaseRow.
function PhaseDodChecklist({
  ticket,
  state,
  phase,
}: {
  ticket: Ticket
  state: AssistState
  phase: ShapePhaseEntry
}) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null)
  const items = phase.definition_of_done
  if (items.length === 0) return null
  const doneCount = items.filter((d) => d.done).length

  async function toggle(i: number) {
    if (busyIdx !== null) return
    setBusyIdx(i)
    try {
      await togglePhaseDodItem(ticket, state, phase.id, i)
    } catch (err) {
      console.error('toggle phase dod failed', err)
    } finally {
      setBusyIdx(null)
    }
  }

  return (
    <div className="space-y-1 rounded-md border bg-background/40 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Definition of done · this phase
        </span>
        <span className="text-[10px] text-muted-foreground">
          {doneCount}/{items.length}
        </span>
      </div>
      <ul className="space-y-0.5">
        {items.map((d, i) => (
          <li key={`${phase.id}-${i}`} className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => void toggle(i)}
              disabled={busyIdx !== null}
              aria-pressed={d.done}
              className={cn(
                'mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors',
                d.done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-muted-foreground/40 bg-background hover:border-foreground/60',
              )}
              aria-label={d.done ? `Mark "${d.item}" not done` : `Mark "${d.item}" done`}
            >
              {d.done ? <CheckCircle2 className="h-3 w-3" /> : null}
            </button>
            <span
              className={cn(
                'text-[12px] leading-snug',
                d.done && 'text-muted-foreground line-through decoration-muted-foreground/40',
              )}
            >
              {d.item}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
