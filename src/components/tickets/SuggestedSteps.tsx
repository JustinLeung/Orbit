import { Plus, Sparkles } from 'lucide-react'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import { cn } from '@/lib/utils'
import type { ShapePhaseEntry, SuggestedStep } from '@/lib/assistTypes'

// Renders the model's "optional adjacent steps" as one-click chips above
// the AddStepInline affordance. Filters out suggestions whose normalized
// title matches an existing phase, so accepted suggestions disappear
// without needing a separate dismissed-ids store.
//
// Click → caller inserts the suggestion at its declared position via
// `acceptSuggestedStep` (no model call).
export function SuggestedSteps({
  suggestions,
  phases,
  onAccept,
}: {
  suggestions: SuggestedStep[]
  phases: ShapePhaseEntry[]
  onAccept: (s: SuggestedStep) => Promise<void>
}) {
  const existingTitles = new Set(
    phases.map((p) => p.title.trim().toLowerCase()),
  )
  const visible = suggestions.filter(
    (s) => !existingTitles.has(s.title.trim().toLowerCase()),
  )
  if (visible.length === 0) return null

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center gap-1.5 px-1.5">
        <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Optional steps
        </span>
      </div>
      <ul className="space-y-1">
        {visible.map((s) => (
          <li key={s.id}>
            <SuggestedStepChip suggestion={s} onAccept={() => onAccept(s)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function SuggestedStepChip({
  suggestion,
  onAccept,
}: {
  suggestion: SuggestedStep
  onAccept: () => Promise<void>
}) {
  return (
    <button
      type="button"
      onClick={() => void onAccept()}
      title={suggestion.rationale ?? undefined}
      className={cn(
        'group flex w-full items-start gap-2 rounded-md border border-dashed border-border/70 px-2 py-1.5 text-left transition-colors',
        'hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      <Plus
        className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary"
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] leading-tight text-foreground/90">
          {suggestion.title}
        </span>
        {suggestion.rationale ? (
          <span className="mt-0.5 block text-[10.5px] leading-snug text-muted-foreground">
            {suggestion.rationale}
          </span>
        ) : null}
      </span>
      <PhaseCategoryPill category={suggestion.category} />
    </button>
  )
}
