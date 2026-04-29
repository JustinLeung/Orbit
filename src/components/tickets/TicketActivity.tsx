import { useState } from 'react'
import {
  ArrowRightLeft,
  CheckCircle2,
  Circle,
  FilePenLine,
  Sparkles,
  Target,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { addTicketNote, useTicketEvents } from '@/lib/queries'
import { STATUS_META } from '@/components/tickets/status-meta'
import { Textarea } from '@/components/tickets/form-helpers'
import type { TicketEvent, TicketEventType, TicketStatus } from '@/types/orbit'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.round((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 60 * 60) return `${Math.round(diff / 60)}m ago`
  if (diff < 60 * 60 * 24) return `${Math.round(diff / 3600)}h ago`
  if (diff < 60 * 60 * 24 * 30) return `${Math.round(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function fieldLabel(field: string): string {
  return field.replaceAll('_', ' ')
}

type Payload = Record<string, unknown> | null

function payloadOf(event: TicketEvent): Payload {
  const p = event.payload
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    return p as Record<string, unknown>
  }
  return null
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

// ── Event row ─────────────────────────────────────────────────────────────

const FALLBACK_META: { icon: LucideIcon; tone: string; label: string } = {
  icon: Circle,
  tone: 'text-muted-foreground',
  label: 'Updated',
}

function eventMeta(type: TicketEventType): {
  icon: LucideIcon
  tone: string
  label: string
} {
  switch (type) {
    case 'ticket_created':
      return { icon: Sparkles, tone: 'text-primary', label: 'Created' }
    case 'status_changed':
      return {
        icon: ArrowRightLeft,
        tone: 'text-foreground',
        label: 'Status',
      }
    case 'note_added':
      return { icon: FilePenLine, tone: 'text-foreground', label: 'Note' }
    case 'agent_ran':
      return { icon: Sparkles, tone: 'text-primary', label: 'Assist' }
    case 'agent_output_created':
      return { icon: Sparkles, tone: 'text-primary', label: 'Assist' }
    case 'user_feedback_given':
      return { icon: FilePenLine, tone: 'text-foreground', label: 'Feedback' }
    case 'next_action_updated':
      return { icon: Target, tone: 'text-amber-500', label: 'Next action' }
    case 'field_updated':
      return { icon: FilePenLine, tone: 'text-muted-foreground', label: 'Edit' }
    case 'artifact_created':
      return { icon: FilePenLine, tone: 'text-foreground', label: 'Artifact' }
    case 'participant_added':
      return { icon: UserPlus, tone: 'text-emerald-500', label: 'Participant' }
    case 'ticket_closed':
      return { icon: CheckCircle2, tone: 'text-emerald-500', label: 'Closed' }
    case 'ticket_dropped':
      return { icon: XCircle, tone: 'text-muted-foreground', label: 'Dropped' }
    default:
      return FALLBACK_META
  }
}

function noteBody(event: TicketEvent): string | null {
  if (event.event_type !== 'note_added') return null
  return asString(payloadOf(event)?.body)
}

function describe(event: TicketEvent): React.ReactNode {
  const p = payloadOf(event)
  switch (event.event_type) {
    case 'ticket_created':
      return <span>created the ticket</span>
    case 'status_changed': {
      const from = asString(p?.from) as TicketStatus | null
      const to = asString(p?.to) as TicketStatus | null
      if (from && to) {
        return (
          <span>
            changed status{' '}
            <StatusInline status={from} /> →{' '}
            <StatusInline status={to} />
          </span>
        )
      }
      return <span>changed status</span>
    }
    case 'next_action_updated': {
      const newVal = asString(p?.new)
      if (newVal) {
        return (
          <span>
            set next action to{' '}
            <span className="text-foreground">“{newVal}”</span>
          </span>
        )
      }
      return <span>cleared next action</span>
    }
    case 'field_updated': {
      const field = asString(p?.field)
      const newVal = asString(p?.new)
      if (field && newVal) {
        return (
          <span>
            updated {fieldLabel(field)} to{' '}
            <span className="text-foreground">{truncate(newVal, 80)}</span>
          </span>
        )
      }
      if (field) return <span>updated {fieldLabel(field)}</span>
      return <span>updated a field</span>
    }
    case 'agent_ran': {
      const phase = asString(p?.phase)
      return (
        <span>
          assist ran{phase ? <> — phase {phase.replace(/_/g, ' ')}</> : null}
        </span>
      )
    }
    case 'note_added':
      return <span>added a note</span>
    case 'participant_added':
      return <span>added a participant</span>
    case 'ticket_closed':
      return <span>closed the ticket</span>
    case 'ticket_dropped':
      return <span>dropped the ticket</span>
    default:
      return <span>updated the ticket</span>
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}

function StatusInline({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn('h-3 w-3', meta.tone)} />
      <span className="text-foreground">{meta.label}</span>
    </span>
  )
}

// ── Timeline ──────────────────────────────────────────────────────────────

export function TicketActivity({ ticketId }: { ticketId: string }) {
  const { data, loading } = useTicketEvents(ticketId)
  if (loading && data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Loading activity…</p>
    )
  }
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No activity yet. Edits will show up here.
      </p>
    )
  }
  // Reverse-chron so the most recent event is on top.
  const ordered = [...data].reverse()
  return (
    <ol className="relative space-y-3 pl-1">
      <span
        aria-hidden
        className="absolute left-[7px] top-1 bottom-1 w-px bg-border"
      />
      {ordered.map((evt) => {
        const meta = eventMeta(evt.event_type)
        const Icon = meta.icon
        const note = noteBody(evt)
        return (
          <li key={evt.id} className="relative flex items-start gap-2.5 pl-1">
            <span className="z-10 mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-background">
              <Icon className={cn('h-3.5 w-3.5', meta.tone)} aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <span className="text-muted-foreground">{describe(evt)}</span>
              <time
                dateTime={evt.created_at}
                title={absoluteTime(evt.created_at)}
                className="ml-1.5 cursor-help text-[11px] text-muted-foreground/70"
              >
                · {relativeTime(evt.created_at)}
              </time>
              {note ? (
                <p className="mt-1 whitespace-pre-wrap rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm text-foreground">
                  {note}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Note composer ─────────────────────────────────────────────────────────

export function TicketNoteComposer({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = body.trim()
  const canSubmit = trimmed.length > 0 && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      await addTicketNote(ticketId, trimmed)
      setBody('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void submit()
          }
        }}
        rows={2}
        placeholder="Add a note…"
        aria-label="Add a note"
        disabled={submitting}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <>⌘/Ctrl + Enter to submit</>
          )}
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          className={cn(
            'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {submitting ? 'Adding…' : 'Add note'}
        </button>
      </div>
    </div>
  )
}
