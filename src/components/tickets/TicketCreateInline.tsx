import { useState } from 'react'
import { Dialog } from 'radix-ui'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createTicket } from '@/lib/queries'
import type { Ticket, TicketStatus } from '@/types/orbit'

// Title-only quick capture. Hit Enter → ticket created → caller routes the
// user into the ticket detail dialog where the assist panel takes over. We
// no longer do a multi-step capture chat; everything past "what is this"
// happens inside the ticket itself.
export function TicketCreateInline({
  open,
  onOpenChange,
  onCreated,
  defaultStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (ticket: Ticket) => void
  defaultStatus?: TicketStatus
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[20vh] z-50 flex w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
          aria-describedby={undefined}
        >
          {/* Form lives inside Dialog.Content so Radix's unmount-on-close
              resets state every time the dialog reopens. */}
          <CaptureForm
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
            defaultStatus={defaultStatus}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CaptureForm({
  onClose,
  onCreated,
  defaultStatus,
}: {
  onClose: () => void
  onCreated: (ticket: Ticket) => void
  defaultStatus?: TicketStatus
}) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const trimmed = title.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const ticket = await createTicket({
        title: trimmed,
        type: 'task',
        status: defaultStatus ?? 'inbox',
      })
      onCreated(ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <Dialog.Title className="text-sm font-medium">New ticket</Dialog.Title>
        <Dialog.Close
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Dialog.Close>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-3 px-4 py-4"
      >
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What's the open loop?"
          disabled={submitting}
          aria-label="Ticket title"
        />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press Enter to capture — we'll open the ticket and help shape it.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={title.trim() === '' || submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Capturing…
                </>
              ) : (
                'Capture'
              )}
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}
