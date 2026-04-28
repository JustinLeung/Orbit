import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Person, Ticket, TicketStatus } from '@/types/orbit'

type State<T> = { data: T; loading: boolean; error: Error | null }

function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  initial: T,
): State<T> {
  const [state, setState] = useState<State<T>>({
    data: initial,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((error: Error) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error }))
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

export function useTicketsByStatus(status: TicketStatus) {
  return useAsync<Ticket[]>(
    async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('status', status)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    [status],
    [],
  )
}

// "Now": active tickets with a next_action_at on or before today.
export function useNowTickets() {
  return useAsync<Ticket[]>(
    async () => {
      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('status', 'active')
        .lte('next_action_at', todayEnd.toISOString())
        .order('next_action_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    [],
    [],
  )
}

// "Stuck" surfaces three cases (see PLAN.md §Stuck):
//   - active with no next_action
//   - waiting with overdue next_action_at
//   - review and not updated in 3+ days
export function useStuckTickets() {
  return useAsync<Ticket[]>(
    async () => {
      const now = new Date()
      const threeDaysAgo = new Date(now)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .in('status', ['active', 'waiting', 'review'])
        .order('updated_at', { ascending: true })
      if (error) throw error
      return (data ?? []).filter((t) => {
        if (t.status === 'active') {
          return !t.next_action || t.next_action.trim() === ''
        }
        if (t.status === 'waiting') {
          return (
            t.next_action_at !== null && new Date(t.next_action_at) < now
          )
        }
        if (t.status === 'review') {
          return new Date(t.updated_at) < threeDaysAgo
        }
        return false
      })
    },
    [],
    [],
  )
}

export function usePeople() {
  return useAsync<Person[]>(
    async () => {
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    [],
    [],
  )
}

