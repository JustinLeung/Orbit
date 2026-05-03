import { createContext, useContext } from 'react'

// Open tabs in the non-modal ticket view. We key tabs by the per-user
// `short_id` because that's what the URL carries (`/loop/:shortId`) — the
// uuid would force a server round-trip just to translate the URL.
//
// State lives at AppLayout level so tabs survive navigation: hopping over
// to /now and back to /loop/:id shouldn't drop the rest of the open tabs.
export type TicketTabsContextValue = {
  openIds: number[]
  // Add (or move-to-front) a tab. Doesn't navigate — caller routes.
  openTab: (shortId: number) => void
  // Close one tab. Returns the short_id of the next tab the caller should
  // navigate to (or null if there are no more tabs to land on).
  closeTab: (shortId: number) => number | null
  reorder: (next: number[]) => void
}

export const TicketTabsContext = createContext<TicketTabsContextValue | null>(
  null,
)

export function useTicketTabs(): TicketTabsContextValue {
  const ctx = useContext(TicketTabsContext)
  if (!ctx)
    throw new Error('useTicketTabs must be used inside TicketTabsProvider')
  return ctx
}
