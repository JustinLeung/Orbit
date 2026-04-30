import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { resolveSurface } from '@/components/tickets/surfaces'
import {
  markAssistBootstrapped,
  runAssistTurn,
  updateTicket,
  useLatestAssistState,
} from '@/lib/queries'
import type { AssistState } from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'

// Thin shell around the per-phase "surface" dispatcher. The panel itself
// owns:
//   - shape bootstrap (kicks off the first turn so the user sees a shape
//     without clicking)
//   - error display
//   - "Ask a follow-up" affordance (the demoted free-form chat slot)
//   - optimistic ticket mirror (so other dialog rows reflect mutations
//     the surface makes via runAssistTurn / setNextAction without a
//     round-trip flash)
//
// Every other behavior — DoD checklists, refine forms, planning pills,
// pre-mortem, lock-in — lives in the surface for that phase. See
// src/components/tickets/surfaces/.
export function TicketAssistPanel({
  ticket,
  onTicketChange,
}: {
  ticket: Ticket
  // Lets the parent dialog keep its own `editing` state in sync with
  // ticket mutations the surfaces make (Set as next action,
  // runAssistTurn's ticket_updates, constraint pill saves).
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
  // Keep the panel's mirror in sync when the parent updates the ticket
  // (e.g. constraint pills mutate context → dialog updates editing →
  // panel needs the new context). Same render-time pattern.
  const [trackedTicketRef, setTrackedTicketRef] = useState(ticket)
  if (ticket !== trackedTicketRef && ticket.id === trackedTicketRef.id) {
    setTrackedTicketRef(ticket)
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

  // External changes to persisted (e.g. the rail phase picker) need
  // to flush any stale optimistic override the panel was holding from a
  // prior in-panel turn — otherwise `state = override ?? persisted` would
  // mask the new value. Same render-time pattern used elsewhere.
  const [trackedPersisted, setTrackedPersisted] =
    useState<AssistState | null>(persisted)
  if (persisted !== trackedPersisted) {
    setTrackedPersisted(persisted)
    if (override !== null) setOverride(null)
  }

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

  // Wrapped doTurn for surfaces' embedded agents. Closes the refine
  // surface on a successful turn so the post-refine action becomes the
  // primary thing the user sees again — same behavior as the prior
  // panel implementation.
  async function surfaceRunTurn(args: {
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
    // fields all flip immediately, so there's no visible flash between
    // click and the server returning.
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
  const Surface = currentPhase ? resolveSurface(currentPhase.category) : null

  return (
    <div className="space-y-4">
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

          {/* Stage 2: shape exists but no phase picked — nudge the user
              toward the rail's phase picker. The plan itself is rendered
              by TicketPlanRail, so the panel just points at it. */}
          {shape && !currentPhase && !isDone ? (
            <p className="text-xs font-medium text-primary">
              Pick the phase you're in from the plan rail →
            </p>
          ) : null}

          {/* Stage 3: phase-specific surface owns the body. */}
          {Surface && currentPhase && state && !isDone ? (
            // eslint-disable-next-line react-hooks/static-components
            <Surface
              key={currentPhase.id}
              ticket={liveTicket}
              state={state}
              phase={currentPhase}
              busy={busy}
              loadingState={loadingState}
              refiningOpen={refiningOpen}
              isShapePhase={state.phase === 'shape'}
              lastAppliedFields={lastApplied}
              onSetNextAction={setNextAction}
              onOpenRefine={() => setRefiningOpen(true)}
              onCancelRefine={() => setRefiningOpen(false)}
              onTicketChange={(next) => {
                setLiveTicket(next)
                onTicketChange?.(next)
              }}
              runTurn={surfaceRunTurn}
            />
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
