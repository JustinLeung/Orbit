import { useState, type FormEvent } from 'react'
import {
  Check,
  Link as LinkIcon,
  Mail,
  MoreHorizontal,
  Paperclip,
  Plus,
  RotateCcw,
  Square,
  Text as TextIcon,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/tickets/form-helpers'
import {
  addOpenQuestion,
  addReference,
  deleteOpenQuestion,
  deleteReference,
  reopenOpenQuestion,
  resolveOpenQuestion,
  updateTicket,
  useTicketOpenQuestions,
  useTicketReferences,
} from '@/lib/queries'
import type {
  DefinitionOfDoneItem,
  Ticket,
  TicketReference,
  TicketReferenceKind,
} from '@/types/orbit'
import type { Json } from '@/types/database'

const SECTION_LABEL_CLS =
  'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'

const REFERENCE_KIND_OPTIONS: Array<{
  value: TicketReferenceKind
  label: string
}> = [
  { value: 'link', label: 'Link' },
  { value: 'snippet', label: 'Snippet' },
  { value: 'attachment', label: 'Attachment' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
]

function ReferenceKindIcon({ kind }: { kind: TicketReferenceKind }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-muted-foreground'
  switch (kind) {
    case 'link':
      return <LinkIcon className={cls} />
    case 'snippet':
      return <TextIcon className={cls} />
    case 'attachment':
      return <Paperclip className={cls} />
    case 'email':
      return <Mail className={cls} />
    default:
      return <MoreHorizontal className={cls} />
  }
}

export function TicketContextSections({
  ticket,
  onTicketChange,
}: {
  ticket: Ticket
  onTicketChange: (next: Ticket) => void
}) {
  return (
    <div className="space-y-5">
      <DefinitionOfDoneSection
        ticket={ticket}
        onTicketChange={onTicketChange}
      />
      <OpenQuestionsSection ticketId={ticket.id} />
      <ReferencesSection ticketId={ticket.id} />
    </div>
  )
}

// ── definition_of_done ───────────────────────────────────────────────────

function DefinitionOfDoneSection({
  ticket,
  onTicketChange,
}: {
  ticket: Ticket
  onTicketChange: (next: Ticket) => void
}) {
  const items = (ticket.definition_of_done as DefinitionOfDoneItem[] | null) ?? []
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function commit(next: DefinitionOfDoneItem[]) {
    const prev = ticket
    const optimistic: Ticket = {
      ...ticket,
      definition_of_done: next as unknown as Json,
    }
    onTicketChange(optimistic)
    try {
      const server = await updateTicket(
        ticket.id,
        { definition_of_done: next as unknown as Json },
        {
          changedFields: [
            {
              field: 'definition_of_done',
              old: items as unknown as Json,
              new: next as unknown as Json,
            },
          ],
        },
      )
      onTicketChange(server)
    } catch (err) {
      console.error('definition_of_done update failed', err)
      onTicketChange(prev)
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setDraft('')
    await commit([...items, { item: text, done: false }])
    setBusy(false)
  }

  async function toggle(idx: number) {
    const next = items.map((it, i) =>
      i === idx ? { ...it, done: !it.done } : it,
    )
    await commit(next)
  }

  async function remove(idx: number) {
    const next = items.filter((_, i) => i !== idx)
    await commit(next)
  }

  const completed = items.filter((it) => it.done).length

  return (
    <section>
      <div className="flex items-center justify-between">
        <span className={SECTION_LABEL_CLS}>Definition of done</span>
        {items.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {completed}/{items.length}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((it, idx) => (
          <li key={idx} className="group flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
            <button
              type="button"
              onClick={() => void toggle(idx)}
              aria-label={it.done ? 'Mark incomplete' : 'Mark complete'}
              className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded border text-muted-foreground hover:text-foreground"
            >
              {it.done ? <Check className="h-3 w-3" /> : <Square className="h-2.5 w-2.5 opacity-0" />}
            </button>
            <span
              className={cn(
                'flex-1 text-sm',
                it.done && 'text-muted-foreground line-through',
              )}
            >
              {it.item}
            </span>
            <button
              type="button"
              onClick={() => void remove(idx)}
              aria-label="Remove item"
              className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="mt-2 flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a completion criterion"
          disabled={busy}
          className="h-7 text-sm"
        />
      </form>
    </section>
  )
}

// ── open_questions ───────────────────────────────────────────────────────

function OpenQuestionsSection({ ticketId }: { ticketId: string }) {
  const { data: questions } = useTicketOpenQuestions(ticketId)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const unresolved = questions.filter((q) => q.resolved_at === null)
  const resolved = questions.filter((q) => q.resolved_at !== null)

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    setDraft('')
    try {
      await addOpenQuestion(ticketId, text)
    } catch (err) {
      console.error('open question add failed', err)
    }
    setBusy(false)
  }

  return (
    <section>
      <span className={SECTION_LABEL_CLS}>Open questions</span>
      <ul className="mt-2 space-y-2">
        {unresolved.map((q) => (
          <OpenQuestionRow key={q.id} id={q.id} question={q.question} resolved={false} />
        ))}
      </ul>
      {resolved.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            {resolved.length} resolved
          </summary>
          <ul className="mt-2 space-y-2">
            {resolved.map((q) => (
              <OpenQuestionRow
                key={q.id}
                id={q.id}
                question={q.question}
                resolved
                resolution={q.resolution}
              />
            ))}
          </ul>
        </details>
      ) : null}
      <form onSubmit={onAdd} className="mt-2 flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an open question"
          disabled={busy}
          className="h-7 text-sm"
        />
      </form>
    </section>
  )
}

function OpenQuestionRow({
  id,
  question,
  resolved,
  resolution,
}: {
  id: string
  question: string
  resolved: boolean
  resolution?: string | null
}) {
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolveDraft, setResolveDraft] = useState('')

  async function submitResolve(e: FormEvent) {
    e.preventDefault()
    try {
      await resolveOpenQuestion(id, resolveDraft || null)
    } catch (err) {
      console.error('resolve open question failed', err)
    }
    setShowResolveForm(false)
    setResolveDraft('')
  }

  return (
    <li className="group rounded px-1 py-0.5 hover:bg-muted/40">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-[2px] inline-block h-1.5 w-1.5 shrink-0 rounded-full',
            resolved ? 'bg-muted-foreground/40' : 'bg-amber-500',
          )}
          aria-hidden
        />
        <div className="flex-1">
          <p
            className={cn(
              'text-sm',
              resolved && 'text-muted-foreground',
            )}
          >
            {question}
          </p>
          {resolved && resolution ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium">→ </span>
              {resolution}
            </p>
          ) : null}
        </div>
        <div className="invisible flex shrink-0 items-center gap-1 group-hover:visible">
          {resolved ? (
            <button
              type="button"
              onClick={() => void reopenOpenQuestion(id)}
              aria-label="Reopen question"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowResolveForm((v) => !v)}
              aria-label="Resolve question"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteOpenQuestion(id)}
            aria-label="Delete question"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {showResolveForm ? (
        <form onSubmit={submitResolve} className="ml-4 mt-1 flex items-center gap-2">
          <Input
            value={resolveDraft}
            onChange={(e) => setResolveDraft(e.target.value)}
            placeholder="Resolution (optional)"
            autoFocus
            className="h-7 text-sm"
          />
          <button
            type="submit"
            className="rounded border bg-muted px-2 py-1 text-xs hover:bg-muted/70"
          >
            Resolve
          </button>
        </form>
      ) : null}
    </li>
  )
}

