import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import {
  ASSIST_QUESTIONS,
  formatStructuredAnswers,
  type AssistQuestion,
} from '@/components/tickets/assistQuestions'
import type { AgentProps } from './types'

// Fallback agent for any PhaseCategory that doesn't have a bespoke
// component yet. Renders the static 2-4 structured questions for the
// category and submits all answers as one labelled Q/A user_message —
// preserving the pre-dispatcher behavior 1:1.
export function DefaultAgent({
  state,
  phase,
  busy,
  onCancel,
  runTurn,
}: AgentProps) {
  // Remount the form on phase change so answer state resets — the
  // dispatcher keys on phase id for the same reason.
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const questions = ASSIST_QUESTIONS[phase.category]
  const anyAnswer = Object.values(answers).some((v) => v.trim() !== '')

  return (
    <form
      className="space-y-3 rounded-md border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!anyAnswer) return
        void runTurn({
          userMessage: formatStructuredAnswers(
            phase.category,
            phase.title,
            answers,
          ),
          advance: state.phase === 'shape',
        })
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Refine the action for this phase
          </p>
          <p className="text-sm">{phase.title}</p>
        </div>
        <PhaseCategoryPill category={phase.category} />
      </div>
      <div className="space-y-2.5">
        {questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={answers[q.id] ?? ''}
            onChange={(v) =>
              setAnswers((cur) => ({ ...cur, [q.id]: v }))
            }
            disabled={busy}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !anyAnswer}>
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Refining…
            </>
          ) : (
            <>
              Refine action
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: AssistQuestion
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{question.label}</span>
      <Textarea
        rows={question.multiline ? 2 : 1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder}
        disabled={disabled}
        className="text-sm"
      />
    </label>
  )
}
