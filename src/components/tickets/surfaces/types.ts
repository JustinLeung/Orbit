import type {
  AssistState,
  PhaseCategory,
  ShapePhaseEntry,
} from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'
import type { AgentRunTurnArgs } from '@/components/tickets/agents/types'

// Surfaces own the *entire* assist-panel body for a given phase
// category. They sit one level above per-phase agents: the surface
// decides what the user sees on this phase (e.g. constraint pills +
// pre-mortem + lock-in for planning, structured Q&A for the default),
// the agent decides how the *refine sub-form* looks within that.
//
// Compare: AgentProps drives the refine form only; SurfaceProps drives
// header, body, and any phase-shaped affordances.
//
// The dispatcher mounts a surface only when:
//   - `state.shape` exists, and
//   - `phase` resolves (the panel has picked a current phase)
// so surfaces don't need to defend against missing state. They DO need
// to handle their own kickoff effects when applicable.

export type SurfaceProps = {
  ticket: Ticket
  state: AssistState
  phase: ShapePhaseEntry
  busy: boolean
  loadingState: boolean
  refiningOpen: boolean
  // True when the panel is in the initial 'shape' phase (the user
  // just picked their phase, the panel auto-shows the refine form).
  // False once we're in 'refine' — surfaces use this to decide whether
  // to default-open or default-collapse their refine slot.
  isShapePhase: boolean
  // Local-only "the assistant just applied these fields" badge
  // payload. Surfaces can render it inline; the panel also renders it
  // outside the surface for now to preserve the existing UI pattern.
  lastAppliedFields: string[]
  // Caller hooks owned by the panel. Surfaces never call updateTicket
  // directly for the next_action gesture — they go through this.
  onSetNextAction: (title: string) => Promise<void> | void
  onOpenRefine: () => void
  onCancelRefine: () => void
  // Mirrors the panel's onTicketChange — surfaces propagate ticket
  // mutations they perform (e.g. constraint pill saves) so the parent
  // dialog stays in sync without a refetch.
  onTicketChange?: (next: Ticket) => void
  runTurn: (args: AgentRunTurnArgs) => Promise<AssistState | null>
}

export type SurfaceComponent = React.ComponentType<SurfaceProps>

export type PhaseSurfaceRegistry = Partial<
  Record<PhaseCategory, SurfaceComponent>
>
