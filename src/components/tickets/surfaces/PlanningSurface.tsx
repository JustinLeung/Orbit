import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConstraintPills } from '@/components/tickets/ConstraintPills'
import {
  PreMortemConfirmList,
  type PreMortemRisk,
} from '@/components/tickets/PreMortemConfirmList'
import { PlanningAgent } from '@/components/tickets/agents/PlanningAgent'
import { lockInPlan, runPreMortem } from '@/lib/queries'
import { checkLockInPreconditions } from '@/lib/lockInPlan'
import type { SurfaceProps } from './types'

// Planning surface — replaces the generic assist-panel body when the
// current phase's category is 'planning'. The reading order is the
// flow we want users in: scope → risks → answer → commit.
//
//   ✦ header                         ← what this is
//   ─────────────────────────────────
//   constraint pills                 ← scope
//   ─────────────────────────────────
//   pre-mortem (button or list)      ← risks
//   ─────────────────────────────────
//   interview (PlanningAgent)        ← answer
//   ─────────────────────────────────
//   "Lock in the plan" button        ← commit
//
// The pre-mortem affordance + lock-in button are explicit (no auto-
// fire). Constraint pills mutate ticket.context directly; lock-in
// updates ticket DoD via lockInPlan.

export function PlanningSurface(props: SurfaceProps) {
  const {
    ticket,
    state,
    phase,
    busy,
    loadingState,
    refiningOpen,
    isShapePhase,
    lastAppliedFields,
    onCancelRefine,
    onTicketChange,
    runTurn,
  } = props

  // ── Lock-in ────────────────────────────────────────────────────────
  const lockInCheck = checkLockInPreconditions(
    {
      goal: ticket.goal,
      definition_of_done:
        (ticket.definition_of_done as Array<{ item: string; done: boolean }> | null) ??
        null,
    },
    state,
  )
  const [lockInBusy, setLockInBusy] = useState(false)
  const [lockInError, setLockInError] = useState<string | null>(null)

  async function handleLockIn() {
    setLockInBusy(true)
    setLockInError(null)
    try {
      const result = await lockInPlan(ticket, state)
      onTicketChange?.(result.ticket)
    } catch (err) {
      setLockInError(err instanceof Error ? err.message : String(err))
    } finally {
      setLockInBusy(false)
    }
  }

  // ── Pre-mortem ─────────────────────────────────────────────────────
  // Local-only — risks aren't persisted. Each accepted risk hits
  // addOpenQuestion via the confirm list.
  const [premortemBusy, setPremortemBusy] = useState(false)
  const [premortemError, setPremortemError] = useState<string | null>(null)
  const [premortemRisks, setPremortemRisks] = useState<PreMortemRisk[] | null>(
    null,
  )

  async function handleRunPreMortem() {
    setPremortemBusy(true)
    setPremortemError(null)
    try {
      const risks = await runPreMortem(ticket, state)
      setPremortemRisks(risks)
    } catch (err) {
      setPremortemError(err instanceof Error ? err.message : String(err))
    } finally {
      setPremortemBusy(false)
    }
  }

  // ── Interview slot ─────────────────────────────────────────────────
  // PlanningAgent handles its own kickoff effect when refiningOpen or
  // isShapePhase is true and there's no pending question yet. The
  // surface always wants the interview visible on the planning surface
  // — there's no "Refine action" intermediate button here.
  const wantInterview = refiningOpen || isShapePhase

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Sparkles className="mr-1 inline h-3 w-3 text-primary" aria-hidden />
            Planning · {phase.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Scope it, sanity-check it, then lock it in.
          </p>
        </div>
      </div>

      {/* Scope ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Constraints
        </p>
        <ConstraintPills ticket={ticket} onTicketChange={onTicketChange} />
      </div>

      {/* Risks ────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {premortemRisks === null ? (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-background/40 px-2.5 py-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden />
              What could go wrong?
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void handleRunPreMortem()}
              disabled={premortemBusy || busy || lockInBusy}
            >
              {premortemBusy ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Surfacing…
                </>
              ) : (
                'Run pre-mortem'
              )}
            </Button>
          </div>
        ) : (
          <PreMortemConfirmList
            ticketId={ticket.id}
            risks={premortemRisks}
            onClose={() => setPremortemRisks(null)}
          />
        )}
        {premortemError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] text-destructive">
            {premortemError}
          </p>
        ) : null}
      </div>

      {/* Interview ───────────────────────────────────────────────── */}
      {wantInterview ? (
        <PlanningAgent
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
      ) : null}

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

      {/* Commit ─────────────────────────────────────────────────── */}
      <div className="border-t pt-3">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={!lockInCheck.ok || lockInBusy || busy}
          onClick={() => void handleLockIn()}
          title={
            lockInCheck.ok
              ? 'Promote each phase action into the ticket DoD and advance to the next phase'
              : lockInDisabledHint(lockInCheck.reason)
          }
          className="w-full"
        >
          {lockInBusy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Locking in…
            </>
          ) : (
            <>
              <CheckSquare className="h-3 w-3" aria-hidden />
              Lock in the plan
            </>
          )}
        </Button>
        {!lockInCheck.ok ? (
          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
            {lockInDisabledHint(lockInCheck.reason)}
          </p>
        ) : null}
        {lockInError ? (
          <p className="mt-1 text-[11px] leading-tight text-destructive">
            {lockInError}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function lockInDisabledHint(
  reason: 'no_goal' | 'no_phases' | 'no_dod_item',
): string {
  switch (reason) {
    case 'no_goal':
      return 'Set a goal first — the loop needs a one-line outcome.'
    case 'no_phases':
      return 'Add at least one phase first.'
    case 'no_dod_item':
      return 'Add at least one DoD item to the ticket first.'
  }
}
