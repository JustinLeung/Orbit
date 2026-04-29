import { useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  Search,
  Sparkles,
  Wand2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { TicketAssistChat } from '@/components/tickets/TicketAssistChat'
import { PhaseCategoryPill } from '@/components/tickets/PhaseCategoryPill'
import { updateTicket, useLatestAssistState } from '@/lib/queries'
import type { ShapePhaseStatus } from '@/lib/assistTypes'
import type { Ticket } from '@/types/orbit'

// Read-only summary of the latest assist state, with a "Continue" button
// that opens the full TicketAssistChat in a centered modal.
export function TicketAssistView({ ticket }: { ticket: Ticket }) {
  const { data: state, loading } = useLatestAssistState(ticket.id)
  const [chatOpen, setChatOpen] = useState(false)

  const phase = state?.phase ?? null
  const hasContent =
    !!state &&
    (state.shape !== null ||
      state.position !== null ||
      (state.next_steps?.length ?? 0) > 0)

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assist
          </span>
          {phase && phase !== 'done' ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              {phase.replace('_', ' ')}
            </span>
          ) : null}
          {phase === 'done' ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Wrapped
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setChatOpen(true)}
        >
          {state ? (
            <>
              {phase === 'done' ? 'Reopen' : 'Continue'}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </>
          ) : (
            <>
              <Wand2 className="h-3 w-3" aria-hidden />
              Start
            </>
          )}
        </Button>
      </div>

      {loading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {!loading && !state ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Walk through the shape of this loop, where you are, and what's next.
        </p>
      ) : null}

      {state?.shape && state.shape.phases.length > 0 ? (
        <div className="mt-3">
          {state.shape.goal ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Goal:</span>{' '}
              {state.shape.goal}
            </p>
          ) : null}
          <ol className="mt-1.5 space-y-1">
            {state.shape.phases.map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-sm">
                <PhaseStatusIcon status={p.status} />
                <span className="flex-1">{p.title}</span>
                <PhaseCategoryPill category={p.category} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {state?.position?.blockers && state.position.blockers.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">Blocked on</p>
          <ul className="mt-0.5 list-disc pl-5 text-sm">
            {state.position.blockers.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state?.next_steps && state.next_steps.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Next steps
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {state.next_steps.map((s, i) => (
              <NextStepRow key={i} step={s} ticket={ticket} />
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && state && !hasContent && phase ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Started {phase}. Continue to fill it in.
        </p>
      ) : null}

      <Dialog.Root open={chatOpen} onOpenChange={setChatOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-50 flex max-h-[min(820px,90vh)] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
              'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            )}
            aria-describedby={undefined}
          >
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                <Dialog.Title className="text-base font-semibold leading-snug">
                  {ticket.title}
                </Dialog.Title>
              </div>
              <Dialog.Close
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <TicketAssistChat
              ticket={ticket}
              onClose={() => setChatOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function PhaseStatusIcon({ status }: { status: ShapePhaseStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-primary" />
  if (status === 'in_progress')
    return <CircleDashed className="mt-0.5 h-3.5 w-3.5 text-primary" />
  if (status === 'blocked')
    return <XCircle className="mt-0.5 h-3.5 w-3.5 text-destructive" />
  return <Circle className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
}

function NextStepRow({
  step,
  ticket,
}: {
  step: import('@/lib/assistTypes').NextStep
  ticket: Ticket
}) {
  const Icon = step.kind === 'research' ? Search : Wand2
  const [applying, setApplying] = useState(false)
  const isCurrent = ticket.next_action === step.title
  return (
    <li className="flex items-start gap-2 rounded-md border bg-background px-2.5 py-1.5">
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm leading-snug">{step.title}</p>
          <PhaseCategoryPill category={step.category} />
        </div>
        {step.details ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{step.details}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant={isCurrent ? 'ghost' : 'outline'}
        size="xs"
        disabled={applying || isCurrent}
        onClick={async () => {
          setApplying(true)
          try {
            await updateTicket(
              ticket.id,
              { next_action: step.title },
              {
                changedFields: [
                  {
                    field: 'next_action',
                    old: ticket.next_action,
                    new: step.title,
                  },
                ],
              },
            )
          } finally {
            setApplying(false)
          }
        }}
      >
        {isCurrent ? 'Set' : applying ? 'Setting…' : 'Set as next action'}
      </Button>
    </li>
  )
}