// ── references ───────────────────────────────────────────────────────────

function ReferencesSection({ ticketId }: { ticketId: string }) {
  const { data: references } = useTicketReferences(ticketId)
  const [kind, setKind] = useState<TicketReferenceKind>('link')
  const [urlOrText, setUrlOrText] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    const v = urlOrText.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await addReference(ticketId, {
        kind,
        url_or_text: v,
        label: label.trim() || null,
      })
      setUrlOrText('')
      setLabel('')
    } catch (err) {
      console.error('reference add failed', err)
    }
    setBusy(false)
  }

  return (
    <section>
      <span className={SECTION_LABEL_CLS}>References</span>
      <ul className="mt-2 space-y-1">
        {references.map((r) => (
          <ReferenceRow key={r.id} reference={r} />
        ))}
      </ul>
      <form onSubmit={onAdd} className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as TicketReferenceKind)}
          className="h-7 w-auto text-xs"
        >
          {REFERENCE_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input
          value={urlOrText}
          onChange={(e) => setUrlOrText(e.target.value)}
          placeholder={kind === 'link' ? 'https://…' : 'Text or pointer'}
          disabled={busy}
          className="h-7 flex-1 text-sm"
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          disabled={busy}
          className="h-7 w-[140px] text-sm"
        />
        <button
          type="submit"
          disabled={busy || !urlOrText.trim()}
          className="rounded border bg-muted px-2 py-1 text-xs hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </section>
  )
}

function ReferenceRow({ reference }: { reference: TicketReference }) {
  const isLink = reference.kind === 'link' && /^https?:\/\//i.test(reference.url_or_text)
  const display = reference.label?.trim() || reference.url_or_text

  return (
    <li className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
      <ReferenceKindIcon kind={reference.kind} />
      {isLink ? (
        <a
          href={reference.url_or_text}
          target="_blank"
          rel="noreferrer"
          className="flex-1 truncate text-sm text-foreground hover:underline"
          title={reference.url_or_text}
        >
          {display}
        </a>
      ) : (
        <span
          className="flex-1 truncate text-sm"
          title={reference.url_or_text}
        >
          {display}
        </span>
      )}
      <button
        type="button"
        onClick={() => void deleteReference(reference.id)}
        aria-label="Remove reference"
        className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  )
}
