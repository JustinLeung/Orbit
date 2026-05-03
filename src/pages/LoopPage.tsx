import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useTicketByShortId } from '@/lib/queries'
import { useTicketTabs } from '@/lib/ticketTabs'
import { TicketDetailView } from '@/components/tickets/TicketDetailView'
import { TicketTabsStrip } from '@/components/tickets/TicketTabsStrip'

// /loop/:shortId — non-modal ticket detail surface. The route param is the
// per-user `short_id`; we look the ticket up via `useTicketByShortId` and
// render the new center-body + right-rail layout.

export function LoopPage() {
  const params = useParams<{ shortId: string }>()
  const shortId = params.shortId ? Number.parseInt(params.shortId, 10) : NaN
  const valid = Number.isFinite(shortId)
  const { data: ticket, loading, error } = useTicketByShortId(
    valid ? shortId : null,
  )
  const { openTab } = useTicketTabs()
  const [planCollapsed, setPlanCollapsed] = useState(false)

  // Make sure the URL's loop is also represented in the tab strip — covers
  // direct navigation (paste a /loop/N URL, follow a back-button click) so
  // the tab bar doesn't lose its "you are here" affordance.
  useEffect(() => {
    if (valid && Number.isFinite(shortId)) openTab(shortId)
  }, [shortId, valid, openTab])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TicketTabsStrip
        activeShortId={valid ? shortId : null}
        planCollapsed={planCollapsed}
        onTogglePlan={() => setPlanCollapsed((v) => !v)}
      />
      {!valid ? (
        <EmptyState message="That URL doesn't look like a loop." />
      ) : loading && !ticket ? (
        <EmptyState message="Loading loop…" />
      ) : error ? (
        <EmptyState message={error.message} />
      ) : !ticket ? (
        <EmptyState message="Loop not found." />
      ) : (
        <TicketDetailView
          ticket={ticket}
          planCollapsed={planCollapsed}
          // After delete, drop the tab + bounce to /now — the tab close
          // handler in TicketTabsStrip already covers user-initiated tab
          // closes, but a destructive close needs its own path.
          onAfterDelete={() => {
            window.location.assign('/now')
          }}
        />
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-muted/20 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
      </div>
      <div className="text-[12.5px] text-muted-foreground">{message}</div>
      <div className="text-[10.5px] text-muted-foreground">
        Press{' '}
        <kbd className="rounded border bg-background px-1 text-[10px]">⌘O</kbd>{' '}
        to jump to a loop, or go to{' '}
        <Link to="/now" className="underline">
          /now
        </Link>
        .
      </div>
    </div>
  )
}
