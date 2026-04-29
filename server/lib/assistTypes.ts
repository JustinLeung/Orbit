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

// Optional adjacent steps the model thinks the user might want to add.
// Surfaced as one-click chips in the plan rail; clicking inserts at the
// declared position. The model emits these alongside the main phases so
// the user gets common suggestions ("Buy lightbulb" before "Change
// lightbulb") without the assistant having to over-decompose by default.
export type SuggestedStepPosition = 'before' | 'after' | 'end'

export type SuggestedStep = {
  id: string
  title: string
  category: PhaseCategory
  rationale: string | null
  position: SuggestedStepPosition
  // Required when position is 'before' or 'after'. Must reference a phase
  // id in the same shape; otherwise the sanitizer falls back to 'end'.
  anchor_phase_id: string | null
}

export type Shape = {
  goal: string | null
  phases: ShapePhaseEntry[]
  completion_criteria: string[]
  inputs_needed: string[]
  // 1-3 optional adjacent steps. Stable across non-shape turns; the model
  // re-emits the full list whenever it returns a `shape`.
  suggested_steps: SuggestedStep[]
}

export type Position = {
  current_phase_id: string | null
  blockers: string[]
  notes: string | null
}

// Kinds of input the model can ask the user for in a one-at-a-time
// interview. Multiple choice ('choice'/'multi_select') is preferred so the
// user picks instead of types. Free-form 'long_text' is a last resort.
export type AssistQuestionKind =
  | 'choice'
  | 'multi_select'
  | 'short_text'
  | 'long_text'

export type DynamicAssistQuestion = {
  id: string
  kind: AssistQuestionKind
  prompt: string
  // Required for 'choice' and 'multi_select'. Should be 2-5 options.
  options?: string[] | null
  // For 'choice'/'multi_select' — when true, the UI also offers an
  // "Other (specify)" free-form input.
  allow_other?: boolean | null
  // Placeholder for 'short_text' / 'long_text'.
  placeholder?: string | null
}

export type AssistState = {
  phase: AssistPhase
  shape: Shape | null
  position: Position | null
  messages: AssistMessage[]
  // The model's pending question for the user, if any. Currently only
  // populated for planning-category phases — that playbook tells the model
  // to interview rather than refine immediately.
  next_question: DynamicAssistQuestion | null
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
