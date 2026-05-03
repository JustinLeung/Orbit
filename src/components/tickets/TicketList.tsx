import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTicketTabs } from '@/lib/ticketTabs'
import { STATUS_OPTIONS } from '@/components/tickets/form-constants'
import {
  PropertyMenu,
  PropertyPill,
  type PropertyMenuOption,
} from '@/components/tickets/PropertyPill'
import {
  STATUS_META,
  STATUS_ORDER,
  TYPE_META,
  urgencyMeta,
} from '@/components/tickets/status-meta'
import { updateTicket } from '@/lib/queries'
import type { Ticket, TicketStatus } from '@/types/orbit'

// ── Date helpers ──────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────

export function TicketList({
  tickets,
  loading,
  error,
  empty,
  groupBy = 'status',
}: {
  tickets: Ticket[]
  loading: boolean
  error: Error | null
  empty: string
  // When groupBy === 'none', render a flat list (used by views like Now
  // where the status grouping is implied or not useful).
  groupBy?: 'status' | 'none'
}) {
  const navigate = useNavigate()
  const { openTab } = useTicketTabs()

  function openInTab(ticket: Ticket) {
    openTab(ticket.short_id)
    navigate(`/loop/${ticket.short_id}`)
  }

  // Group + order even when "none" — it lets us reuse the same row code.
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ status: null as TicketStatus | null, items: tickets }]
    }
    const byStatus = new Map<TicketStatus, Ticket[]>()
    for (const t of tickets) {
      const list = byStatus.get(t.status) ?? []
      list.push(t)
      byStatus.set(t.status, list)
    }
    return STATUS_ORDER.filter((s) => byStatus.has(s)).map((s) => ({
      status: s as TicketStatus | null,
      items: byStatus.get(s) ?? [],
    }))
  }, [tickets, groupBy])

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
    <div className="divide-y">
      {groups.map((group, idx) => (
        <TicketGroup
          key={String(group.status ?? 'all') + idx}
          status={group.status}
          items={group.items}
          onSelect={openInTab}
        />
      ))}
    </div>
  )
}

// ── Group ─────────────────────────────────────────────────────────────────

function TicketGroup({
  status,
  items,
  onSelect,
}: {
  status: TicketStatus | null
  items: Ticket[]
  onSelect: (t: Ticket) => void
}) {
  const [open, setOpen] = useState(true)
  const meta = status ? STATUS_META[status] : null
  const Icon = meta?.icon

  return (
    <section>
      {status && meta && Icon ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex w-full items-center gap-2 border-b bg-muted/30 px-8 py-1.5 text-left transition-colors hover:bg-muted/50',
          )}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Icon className={cn('h-3.5 w-3.5', meta.tone)} />
          <span className="text-xs font-medium tracking-wide">
            {meta.label}
          </span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </button>
      ) : null}
      {open ? (
        <ul className="divide-y">
          {items.map((t) => (
            <TicketRow key={t.id} ticket={t} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  onSelect,
}: {
  ticket: Ticket
  onSelect: (t: Ticket) => void
}) {
  const next = formatNextAction(ticket.next_action_at)
  const typeMeta = TYPE_META[ticket.type]
  const urgency = urgencyMeta(ticket.urgency)
  const TypeIcon = typeMeta.icon
  const UrgencyIcon = urgency.icon

  return (
    <li
      className={cn(
        'group relative flex h-10 items-center gap-3 px-8 transition-colors',
        'hover:bg-muted/40 focus-within:bg-muted/40',
      )}
    >
      {/* Status icon — clickable to open menu, otherwise opens row on click */}
      <RowStatusButton ticket={ticket} />

      {/* Type icon */}
      <span
        title={typeMeta.label}
        className="hidden items-center sm:inline-flex"
      >
        <TypeIcon className={cn('h-3.5 w-3.5', typeMeta.tone)} aria-hidden />
      </span>

      {/* ID — Linear-style monospaced prefix */}
      <span className="hidden w-[68px] shrink-0 font-mono text-[11px] text-muted-foreground md:inline">
        #{ticket.short_id}
      </span>

      {/* Title + sub-line */}
      <button
        type="button"
        onClick={() => onSelect(ticket)}
        className="min-w-0 flex-1 text-left focus:outline-none"
      >
        <span className="block truncate text-sm font-medium leading-5">
          {ticket.title}
        </span>
        {ticket.next_action || ticket.waiting_on ? (
          <span className="block truncate text-xs text-muted-foreground">
            {ticket.next_action ? (
              <>→ {ticket.next_action}</>
            ) : (
              <>Waiting on {ticket.waiting_on}</>
            )}
          </span>
        ) : null}
      </button>

      {/* Priority */}
      {ticket.urgency != null ? (
        <span
          title={`Priority: ${urgency.label}`}
          className="hidden md:inline-flex"
        >
          <UrgencyIcon className={cn('h-3.5 w-3.5', urgency.tone)} />
        </span>
      ) : null}

      {/* Due date */}
      {next ? (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            next.overdue ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {next.label}
        </span>
      ) : null}
    </li>
  )
}

function RowStatusButton({ ticket }: { ticket: Ticket }) {
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  const options: PropertyMenuOption<TicketStatus>[] = STATUS_OPTIONS.map(
    (o) => ({
      value: o.value,
      label: STATUS_META[o.value].label,
      icon: STATUS_META[o.value].icon,
      iconClass: STATUS_META[o.value].tone,
    }),
  )
  return (
    <PropertyPill
      icon={Icon}
      iconClass={meta.tone}
      label="Status"
      variant="inline"
      value={null}
      menu={
        <PropertyMenu
          options={options}
          value={ticket.status}
          onSelect={(next) => {
            if (next === ticket.status) return
            updateTicket(
              ticket.id,
              { status: next },
              {
                changedFields: [
                  { field: 'status', old: ticket.status, new: next },
                ],
              },
            ).catch((err) =>
              console.error('row status update failed', err),
            )
          }}
        />
      }
    />
  )
}
