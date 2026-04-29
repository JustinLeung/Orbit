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

export type TicketReferenceKind =
  | 'link'
  | 'snippet'
  | 'attachment'
  | 'email'
  | 'other'

export type TicketSnapshot = {
  title: string
  description?: string | null
  type?: string | null
  status?: string | null
  goal?: string | null
  next_action?: string | null
  next_action_at?: string | null
  urgency?: number | null
  importance?: number | null
  energy_required?: number | null
  context?: string | null
  definition_of_done?: Array<{ item: string; done: boolean }> | null
  open_questions?: Array<{
    question: string
    resolved: boolean
    resolution: string | null
  }> | null
  references?: Array<{
    kind: TicketReferenceKind
    url_or_text: string
    label: string | null
  }> | null
}
