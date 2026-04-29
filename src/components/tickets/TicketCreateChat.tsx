import { useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/tickets/form-helpers'
import { cn } from '@/lib/utils'
import { createTicket } from '@/lib/queries'
import type { Ticket, TicketStatus, TicketType } from '@/types/orbit'

export type ChatPrefill = {
  title: string
  description: string | null
  type: TicketType
  status: TicketStatus
  goal: string | null
  next_action: string | null
  next_action_at: string | null
  urgency: number | null
  importance: number | null
  energy_required: number | null
  context: string | null
}

type Question = { prompt: string; suggestions: string[] }

type ClarifyResponse =
  | { done: false; question: Question }
  | { done: true; draft: ChatPrefill }

type Turn = { question: string; answer: string }

type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; suggestions?: string[] }

type Phase =
  | { kind: 'initial' }
  | { kind: 'loading' }
  | { kind: 'asking'; question: Question }
  | { kind: 'draft'; draft: ChatPrefill }
  | { kind: 'error'; message: string }

async function callClarify(body: {
  initial: string
  turns: Turn[]
  finalize?: boolean
}): Promise<ClarifyResponse> {
  const res = await fetch('/api/assist/clarify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`)
  }
  return data as ClarifyResponse
}

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
  onSwitchToManual: (prefill?: Partial<ChatPrefill>) => void
  defaultStatus?: TicketStatus
}) {
  const [initial, setInitial] = useState('')
  const [draftInput, setDraftInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [phase, setPhase] = useState<Phase>({ kind: 'initial' })
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setInitial('')
      setDraftInput('')
      setMessages([])
      setTurns([])
      setPhase({ kind: 'initial' })
      setSubmitting(false)
      setCreateError(null)
    }
  }, [open])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, phase])

  function applyResponse(resp: ClarifyResponse) {
    if (resp.done) {
      setPhase({ kind: 'draft', draft: applyDefaultStatus(resp.draft) })
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Here's a draft. Confirm to create, or tweak it before saving.`,
        },
      ])
    } else {
      setPhase({ kind: 'asking', question: resp.question })
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: resp.question.prompt,
          suggestions: resp.question.suggestions,
        },
      ])
    }
  }

  function applyDefaultStatus(draft: ChatPrefill): ChatPrefill {
    if (defaultStatus && draft.status === 'inbox') {
      return { ...draft, status: defaultStatus }
    }
    return draft
  }

  async function startConversation(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setMessages([{ role: 'user', text: trimmed }])
    setPhase({ kind: 'loading' })
    try {
      const resp = await callClarify({ initial: trimmed, turns: [] })
      applyResponse(resp)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    }
  }

  async function answerQuestion(text: string) {
    const trimmed = text.trim()
    if (!trimmed || phase.kind !== 'asking') return
    const newTurn: Turn = { question: phase.question.prompt, answer: trimmed }
    const nextTurns = [...turns, newTurn]
    setTurns(nextTurns)
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }])
    setDraftInput('')
    setPhase({ kind: 'loading' })
    try {
      const resp = await callClarify({ initial, turns: nextTurns })
      applyResponse(resp)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    }
  }

  async function finalizeNow() {
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: 'Just create it now.' },
    ])
    setPhase({ kind: 'loading' })
    try {
      const resp = await callClarify({ initial, turns, finalize: true })
      applyResponse(resp)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    }
  }

  async function confirmDraft(draft: ChatPrefill) {
    setSubmitting(true)
    setCreateError(null)
    try {
      const ticket = await createTicket({
        title: draft.title.trim(),
        description: draft.description,
        type: draft.type,
        status: draft.status,
        goal: draft.goal,
        next_action: draft.next_action,
        next_action_at: draft.next_action_at,
        urgency: draft.urgency,
        importance: draft.importance,
        energy_required: draft.energy_required,
        context: draft.context,
      })
      onCreated?.(ticket)
      onOpenChange(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
      setSubmitting(false)
    }
  }

  function switchToManual() {
    if (phase.kind === 'draft') {
      onSwitchToManual(phase.draft)
    } else if (initial.trim()) {
      onSwitchToManual({ title: initial.trim() })
    } else {
      onSwitchToManual()
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,90vh)] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-2xl',
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
                New ticket
              </Dialog.Title>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={switchToManual}
              >
                Fill in manually
              </Button>
              <Dialog.Close
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
          >
            {phase.kind === 'initial' ? (
              <InitialPrompt />
            ) : (
              <Conversation messages={messages} />
            )}

            {phase.kind === 'loading' ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Thinking…
              </div>
            ) : null}

            {phase.kind === 'draft' ? (
              <DraftPreview draft={phase.draft} />
            ) : null}

            {phase.kind === 'error' ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="font-medium">Assist isn't available right now.</p>
                <p className="mt-1 text-destructive/80">{phase.message}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={switchToManual}
                >
                  Fill in manually
                </Button>
              </div>
            ) : null}
          </div>

          <div className="border-t px-6 py-4">
            {phase.kind === 'initial' ? (
              <InitialInput
                value={initial}
                onChange={setInitial}
                onSubmit={() => {
                  void startConversation(initial)
                }}
              />
            ) : null}

            {phase.kind === 'asking' ? (
              <AnswerInput
                question={phase.question}
                value={draftInput}
                onChange={setDraftInput}
                onSubmit={() => answerQuestion(draftInput)}
                onSuggestion={(s) => answerQuestion(s)}
                onSkip={finalizeNow}
                turnsSoFar={turns.length}
              />
            ) : null}

            {phase.kind === 'draft' ? (
              <DraftActions
                submitting={submitting}
                error={createError}
                onConfirm={() => confirmDraft(phase.draft)}
                onEdit={switchToManual}
              />
            ) : null}

            {phase.kind === 'loading' ? (
              <p className="text-xs text-muted-foreground">
                Press Esc to cancel.
              </p>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function InitialPrompt() {
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">What's the open loop?</p>
      <p className="mt-1">
        A sentence or two is plenty. I'll ask a couple of clarifying questions
        and draft the ticket for you.
      </p>
    </div>
  )
}

function Conversation({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => (
        <Bubble key={i} role={m.role}>
          {m.text}
        </Bubble>
      ))}
    </div>
  )
}

