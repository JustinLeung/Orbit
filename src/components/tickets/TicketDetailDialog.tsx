import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Ticket, TicketType, TicketStatus } from '@/types/orbit'

const TYPE_LABEL: Record<TicketType, string> = {
  task: 'Task',
  research: 'Research',
  decision: 'Decision',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  admin: 'Admin',
  relationship: 'Relationship',
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  inbox: 'Inbox',
  active: 'Active',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  review: 'Review',
  closed: 'Closed',
  dropped: 'Dropped',
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-background shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
          )}
          aria-describedby={undefined}
        >
          {ticket ? (
            <>
              <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {TYPE_LABEL[ticket.type]}
                    </span>
                    <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {STATUS_LABEL[ticket.status]}
                    </span>
                  </div>
                  <Dialog.Title className="mt-2 text-base font-semibold leading-snug">
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

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="space-y-5">
                  {ticket.goal ? (
                    <Field label="Goal">{ticket.goal}</Field>
                  ) : null}
                  {ticket.description ? (
                    <Field label="Description">
                      <p className="whitespace-pre-wrap">
                        {ticket.description}
                      </p>
                    </Field>
                  ) : null}
                  {ticket.next_action ? (
                    <Field label="Next action">{ticket.next_action}</Field>
                  ) : null}
                  {ticket.next_action_at ? (
                    <Field label="Next action at">
                      {formatDate(ticket.next_action_at)}
                    </Field>
                  ) : null}
                  {ticket.waiting_on ? (
                    <Field label="Waiting on">{ticket.waiting_on}</Field>
                  ) : null}
                  {ticket.context ? (
                    <Field label="Context">
                      <p className="whitespace-pre-wrap">{ticket.context}</p>
                    </Field>
                  ) : null}

                  <div className="grid grid-cols-3 gap-4">
                    {ticket.urgency != null ? (
                      <Field label="Urgency">{ticket.urgency}/4</Field>
                    ) : null}
                    {ticket.importance != null ? (
                      <Field label="Importance">{ticket.importance}/5</Field>
                    ) : null}
                    {ticket.energy_required != null ? (
                      <Field label="Energy">{ticket.energy_required}/5</Field>
                    ) : null}
                  </div>

                  {ticket.agent_mode !== 'none' ||
                  ticket.agent_status !== 'idle' ? (
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Agent mode">{ticket.agent_mode}</Field>
                      <Field label="Agent status">{ticket.agent_status}</Field>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-4 border-t pt-5 text-xs text-muted-foreground">
                    <Field label="Created">
                      {formatDate(ticket.created_at)}
                    </Field>
                    <Field label="Updated">
                      {formatDate(ticket.updated_at)}
                    </Field>
                    {ticket.closed_at ? (
                      <Field label="Closed">
                        {formatDate(ticket.closed_at)}
                      </Field>
                    ) : null}
                  </div>
                </dl>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
