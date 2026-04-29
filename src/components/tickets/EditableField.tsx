import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

export type EditableFieldProps<T> = {
  label: string
  value: T
  // Read-mode display string. Return null for the placeholder treatment.
  serialize: (value: T) => string | null
  placeholder: string
  // Initial draft string seeded into the input on enter-edit.
  toDraft: (value: T) => string
  parse: (draft: string) => ParseResult<T>
  // Whether two values are equal — controls "no-op save" detection so we
  // don't write events when the user opened+closed without changing anything.
  equals?: (a: T, b: T) => boolean
  renderInput: (args: {
    draft: string
    setDraft: (s: string) => void
    onCommit: () => void
    // For inputs that produce a fresh value synchronously (selects, datetime),
    // bypass the draft state and commit the new value immediately.
    commitWith: (draft: string) => void
    onCancel: () => void
    onKeyDown: (e: KeyboardEvent) => void
    invalid: boolean
    inputRef: (el: HTMLElement | null) => void
  }) => ReactNode
  onSave: (next: T) => Promise<void>
  multiline?: boolean
  // Some fields (selects/datetime) commit on change rather than on blur.
  commitOnChange?: boolean
}

type Mode = 'read' | 'edit' | 'saving'

function defaultEquals<T>(a: T, b: T) {
  return a === b
}

export function EditableField<T>({
  label,
  value,
  serialize,
  placeholder,
  toDraft,
  parse,
  equals = defaultEquals,
  renderInput,
  onSave,
  multiline,
  commitOnChange,
}: EditableFieldProps<T>) {
  const [mode, setMode] = useState<Mode>('read')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLElement | null>(null)

  function startEdit() {
    if (mode !== 'read') return
    setDraft(toDraft(value))
    setError(null)
    setMode('edit')
  }

  function cancel() {
    setMode('read')
    setError(null)
  }

  async function commit(overrideDraft?: string) {
    if (mode === 'saving') return
    const d = overrideDraft ?? draft
    const parsed = parse(d)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (equals(parsed.value, value)) {
      cancel()
      return
    }
    setMode('saving')
    setError(null)
    try {
      await onSave(parsed.value)
      setMode('read')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setMode('edit')
    }
  }

  // Focus the input when we enter edit mode (initial click and after a
  // failed save).
  useEffect(() => {
    if (mode !== 'edit') return
    const el = inputRef.current
    if (!el) return
    if (document.activeElement === el) return
    el.focus()
    if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === '')) {
      el.select()
    }
  }, [mode, error])

  function setInputRef(el: HTMLElement | null) {
    inputRef.current = el
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
      return
    }
    if (e.key === 'Enter') {
      // Single-line: Enter commits.
      // Multiline: only Cmd/Ctrl+Enter commits; bare Enter inserts newline.
      if (multiline && !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      void commit()
    }
  }

  const display = serialize(value)
  const isPlaceholder = display === null || display === ''

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {mode === 'read' ? (
        <button
          type="button"
          onClick={startEdit}
          className={cn(
            'mt-1 block w-full rounded text-left text-sm',
            '-mx-1 px-1 py-0.5 -my-0.5',
            'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            isPlaceholder && 'text-muted-foreground',
          )}
        >
          {isPlaceholder ? placeholder : display}
        </button>
      ) : (
        <div className="mt-1">
          {/* eslint-disable-next-line react-hooks/refs */}
          {renderInput({
            draft,
            setDraft,
            onCommit: () => void commit(),
            commitWith: (d) => void commit(d),
            onCancel: cancel,
            onKeyDown: handleKeyDown,
            invalid: error !== null,
            inputRef: setInputRef,
          })}
          {error ? (
            <p className="mt-1 text-xs text-destructive">{error}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {commitOnChange
              ? 'Esc to cancel'
              : multiline
                ? 'Cmd+Enter to save · Esc to cancel'
                : 'Enter to save · Esc to cancel'}
          </p>
        </div>
      )}
    </div>
  )
}
