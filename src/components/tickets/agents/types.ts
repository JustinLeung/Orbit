import type {
  AssistState,
  PhaseCategory,
  ShapePhaseEntry,
} from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'

// Shared contract every per-phase "agent" implements. The agent owns the
// refine surface for one PhaseCategory: it renders the form/UI the user
// interacts with on that phase, and emits turns through the supplied
// `runTurn` callback. State (override, busy, lastApplied, error) is
// owned by TicketAssistPanel — agents are pure render + emit.
//
// The dispatcher mounts an agent only when:
//   - a current phase exists (state.position.current_phase_id resolves)
//   - the user wants to refine (showQuestions is true in the panel)
// so agents don't need to defend against missing state. They DO need to
// handle their own kickoff effects (e.g. planning kicks off a turn to
// get its first next_question).
export type AgentRunTurnArgs = {
  userMessage: string | null
  advance: boolean
}

export type AgentProps = {
  ticket: Ticket
  state: AssistState
  phase: ShapePhaseEntry
  busy: boolean
  loadingState: boolean
  // Toggled by user interaction in the panel. When `refiningOpen` is
  // false but the user is in 'shape' phase, the panel still wants the
  // agent surface visible (auto-shows after picking a phase).
  refiningOpen: boolean
  onCancel: () => void
  // Returns the result so agents that need post-turn behavior (e.g. close
  // the surface after a successful submit) can chain. Resolves to null on
  // failure (the panel surfaces the error itself).
  runTurn: (args: AgentRunTurnArgs) => Promise<AssistState | null>
}

export type AgentComponent = React.ComponentType<AgentProps>

// Dispatcher map. Categories without a bespoke agent fall back to
// DEFAULT_AGENT (the static structured-questions form). Adding a new
// per-phase agent is a one-line registry entry.
export type PhaseAgentRegistry = Partial<Record<PhaseCategory, AgentComponent>>
