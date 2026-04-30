import { useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { addOpenQuestion } from '@/lib/queries'

// Renders the proposed risks from /api/assist/pre-mortem as one row per
// risk, each with "Capture" and "Skip" buttons. Capture goes through
// addOpenQuestion (the same path the assist walkthrough uses) so it
// shows up immediately in the ticket's open-questions list. Skip just
// marks the row dismissed in local state — the next pre-mortem run will
// produce a fresh list. There's no on-disk "skipped" registry on
// purpose: the user should be able to ask again without remembering
// what they previously dismissed.

export type PreMortemRisk = {
  question: string
  rationale: string | null
}

type RowState = 'pending' | 'capturing' | 'captured' | 'skipped' | 'error'

export function PreMortemConfirmList({
  ticketId,
  risks,
  onClose,
}: {
  ticketId: string
  risks: PreMortemRisk[]
  // Called when the user has acted on every row (captured or skipped) —
  // the panel can collapse the list back into a "Run pre-mortem" button.
  onClose: () => void
}) {
  const [states, setStates] = useState<Record<number, RowState>>({})

  function setRow(idx: number, state: RowState) {
    setStates((prev) => ({ ...prev, [idx]: state }))
  }

  async function capture(idx: number, question: string) {
    setRow(idx, 'capturing')
    try {
      await addOpenQuestion(ticketId, question)
      setRow(idx, 'captured')
    } catch (err) {
      console.error('capture pre-mortem question failed', err)
      setRow(idx, 'error')
    }
  }

  const allActed = risks.every((_, i) => {
    const s = states[i]
    return s === 'captured' || s === 'skipped'
  })

  if (risks.length === 0) {
    return (
      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
        Nothing obvious to flag. Try editing the plan or revisit later.
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-1.5 px-1">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Pre-mortem · what could go wrong?
        </span>
      </div>
      <ul className="space-y-1.5">
        {risks.map((r, i) => {
          const s: RowState = states[i] ?? 'pending'
          return (
            <li
              key={`${i}:${r.question}`}
              className={cn(
                'rounded border bg-muted/30 px-2 py-1.5 text-xs',
                s === 'captured' && 'border-emerald-500/30 bg-emerald-500/5',
                s === 'skipped' && 'opacity-50',
              )}
            >
              <p className="leading-snug text-foreground">{r.question}</p>
              {r.rationale ? (
                <p className="mt-0.5 leading-snug text-muted-foreground">
                  {r.rationale}
                </p>
              ) : null}
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                {s === 'captured' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                    <Check className="h-3 w-3" /> Captured
                  </span>
                ) : s === 'skipped' ? (
                  <span className="text-[11px] text-muted-foreground">
                    Skipped
                  </span>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setRow(i, 'skipped')}
                      disabled={s === 'capturing'}
                    >
                      <X className="h-3 w-3" /> Skip
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      onClick={() => void capture(i, r.question)}
                      disabled={s === 'capturing'}
                    >
                      {s === 'capturing' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Capture
                    </Button>
                  </>
                )}
              </div>
              {s === 'error' ? (
                <p className="mt-1 text-[11px] text-destructive">
                  Couldn't save. Try again.
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-end gap-1.5 pt-1">
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onClose}
          disabled={!allActed && Object.keys(states).length === 0}
          title={
            allActed
              ? 'Close pre-mortem'
              : 'Skip or capture each risk first, or close to discard'
          }
        >
          {allActed ? 'Done' : 'Close'}
        </Button>
      </div>
    </div>
  )
}
