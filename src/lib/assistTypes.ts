// Shared with server/lib/assistTypes.ts (mirror this if you change one).
// They're duplicated rather than shared because client + server have
// separate tsconfigs and cross-tree imports are messy.

export type AssistPhase = 'shape' | 'position' | 'next_steps' | 'done'

export type PhaseCategory =
  | 'planning'
  | 'research'
  | 'doing'
  | 'waiting'
  | 'deciding'
  | 'closing'

export const PHASE_CATEGORIES: PhaseCategory[] = [
  'planning',
  'research',
  'doing',
  'waiting',
  'deciding',
  'closing',
]

export type AssistMessage = {
  role: 'user' | 'assistant'
  text: string
  ts: string
}

export type ShapePhaseStatus =
  | 'not_started'
  | 'in_progress'
  | 'done'
  | 'blocked'

export type ShapePhaseEntry = {
  id: string
  title: string
  description: string | null
  status: ShapePhaseStatus
  category: PhaseCategory
}

export type Shape = {
  goal: string | null
  phases: ShapePhaseEntry[]
  completion_criteria: string[]
  inputs_needed: string[]
}

export type Position = {
  current_phase_id: string | null
  blockers: string[]
  notes: string | null
}

export type NextStep = {
  kind: 'next_step' | 'research'
  title: string
  details: string | null
  category: PhaseCategory
}

export type AssistState = {
  phase: AssistPhase
  shape: Shape | null
  position: Position | null
  next_steps: NextStep[] | null
  messages: AssistMessage[]
}
