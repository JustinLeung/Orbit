// Shared with server/lib/assistTypes.ts (mirror this if you change one).
// They're duplicated rather than shared because client + server have
// separate tsconfigs and cross-tree imports are messy.

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
// declared position. Stable across non-shape turns; the model re-emits
// the full list whenever it returns a `shape`.
export type SuggestedStepPosition = 'before' | 'after' | 'end'

export type SuggestedStep = {
  id: string
  title: string
  category: PhaseCategory
  rationale: string | null
  position: SuggestedStepPosition
  anchor_phase_id: string | null
}

export type Shape = {
  goal: string | null
  phases: ShapePhaseEntry[]
  completion_criteria: string[]
  inputs_needed: string[]
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
  options?: string[] | null
  allow_other?: boolean | null
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
