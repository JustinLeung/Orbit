import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  Person,
  Ticket,
  TicketInsert,
  TicketStatus,
} from '@/types/orbit'

type State<T> = {
  data: T
  loading: boolean
  error: Error | null
  refresh: () => void
}

const TICKETS_CHANGED_EVENT = 'orbit:tickets-changed'

function notifyTicketsChanged() {
  window.dispatchEvent(new CustomEvent(TICKETS_CHANGED_EVENT))
}

function useTicketAsync<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  initial: T,
  { listen }: { listen: boolean } = { listen: false },
): State<T> {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetcher()
      .then((next) => {
        if (!cancelled) {
          setData(next)
          setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!listen) return
    window.addEventListener(TICKETS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(TICKETS_CHANGED_EVENT, refresh)
  }, [listen, refresh])

  return { data, loading, error, refresh }
}

export function useTicketsByStatus(status: TicketStatus) {
  return useTicketAsync<Ticket[]>(
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
    { listen: true },
  )
}

// "Now": active tickets with a next_action_at on or before today.
export function useNowTickets() {
  return useTicketAsync<Ticket[]>(
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
    { listen: true },
  )
}

// "Stuck" surfaces three cases (see PLAN.md §Stuck):
//   - active with no next_action
//   - waiting with overdue next_action_at
//   - review and not updated in 3+ days
export function useStuckTickets() {
  return useTicketAsync<Ticket[]>(
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
    { listen: true },
  )
}

export function usePeople() {
  return useTicketAsync<Person[]>(
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

// createTicket inserts the ticket and a `ticket_created` event in sequence.
// We don't wrap in a transaction because Supabase's REST API doesn't expose
// one — the event insert failing is non-fatal for the ticket but logged.
export async function createTicket(
  input: Omit<TicketInsert, 'user_id'>,
): Promise<Ticket> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const { data: ticket, error } = await supabase
    .from('tickets')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error

  const { error: eventErr } = await supabase.from('ticket_events').insert({
    user_id: userId,
    ticket_id: ticket.id,
    event_type: 'ticket_created',
    payload: { source: 'ui' },
  })
  if (eventErr) {
    console.error('ticket_created event insert failed', eventErr)
  }

  notifyTicketsChanged()
  return ticket
}
