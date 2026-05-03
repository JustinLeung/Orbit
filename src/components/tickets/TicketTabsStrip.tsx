import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ExternalLink,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Search,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAllTickets } from '@/lib/queries'
import { useTicketTabs } from '@/lib/ticketTabs'
import { STATUS_META } from '@/components/tickets/status-meta'
import type { Ticket } from '@/types/orbit'

// Tab strip + ⌘O jump popover for the non-modal ticket detail surface.
// Tabs left, action cluster (Jump · plan-rail toggle · …) on the right.
//
// Active tab is determined by the URL (the `:shortId` route param), passed
// in as `activeShortId` so this component stays decoupled from routing.

export function TicketTabsStrip({
  activeShortId,
  planCollapsed,
  onTogglePlan,
}: {
  activeShortId: number | null
  planCollapsed: boolean
  onTogglePlan: () => void
}) {
  const { openIds, closeTab } = useTicketTabs()
  const { data: tickets } = useAllTickets()
  const navigate = useNavigate()
  const [jumpOpen, setJumpOpen] = useState(false)

  // ⌘O / Ctrl+O — global jump-to-loop trigger. Skipped while typing so the
  // shortcut doesn't eat normal input.
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      )
    }
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() !== 'o') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      setJumpOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ticketById = new Map(tickets.map((t) => [t.short_id, t]))
  const tabs: Ticket[] = openIds
    .map((id) => ticketById.get(id))
    .filter((t): t is Ticket => Boolean(t))

  function selectTab(shortId: number) {
    navigate(`/loop/${shortId}`)
  }

  function handleClose(shortId: number) {
    const next = closeTab(shortId)
    if (shortId !== activeShortId) return
    if (next == null) {
      navigate('/now')
    } else {
      navigate(`/loop/${next}`)
    }
  }

  function handleJumpOpen(shortId: number) {
    selectTab(shortId)
    setJumpOpen(false)
  }

  return (
    <div className="flex shrink-0 items-stretch border-b bg-muted/40">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none]">
        {tabs.map((t) => {
          const meta = STATUS_META[t.status]
          const Icon = meta.icon
          const isActive = t.short_id === activeShortId
          return (
            <div
              key={t.short_id}
              className={cn(
                'group relative flex min-w-0 max-w-[220px] items-center gap-1.5 border-r px-2.5 py-1.5 text-[12px] transition-colors',
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
              )}
            >
              <button
                type="button"
                onClick={() => selectTab(t.short_id)}
                className="flex min-w-0 items-center gap-1.5"
                title={t.title}
              >
                <Icon className={cn('h-3 w-3 shrink-0', meta.tone)} />
                <span className="truncate">{t.title || 'Untitled loop'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClose(t.short_id)
                }}
                className="ml-1 rounded p-0.5 text-muted-foreground/70 opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                aria-label={`Close tab ${t.title}`}
              >
                <X className="h-3 w-3" />
              </button>
              {/* Cover the bottom border for the active tab. */}
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 -bottom-px h-px bg-background"
                />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-0.5 px-1">
        <div className="relative">
          <button
            type="button"
            onClick={() => setJumpOpen((v) => !v)}
            aria-expanded={jumpOpen}
            title="Jump to loop (⌘O)"
            className={cn(
              'inline-flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-[11.5px] text-muted-foreground hover:bg-muted hover:text-foreground',
              jumpOpen && 'bg-muted text-foreground',
            )}
          >
            <Search className="h-3 w-3" />
            <span>Jump</span>
            <span className="ml-1 rounded border px-1 text-[9px] text-muted-foreground/70">
              ⌘O
            </span>
          </button>
          {jumpOpen ? (
            <JumpPopover
              tickets={tickets}
              openIds={openIds}
              onOpen={handleJumpOpen}
              onClose={() => setJumpOpen(false)}
            />
          ) : null}
        </div>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <IconButton
          onClick={onTogglePlan}
          title={planCollapsed ? 'Show plan rail' : 'Hide plan rail'}
        >
          {planCollapsed ? (
            <PanelRightOpen className="h-3 w-3" />
          ) : (
            <PanelRightClose className="h-3 w-3" />
          )}
        </IconButton>
        <IconButton title="Open in new window" disabled>
          <ExternalLink className="h-3 w-3" />
        </IconButton>
        <IconButton title="More" disabled>
          <MoreHorizontal className="h-3 w-3" />
        </IconButton>
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      {children}
    </button>
  )
}

function JumpPopover({
  tickets,
  openIds,
  onOpen,
  onClose,
}: {
  tickets: Ticket[]
  openIds: number[]
  onOpen: (shortId: number) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const filtered = q
    ? tickets.filter((t) =>
        (t.title ?? '').toLowerCase().includes(q.toLowerCase()),
      )
    : tickets

  return (
    <div
      ref={ref}
      className="absolute right-0 top-[calc(100%+6px)] z-50 w-[340px] overflow-hidden rounded-lg border bg-popover shadow-xl"
    >
      <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(filtered.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const t = filtered[active]
              if (t) onOpen(t.short_id)
            }
          }}
          placeholder="Find a loop…"
          className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted-foreground"
        />
        <span className="rounded border px-1 text-[9px] text-muted-foreground">
          esc
        </span>
      </div>
      <div className="max-h-[320px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            No matches.
          </div>
        ) : (
          filtered.map((t, i) => {
            const meta = STATUS_META[t.status]
            const Icon = meta.icon
            const isOpen = openIds.includes(t.short_id)
            return (
              <button
                type="button"
                key={t.short_id}
                onMouseEnter={() => setActive(i)}
                onClick={() => onOpen(t.short_id)}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px]',
                  i === active ? 'bg-muted' : '',
                )}
              >
                <Icon className={cn('h-3 w-3', meta.tone)} />
                <span className="w-9 text-[10px] tabular-nums text-muted-foreground">
                  #{t.short_id}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {t.title || 'Untitled loop'}
                </span>
                {isOpen ? (
                  <span className="rounded-sm bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                    tab
                  </span>
                ) : null}
              </button>
            )
          })
        )}
      </div>
      <div className="flex items-center gap-3 border-t bg-muted/40 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-background px-1">↑↓</kbd> nav
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="rounded border bg-background px-1">↵</kbd> open
        </span>
      </div>
    </div>
  )
}
