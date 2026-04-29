import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { DynamicQuestionForm } from '@/components/tickets/DynamicQuestionForm'
import type { AgentProps } from './types'

// Planning agent: drives a one-question-at-a-time interview using the
// model's emitted `next_question`. When the panel wants to refine but
// the model hasn't asked anything yet (just picked the phase, or the
// prior turn refined without asking), the agent auto-kicks off a turn
// so the model can ask its first question. The ref-keyed guard prevents
// loops by tying kickoff to (phaseId, message-count, phase) — we
// re-kickoff if the phase changes or the conversation moves forward.
export function PlanningAgent({
  state,
  phase,
  busy,
  loadingState,
  refiningOpen,
  onCancel,
  runTurn,
}: AgentProps) {
  const nextQuestion = state.next_question ?? null

  const kickoffKey = useRef<string | null>(null)
  useEffect(() => {
    if (nextQuestion) return
    if (busy || loadingState) return
    const wantInterview = refiningOpen || state.phase === 'shape'
    if (!wantInterview) return
    const key = `${phase.id}:${state.messages.length}:${state.phase}`
    if (kickoffKey.current === key) return
    kickoffKey.current = key
    void runTurn({ userMessage: null, advance: state.phase === 'shape' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.phase,
    state.messages.length,
    phase.id,
    busy,
    loadingState,
    refiningOpen,
    nextQuestion,
  ])

  if (nextQuestion) {
    return (
      <DynamicQuestionForm
        // key by question id so switching to a different question
        // remounts the form with empty answer state.
        key={`${phase.id}:${nextQuestion.id}`}
        phase={phase}
        question={nextQuestion}
        busy={busy}
        onCancel={onCancel}
        onSubmit={(answer) =>
          runTurn({
            userMessage: `Q: ${nextQuestion.prompt}\nA: ${answer}`,
            advance: state.phase === 'shape',
          }).then(() => undefined)
        }
      />
    )
  }
  if (busy) {
    return (
      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
        <Loader2 className="mr-1.5 inline h-3 w-3 animate-spin" aria-hidden />
        Thinking up the right question…
      </div>
    )
  }
  // Idle: kickoff effect is about to fire OR the model returned without
  // a question. Render nothing so the panel falls through to the
  // "Refine action" affordance.
  return null
}
