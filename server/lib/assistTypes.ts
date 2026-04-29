// shape: AI generates the arc — phases each carry one concrete `action`.
// refine: user has picked their current phase and given context (typically
//   via structured questions). The model updates THAT phase's action in
//   place. Other phases remain stable unless something obvious has changed.
// done: wrap-up; client just stops asking.
export type AssistPhase = 'shape' | 'refine' | 'done'

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
  // The single concrete imperative the user can do for this phase, e.g.
  // "Email three venues for availability". Phases ARE the action plan.
  action: string | null
  // Optional clarification of the action ("Ask for May 18, capacity 80").
  action_details: string | null
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

export type AssistState = {
  phase: AssistPhase
  shape: Shape | null
  position: Position | null
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
