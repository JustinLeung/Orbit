import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import { cn } from '@/lib/utils'
import { computeAnswer } from '@/components/tickets/dynamicQuestionAnswer'
import type {
  DynamicAssistQuestion,
  ShapePhaseEntry,
} from '@/lib/assistTypes'

// Renders ONE model-asked question with a kind-appropriate input. Used for
// planning-category phases where the playbook tells the model to interview
// the user (one question at a time, MC preferred) rather than refine
// immediately. Other phase categories continue to use the static
// StructuredQuestionsForm.
//
// On submit, the answer is collapsed into a single string (multi_select
// joins with ", "; "Other" inputs replace the placeholder option) and
// handed back to the parent, which formats it as a labelled Q/A
// user_message for the model.
export function DynamicQuestionForm({
  phase,
  question,
  busy,
  onCancel,
  onSubmit,
}: {
  phase: ShapePhaseEntry
  question: DynamicAssistQuestion
  busy: boolean
  onCancel: () => void
  onSubmit: (answer: string) => Promise<void>
}) {
  const [choice, setChoice] = useState<string | null>(null)
  const [multi, setMulti] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [other, setOther] = useState('')
  const [otherSelected, setOtherSelected] = useState(false)

  const answer = computeAnswer(question, {
    choice,
    multi,
    text,
    other,
    otherSelected,
  })
  const canSubmit = answer.trim() !== '' && !busy

  return (
    <form
      className="space-y-3 rounded-md border bg-background p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        void onSubmit(answer)
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            One question to refine the action
          </p>
          <p className="text-sm">{phase.title}</p>
        </div>
        <PhaseCategoryPill category={phase.category} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{question.prompt}</p>

        {question.kind === 'choice' ? (
          <ChoiceList
            options={question.options ?? []}
            value={choice}
            onChange={(v) => {
              setChoice(v)
              setOtherSelected(false)
            }}
            allowOther={!!question.allow_other}
            otherSelected={otherSelected}
            onOtherSelected={() => {
              setChoice(null)
              setOtherSelected(true)
            }}
            disabled={busy}
          />
        ) : null}

        {question.kind === 'multi_select' ? (
          <MultiSelectList
            options={question.options ?? []}
            value={multi}
            onChange={setMulti}
            allowOther={!!question.allow_other}
            otherSelected={otherSelected}
            onOtherSelected={(checked) => setOtherSelected(checked)}
            disabled={busy}
          />
        ) : null}

        {(question.kind === 'choice' || question.kind === 'multi_select') &&
        otherSelected ? (
          <input
            type="text"
            autoFocus
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Specify…"
            disabled={busy}
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : null}

        {question.kind === 'short_text' ? (
          <input
            type="text"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={question.placeholder ?? ''}
            disabled={busy}
            className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          />
        ) : null}

        {question.kind === 'long_text' ? (
          <Textarea
            rows={3}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={question.placeholder ?? ''}
            disabled={busy}
            className="text-sm"
          />
        ) : null}
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
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {busy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              Answer
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function ChoiceList({
  options,
  value,
  onChange,
  allowOther,
  otherSelected,
  onOtherSelected,
  disabled,
}: {
  options: string[]
  value: string | null
  onChange: (v: string) => void
  allowOther: boolean
  otherSelected: boolean
  onOtherSelected: () => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1">
      {options.map((opt) => (
        <OptionPill
          key={opt}
          label={opt}
          selected={value === opt && !otherSelected}
          onClick={() => onChange(opt)}
          disabled={disabled}
        />
      ))}
      {allowOther ? (
        <OptionPill
          label="Other (specify)"
          selected={otherSelected}
          onClick={onOtherSelected}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}

function MultiSelectList({
  options,
  value,
  onChange,
  allowOther,
  otherSelected,
  onOtherSelected,
  disabled,
}: {
  options: string[]
  value: Set<string>
  onChange: (next: Set<string>) => void
  allowOther: boolean
  otherSelected: boolean
  onOtherSelected: (checked: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1">
      {options.map((opt) => {
        const selected = value.has(opt)
        return (
          <OptionPill
            key={opt}
            label={opt}
            selected={selected}
            onClick={() => {
              const next = new Set(value)
              if (selected) next.delete(opt)
              else next.add(opt)
              onChange(next)
            }}
            disabled={disabled}
          />
        )
      })}
      {allowOther ? (
        <OptionPill
          label="Other (specify)"
          selected={otherSelected}
          onClick={() => onOtherSelected(!otherSelected)}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}

function OptionPill({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string
  selected: boolean
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-input bg-transparent text-foreground hover:bg-muted',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {label}
    </button>
  )
}

