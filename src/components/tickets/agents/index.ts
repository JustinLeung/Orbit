import { DefaultAgent } from './DefaultAgent'
import { PlanningAgent } from './PlanningAgent'
import type { AgentComponent, PhaseAgentRegistry } from './types'

// Per-PhaseCategory dispatcher. Each entry is a React component that
// owns the refine surface for that category. Categories without an
// entry fall back to DEFAULT_AGENT (the static structured-questions
// form). Adding a new agent is a one-line registry entry plus the
// component file.
//
// Currently bespoke: planning. The other 5 categories use the default
// fallback until their per-agent ticket lands (ORB-29..ORB-33).
export const PHASE_AGENTS: PhaseAgentRegistry = {
  planning: PlanningAgent,
}

export const DEFAULT_AGENT: AgentComponent = DefaultAgent

export function resolveAgent(
  category: import('@/lib/assistTypes').PhaseCategory,
): AgentComponent {
  return PHASE_AGENTS[category] ?? DEFAULT_AGENT
}

export type { AgentComponent, AgentProps, AgentRunTurnArgs } from './types'