function Bubble({
  role,
  children,
}: {
  role: 'user' | 'assistant'
  children: React.ReactNode
}) {
  if (role === 'assistant') {
    return (
      <div className="flex items-start gap-2">
        <div className="mt-0.5 rounded-full bg-primary/10 p-1">
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          {children}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        {children}
      </div>
    </div>
  )
}

function InitialInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
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
        placeholder="e.g. Follow up with Sam about the Q3 budget"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={value.trim() === ''}>
          Continue
        </Button>
      </div>
    </form>
  )
}

function AnswerInput({
  question,
  value,
  onChange,
  onSubmit,
  onSuggestion,
  onSkip,
  turnsSoFar,
}: {
  question: Question
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onSuggestion: (s: string) => void
  onSkip: () => void
  turnsSoFar: number
}) {
  return (
    <div className="space-y-3">
      {question.suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {question.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <Textarea
          autoFocus
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or type your own answer…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        <Button type="submit" disabled={value.trim() === ''}>
          Send
        </Button>
      </form>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {turnsSoFar + 1} of up to 3</span>
        <button
          type="button"
          onClick={onSkip}
          className="underline-offset-2 hover:underline"
        >
          Skip — just create it
        </button>
      </div>
    </div>
  )
}

function DraftPreview({ draft }: { draft: ChatPrefill }) {
  const rows: Array<[string, string | null]> = [
    ['Type', labelType(draft.type)],
    ['Status', labelStatus(draft.status)],
    ['Goal', draft.goal],
    ['Next action', draft.next_action],
    ['Next action at', formatDateMaybe(draft.next_action_at)],
  ]
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-medium leading-snug">{draft.title}</p>
      {draft.description ? (
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.description}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) =>
          v ? (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-foreground">{v}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  )
}

function DraftActions({
  submitting,
  error,
  onConfirm,
  onEdit,
}: {
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onEdit: () => void
}) {
  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onEdit}
          disabled={submitting}
        >
          Edit details
        </Button>
        <Button type="button" onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create ticket'}
        </Button>
      </div>
    </div>
  )
}

const TYPE_LABELS: Record<TicketType, string> = {
  task: 'Task',
  research: 'Research',
  decision: 'Decision',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  admin: 'Admin',
  relationship: 'Relationship',
}
const STATUS_LABELS: Record<TicketStatus, string> = {
  inbox: 'Inbox',
  active: 'Active',
  waiting: 'Waiting',
  follow_up: 'Follow-up',
  review: 'Review',
  closed: 'Closed',
  dropped: 'Dropped',
}

function labelType(t: TicketType) {
  return TYPE_LABELS[t] ?? t
}
function labelStatus(s: TicketStatus) {
  return STATUS_LABELS[s] ?? s
}
function formatDateMaybe(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
