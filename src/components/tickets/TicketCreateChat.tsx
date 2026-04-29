import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { TicketAssistChat } from '@/components/tickets/TicketAssistChat'
import { cn } from '@/lib/utils'
import { createTicket } from '@/lib/queries'
import type { Ticket, TicketStatus } from '@/types/orbit'

// Centered modal that opens the new-ticket capture flow:
//   1. User types a sentence describing the open loop.
//   2. We create the ticket immediately (status: inbox, title: their text).
//      They can close any time and the ticket sits in their inbox.
//   3. The walkthrough assistant takes over (Shape → Position → Next steps).
//
// "Fill in manually" is still available before the ticket exists; afterwards
// the manual form is reachable from the ticket's detail dialog.
export function TicketCreateChat({
  open,
  onOpenChange,
  onCreated,
  onSwitchToManual,
  defaultStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (ticket: Ticket) => void
  onSwitchToManual: (prefill?: { title?: string }) => void
  defaultStatus?: TicketStatus
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
          {/* Capture flow lives inside Dialog.Content so Radix's unmount on
              close gives us a fresh state slate every time the dialog opens. */}
          <CaptureFlow
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
            onSwitchToManual={onSwitchToManual}
            defaultStatus={defaultStatus}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CaptureFlow({
  onClose,
  onCreated,
  onSwitchToManual,
  defaultStatus,
}: {
  onClose: () => void
  onCreated?: (ticket: Ticket) => void
  onSwitchToManual: (prefill?: { title?: string }) => void
  defaultStatus?: TicketStatus
}) {
  const [initial, setInitial] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)

  async function startCapture() {
    const trimmed = initial.trim()
    if (!trimmed || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await createTicket({
        title: trimmed,
        type: 'task',
        status: defaultStatus ?? 'inbox',
      })
      onCreated?.(created)
      setTicket(created)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  function switchToManual() {
    onSwitchToManual({ title: initial.trim() || undefined })
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <Dialog.Title className="text-base font-semibold leading-snug">
            {ticket ? ticket.title : 'New ticket'}
          </Dialog.Title>
        </div>
        <div className="flex items-center gap-1">
          {!ticket ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={switchToManual}
            >
              Fill in manually
            </Button>
          ) : null}
          <Dialog.Close
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
        </div>
      </div>

      {ticket ? (
        <TicketAssistChat ticket={ticket} onClose={onClose} />
      ) : (
        <InitialInput
          value={initial}
          onChange={setInitial}
          creating={creating}
          error={createError}
          onSubmit={startCapture}
          onSwitchToManual={switchToManual}
        />
      )}
    </>
  )
}

function InitialInput({
  value,
  onChange,
  creating,
  error,
  onSubmit,
  onSwitchToManual,
}: {
  value: string
  onChange: (v: string) => void
  creating: boolean
  error: string | null
  onSubmit: () => void
  onSwitchToManual: () => void
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">What's the open loop?</p>
          <p className="mt-1">
            A sentence is plenty. I'll create the ticket now so you can come
            back any time, and we'll walk through the shape together — what
            done looks like, where you are, and what's next.
          </p>
        </div>
      </div>
      <div className="border-t px-6 py-4">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          <Textarea
            autoFocus
            rows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. Find a Mother's Day gift for my mom"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit()
              }
            }}
            disabled={creating}
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onSwitchToManual}
              className="text-xs text-muted-foreground hover:underline"
            >
              Fill in manually instead
            </button>
            <Button type="submit" disabled={value.trim() === '' || creating}>
              {creating ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Creating…
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
