import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  TicketTabsContext,
  type TicketTabsContextValue,
} from '@/lib/ticketTabs'

// Provider for the loop-tab state used by the non-modal ticket detail view.
// Mounts inside AppLayout so tabs persist across navigation.
export function TicketTabsProvider({ children }: { children: ReactNode }) {
  const [openIds, setOpenIds] = useState<number[]>([])

  const openTab = useCallback((shortId: number) => {
    setOpenIds((cur) => (cur.includes(shortId) ? cur : [...cur, shortId]))
  }, [])

  const closeTab = useCallback((shortId: number): number | null => {
    let next: number | null = null
    setOpenIds((cur) => {
      const idx = cur.indexOf(shortId)
      if (idx < 0) return cur
      const filtered = cur.filter((x) => x !== shortId)
      // Land on the tab that visually replaces the one being closed:
      // prefer the new tab at the same index (the one to the right),
      // otherwise the new last tab.
      next = filtered[idx] ?? filtered[filtered.length - 1] ?? null
      return filtered
    })
    return next
  }, [])

  const reorder = useCallback((nextOrder: number[]) => {
    setOpenIds(nextOrder)
  }, [])

  const value = useMemo<TicketTabsContextValue>(
    () => ({ openIds, openTab, closeTab, reorder }),
    [openIds, openTab, closeTab, reorder],
  )

  return (
    <TicketTabsContext.Provider value={value}>
      {children}
    </TicketTabsContext.Provider>
  )
}
