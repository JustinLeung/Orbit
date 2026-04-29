import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TicketDetailDialog } from '@/components/tickets/TicketDetailDialog'
import { STATUS_OPTIONS } from '@/components/tickets/form-helpers'
import { updateTicket } from '@/lib/queries'
import type { Ticket, TicketStatus, TicketType } from '@/types/orbit'

const TYPE_LABEL: Record<TicketType, string> = {
  task: 'Task',
  research: 'Research',
  decision: 'Decision',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  admin: 'Admin',
  relationship: 'Relationship',
}

function formatNextAction(iso: string | null): {
  label: string
  overdue: boolean
} | null {
  if (!iso) return null
  const date = new Date(iso)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const overdue = diffMs < 0
  if (Math.abs(diffDays) < 1) return { label: 'today', overdue }
  if (diffDays === 1) return { label: 'tomorrow', overdue }
  if (diffDays === -1) return { label: 'yesterday', overdue }
  if (diffDays < 0)
    return { label: `${Math.abs(diffDays)}d overdue`, overdue }
  if (diffDays < 7) return { label: `in ${diffDays}d`, overdue }
  return {
    label: date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    overdue,
  }
}

export function TicketList({
  tickets,
  loading,
  error,
  empty,
}: {
  tickets: Ticket[]
  loading: boolean
  error: Error | null
  empty: string
}) {
  const [selected, setSelected] = useState<Ticket | null>(null)
  if (loading) {
    return (
      <div className="px-8 py-6 text-sm text-muted-foreground">Loading…</div>
    )
  }
  if (error) {
    return (
      <div className="px-8 py-6 text-sm text-destructive">
        {error.message}
      </div>
    )
  }
  if (tickets.length === 0) {
    return (
      <div className="px-8 py-6 text-sm text-muted-foreground">{empty}</div>
    )
  }
  return (
    <>
      <ul className="divide-y">
        {tickets.map((t) => {
          const next = formatNextAction(t.next_action_at)
          return (
            <li
              key={t.id}
              className="group relative flex items-start gap-4 px-8 py-4 hover:bg-muted/40 focus-within:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => setSelected(t)}
                className="min-w-0 flex-1 text-left focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {TYPE_LABEL[t.type]}
                  </span>
                  <h3 className="truncate text-sm font-medium">{t.title}</h3>
                </div>
                {t.next_action ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    → {t.next_action}
                  </p>
                ) : null}
                {t.waiting_on ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    Waiting on {t.waiting_on}
                  </p>
                ) : null}
              </button>
              <div className="flex shrink-0 items-center gap-3">
                {next ? (
                  <span
                    className={cn(
                      'text-xs',
                      next.overdue
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {next.label}
                  </span>
                ) : null}
                <RowStatusSelect ticket={t} />
              </div>
            </li>
          )
        })}
      </ul>
      <TicketDetailDialog
        ticket={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </>
  )
}

function RowStatusSelect({ ticket }: { ticket: Ticket }) {
  return (
    <select
      aria-label="Status"
      value={ticket.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value as TicketStatus
        if (next === ticket.status) return
        updateTicket(
          ticket.id,
          { status: next },
          {
            changedFields: [
              { field: 'status', old: ticket.status, new: next },
            ],
          },
        ).catch((err) => console.error('row status update failed', err))
      }}
      className="h-[22px] rounded border bg-muted px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
