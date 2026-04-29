import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CATEGORY_LABEL } from '@/components/tickets/PhaseCategoryPill'
import { PHASE_CATEGORIES, type PhaseCategory } from '@/lib/assistTypes'
import { cn } from '@/lib/utils'

// Inline "Add a step" affordance for the plan rail. Appends a user-typed
// phase to the existing shape with no model call — the user already knows
// what the step is. Pitched primarily at single-step tickets (where the
// model deliberately produced 1 phase) but useful on any shape that needs
// growth.
//
// `tone` controls copy + visual prominence:
//   - 'primary': larger, with leading copy ("Got more steps? Add them
//     here") — used when the rail has a single phase, so the user knows
//     they CAN grow it.
//   - 'secondary': minimal "+ Add a step" link at the bottom of an
//     existing multi-phase rail.
export function AddStepInline({
  onAdd,
  tone = 'secondary',
}: {
  onAdd: (input: { title: string; category: PhaseCategory }) => Promise<void>
  tone?: 'primary' | 'secondary'
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<PhaseCategory>('doing')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setTitle('')
    setCategory('doing')
    setError(null)
    setOpen(false)
  }

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd({ title: trimmed, category })
      reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    if (tone === 'primary') {
      return (
        <div className="mt-3 rounded-md border border-dashed bg-background/40 px-2.5 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            Got more steps? Add them here.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3 w-3" aria-hidden />
            Add a step
          </button>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3 w-3" aria-hidden />
        Add a step
      </button>
    )
  }

  return (
    <form
      className={cn(
        'mt-2 space-y-2 rounded-md border bg-background p-2',
        tone === 'primary' && 'border-dashed',
      )}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What's the step?"
        disabled={busy}
        aria-label="New step title"
        className="h-7 text-[12.5px]"
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PhaseCategory)}
            disabled={busy}
            className="h-6 rounded-md border border-input bg-transparent px-1 text-[11px] text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {PHASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={reset}
            disabled={busy}
            aria-label="Cancel"
          >
            <X className="h-3 w-3" aria-hidden />
          </Button>
          <Button
            type="submit"
            size="xs"
            disabled={busy || title.trim() === ''}
          >
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </form>
  )
}
