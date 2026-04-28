import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { createTicket } from '@/lib/queries'
import type { Ticket } from '@/types/orbit'

export function QuickAddInput({
  onCreated,
  placeholder = 'Capture a ticket… (Enter to add)',
}: {
  onCreated?: (ticket: Ticket) => void
  placeholder?: string
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
        status: 'inbox',
      })
      setTitle('')
      onCreated?.(ticket)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-b px-8 py-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Plus
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          disabled={submitting}
          aria-label="New ticket title"
          className="border-0 px-0 focus-visible:ring-0 focus-visible:border-0"
        />
      </form>
      {error ? (
        <p className="mt-1 pl-6 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
