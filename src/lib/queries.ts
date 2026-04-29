import { useCallback, useEffect, useReducer, useState } from 'react'
import type { Reducer } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  AgentRun,
  DefinitionOfDoneItem,
  Person,
  Ticket,
  TicketEvent,
  TicketEventInsert,
  TicketInsert,
  TicketOpenQuestion,
  TicketReference,
  TicketReferenceInsert,
  TicketReferenceKind,
  TicketReferenceUpdate,
  TicketStatus,
  TicketUpdate,
} from '@/types/orbit'
import type { Json } from '@/types/database'
import type { AssistState } from '@/lib/assistTypes'

type State<T> = {
  data: T
  loading: boolean
  error: Error | null
  refresh: () => void
}

// Reducer used by the fetch hooks below — `useReducer`'s `dispatch` lets us
// transition state from inside effects without tripping the
// `react-hooks/set-state-in-effect` rule (which only flags direct setState
// calls in effect bodies).
type FetchState<T> = { data: T; loading: boolean; error: Error | null }
type FetchAction<T> =
  | { type: 'reset'; data: T }
  | { type: 'start' }
  | { type: 'success'; data: T }
  | { type: 'failure'; error: Error }

function fetchReducer<T>(
  state: FetchState<T>,
  action: FetchAction<T>,
): FetchState<T> {
  switch (action.type) {
    case 'reset':
      return { data: action.data, loading: false, error: null }
    case 'start':
      return { ...state, loading: true, error: null }
    case 'success':
      return { data: action.data, loading: false, error: null }
    case 'failure':
      return { ...state, loading: false, error: action.error }
  }
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
  const [state, dispatch] = useReducer(
    fetchReducer as Reducer<FetchState<T>, FetchAction<T>>,
    { data: initial, loading: true, error: null },
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'start' })
    fetcher()
      .then((next) => {
        if (!cancelled) dispatch({ type: 'success', data: next })
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: 'failure', error: err })
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

  return { data: state.data, loading: state.loading, error: state.error, refresh }
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

const ASSIST_CHANGED_EVENT = 'orbit:assist-changed'
function notifyAssistChanged() {
  window.dispatchEvent(new CustomEvent(ASSIST_CHANGED_EVENT))
}

async function ticketSnapshot(ticket: Ticket) {
  // Fetch the latest open questions + references so Assist sees them. The
  // 20-row caps are defensive against runaway lists; assist will mostly see
  // < 5 of each in practice.
  const [{ data: oqRows }, { data: refRows }] = await Promise.all([
    supabase
      .from('ticket_open_questions')
      .select('question, resolved_at, resolution')
      .eq('ticket_id', ticket.id)
      .order('asked_at', { ascending: true })
      .limit(20),
    supabase
      .from('ticket_references')
      .select('kind, url_or_text, label')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
      .limit(20),
  ])
  return {
    title: ticket.title,
    description: ticket.description,
    type: ticket.type,
    status: ticket.status,
    goal: ticket.goal,
    next_action: ticket.next_action,
    next_action_at: ticket.next_action_at,
    urgency: ticket.urgency,
    importance: ticket.importance,
    energy_required: ticket.energy_required,
    context: ticket.context,
    definition_of_done: (ticket.definition_of_done as DefinitionOfDoneItem[]) ?? [],
    open_questions: (oqRows ?? []).map((r) => ({
      question: r.question,
      resolved: r.resolved_at !== null,
      resolution: r.resolution,
    })),
    references: refRows ?? [],
  }
}

// We persist the full assist state in agent_runs.output (JSON-stringified) —
// each turn appends a new row, latest = current. Semantically a stretch on a
// "single model call" table, but avoids a migration. See PLAN.md for the
// follow-up to move this to a dedicated tickets.assist_state column.
//
// Module-level cache keyed by ticketId. Two purposes:
//   - Avoid the "Mapping out the shape…" placeholder flashing when the
//     assist panel re-mounts (StrictMode, dialog re-opens, ticket switches
//     and back). With a hit we hydrate synchronously and only refetch in
//     the background.
//   - Ensure the bootstrap walkthrough turn fires at most once per
//     (page load × ticketId). Otherwise StrictMode's intentional
//     mount/unmount/remount triggers a duplicate /api/assist/walkthrough
//     call on first ticket open, which the user sees as the assist
//     section thrashing.
type AssistCacheEntry = { state: AssistState | null; loaded: boolean }
const assistStateCache = new Map<string, AssistCacheEntry>()
const assistBootstrappedTickets = new Set<string>()

export function getCachedAssistState(
  ticketId: string,
): AssistCacheEntry | null {
  return assistStateCache.get(ticketId) ?? null
}

export function markAssistBootstrapped(ticketId: string): boolean {
  if (assistBootstrappedTickets.has(ticketId)) return false
  assistBootstrappedTickets.add(ticketId)
  return true
}

function setCachedAssistState(ticketId: string, state: AssistState | null) {
  assistStateCache.set(ticketId, { state, loaded: true })
}

export function useLatestAssistState(ticketId: string | null) {
  const cached = ticketId ? assistStateCache.get(ticketId) : null
  const [state, dispatch] = useReducer(
    fetchReducer as Reducer<
      FetchState<AssistState | null>,
      FetchAction<AssistState | null>
    >,
    {
      data: cached?.state ?? null,
      // If we already have a cached value (even null after a confirmed
      // empty fetch), skip the loading state — the value we have is good
      // enough to render against. The background refetch below keeps it
      // honest without flicker.
      loading: !cached?.loaded,
      error: null,
    },
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!ticketId) {
      dispatch({ type: 'reset', data: null })
      return
    }
    const hit = assistStateCache.get(ticketId)
    if (hit?.loaded) {
      // Hydrate synchronously, then refresh quietly. No "loading=true"
      // dispatch — it would just flash the placeholder.
      dispatch({ type: 'success', data: hit.state })
    } else {
      dispatch({ type: 'start' })
    }
    let cancelled = false
    supabase
      .from('agent_runs')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return
        if (error) {
          console.error('useLatestAssistState', error)
          return
        }
        const next = parseAssistState(row)
        setCachedAssistState(ticketId, next)
        dispatch({ type: 'success', data: next })
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, version])

  useEffect(() => {
    function refresh() {
      setVersion((v) => v + 1)
    }
    window.addEventListener(ASSIST_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(ASSIST_CHANGED_EVENT, refresh)
  }, [])

  return { data: state.data, loading: state.loading }
}

function parseAssistState(run: AgentRun | null | undefined): AssistState | null {
  if (!run?.output) return null
  try {
    return JSON.parse(run.output) as AssistState
  } catch {
    return null
  }
}

type TicketUpdatesPatch = {
  goal?: string | null
  description?: string | null
  next_action?: string | null
  next_action_at?: string | null
  type?: Ticket['type'] | null
  context?: string | null
  definition_of_done?: DefinitionOfDoneItem[] | null
  // Append-only on purpose: the model doesn't see row IDs, so a full-list
  // replace would clobber user-resolved questions and de-duped references.
  open_questions_to_add?: string[] | null
  references_to_add?: Array<{
    kind: TicketReferenceKind
    url_or_text: string
    label?: string | null
  }> | null
}

// Calls /api/assist/walkthrough, persists the new state as a fresh agent_run,
// applies any model-proposed ticket_updates back onto the ticket itself
// (with field_updated audit events), and writes an `agent_ran` ticket_event.
// Returns the new state + the (possibly updated) ticket.
export async function runAssistTurn(args: {
  ticket: Ticket
  state: AssistState | null
  userMessage: string | null
  advance?: boolean
}): Promise<{
  state: AssistState
  assistant_message: string
  ready_to_advance: boolean
  ticket: Ticket
  applied_updates: Array<{ field: string; new: FieldChangeValue }>
}> {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr) throw sessionErr
  const accessToken = sessionData.session?.access_token
  const userId = sessionData.session?.user.id
  if (!accessToken || !userId) throw new Error('Not signed in')

  const snapshot = await ticketSnapshot(args.ticket)
  const res = await fetch('/api/assist/walkthrough', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      ticket: snapshot,
      state: args.state,
      user_message: args.userMessage,
      advance: args.advance ?? false,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error ?? `Request failed (${res.status})`)
  }
  const nextState = body.state as AssistState
  const proposed = body.ticket_updates as TicketUpdatesPatch | null

  // Apply ticket_updates: only fields where the proposed value differs from
  // the current ticket. We always preserve title (user's anchor).
  let ticket = args.ticket
  const applied: Array<{ field: string; new: FieldChangeValue }> = []
  if (proposed) {
    const patch: TicketUpdate = {}
    const changes: FieldChange[] = []
    const scalarFields: Array<keyof TicketUpdatesPatch> = [
      'goal',
      'description',
      'next_action',
      'next_action_at',
      'type',
      'context',
    ]
    for (const f of scalarFields) {
      const v = proposed[f]
      if (v === undefined || v === null) continue
      const current = ticket[f as keyof Ticket] as FieldChangeValue
      if (current === v) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(patch as any)[f] = v
      changes.push({ field: f, old: current ?? null, new: v as FieldChangeValue })
    }
    // definition_of_done is a full-list replace; equality is by JSON
    // stringify (reference equality is meaningless across re-fetches).
    if (proposed.definition_of_done) {
      const nextDod = proposed.definition_of_done
      const currentDod =
        (ticket.definition_of_done as DefinitionOfDoneItem[] | null) ?? []
      if (JSON.stringify(currentDod) !== JSON.stringify(nextDod)) {
        patch.definition_of_done = nextDod as unknown as Json
        changes.push({
          field: 'definition_of_done',
          old: currentDod as unknown as Json,
          new: nextDod as unknown as Json,
        })
      }
    }
    let ticketUpdateOk = true
    if (changes.length > 0) {
      try {
        ticket = await updateTicket(ticket.id, patch, { changedFields: changes })
        for (const c of changes) applied.push({ field: c.field, new: c.new })
      } catch (err) {
        ticketUpdateOk = false
        console.error('walkthrough ticket_updates apply failed', err)
      }
    }

    // Append-only child rows. Skip if the parent ticket update just failed —
    // appending questions/refs and reporting them as "applied" while the
    // scalar/DoD patch silently failed would lie to the user. Dedupe against
    // the snapshot we already fetched: the model has been told the existing
    // list but it still sometimes echoes items back. URL paths are
    // case-sensitive so we only normalize whitespace, not case.
    if (ticketUpdateOk) {
      const existingQuestions = new Set(
        snapshot.open_questions
          .filter((q) => !q.resolved)
          .map((q) => q.question.trim().toLowerCase()),
      )
      let addedQuestions = 0
      for (const q of proposed.open_questions_to_add ?? []) {
        const text = q?.trim()
        if (!text) continue
        const key = text.toLowerCase()
        if (existingQuestions.has(key)) continue
        existingQuestions.add(key)
        try {
          await addOpenQuestion(ticket.id, text)
          addedQuestions += 1
        } catch (err) {
          console.error('open_question add failed', err)
        }
      }
      if (addedQuestions > 0) {
        applied.push({ field: 'open_questions', new: `added ${addedQuestions}` })
      }

      const existingRefs = new Set(
        snapshot.references.map(
          (r) => `${r.kind}::${(r.url_or_text ?? '').trim()}`,
        ),
      )
      let addedRefs = 0
      for (const r of proposed.references_to_add ?? []) {
        const url = r?.url_or_text?.trim()
        if (!url) continue
        const key = `${r.kind}::${url}`
        if (existingRefs.has(key)) continue
        existingRefs.add(key)
        try {
          await addReference(ticket.id, {
            kind: r.kind,
            url_or_text: url,
            label: r.label ?? null,
          })
          addedRefs += 1
        } catch (err) {
          console.error('reference add failed', err)
        }
      }
      if (addedRefs > 0) {
        applied.push({ field: 'references', new: `added ${addedRefs}` })
      }
    }
  }

  const { error: runErr } = await supabase.from('agent_runs').insert({
    user_id: userId,
    ticket_id: ticket.id,
    input_context: {
      snapshot,
      prev_state: args.state,
      advance: args.advance ?? false,
    },
    output: JSON.stringify(nextState),
    needs_feedback: false,
  })
  if (runErr) console.error('agent_runs insert failed', runErr)

  const { error: evtErr } = await supabase.from('ticket_events').insert({
    user_id: userId,
    ticket_id: ticket.id,
    event_type: 'agent_ran',
    payload: {
      agent: 'walkthrough',
      phase: nextState.phase,
      applied_field_count: applied.length,
    },
  })
  if (evtErr) console.error('agent_ran event insert failed', evtErr)

  // Update the cache eagerly so subscribed hooks (and any panel that
  // re-mounts immediately afterwards) see the new state without waiting
  // for the agent_runs SELECT round-trip.
  setCachedAssistState(ticket.id, nextState)
  notifyAssistChanged()
  return {
    state: nextState,
    assistant_message: body.assistant_message ?? '',
    ready_to_advance: body.ready_to_advance === true,
    ticket,
    applied_updates: applied,
  }
}

// Computes the next AssistState when the user picks a different current
// phase. Phases before the picked one become 'done', the picked one is
// 'in_progress', later phases reset to 'not_started'. Returns null if the
// shape is missing or the phase id isn't present.
export function buildPickedPhaseState(
  state: AssistState,
  phaseId: string,
): AssistState | null {
  if (!state.shape) return null
  const phases = state.shape.phases
  const idx = phases.findIndex((p) => p.id === phaseId)
  if (idx === -1) return null
  const updatedPhases = phases.map((p, i) => ({
    ...p,
    status:
      i < idx
        ? ('done' as const)
        : i === idx
          ? ('in_progress' as const)
          : ('not_started' as const),
  }))
  return {
    ...state,
    shape: { ...state.shape, phases: updatedPhases },
    position: {
      current_phase_id: phaseId,
      blockers: state.position?.blockers ?? [],
      notes: state.position?.notes ?? null,
    },
  }
}

// Persists an assist state without going through the model — used when the
// user makes a direct UI gesture (e.g. "I'm here" on a shape phase) that
// deterministically updates state. Writes an agent_run row + ticket_event.
export async function persistAssistState(
  ticket: Ticket,
  state: AssistState,
  reason: string,
): Promise<void> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const { error: runErr } = await supabase.from('agent_runs').insert({
    user_id: userId,
    ticket_id: ticket.id,
    input_context: { snapshot: await ticketSnapshot(ticket), reason },
    output: JSON.stringify(state),
    needs_feedback: false,
  })
  if (runErr) console.error('agent_runs insert (local) failed', runErr)

  const { error: evtErr } = await supabase.from('ticket_events').insert({
    user_id: userId,
    ticket_id: ticket.id,
    event_type: 'agent_ran',
    payload: { agent: 'walkthrough', phase: state.phase, source: reason },
  })
  if (evtErr) console.error('agent_ran event insert failed', evtErr)

  setCachedAssistState(ticket.id, state)
  notifyAssistChanged()
}

// FieldChangeValue covers the audit payload shape: scalar fields (most of
// the ticket) are stringy/numeric, but jsonb fields like definition_of_done
// flow through as JSON arrays/objects. The event payload column is jsonb so
// any Json shape is fine.
export type FieldChangeValue = Json
export type FieldChange = {
  field: string
  old: FieldChangeValue
  new: FieldChangeValue
}

const TERMINAL_STATUSES: ReadonlyArray<TicketStatus> = ['closed', 'dropped']

function isTerminal(status: TicketStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

// updateTicket persists `patch` and writes one ticket_events row per
// changed field. Caller passes `changedFields` (it knows the prior values).
// Same non-transactional convention as createTicket — event insert failures
// are logged but don't fail the update.
//
// Status transitions are special-cased:
//   - moving into closed/dropped sets closed_at = now() (if not already set)
//   - moving out of closed/dropped clears closed_at
//   - the change is logged as `status_changed` with {from, to} payload
//     instead of the generic `field_updated`.
export async function updateTicket(
  id: string,
  patch: TicketUpdate,
  options?: { changedFields?: FieldChange[] },
): Promise<Ticket> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const effectivePatch: TicketUpdate = { ...patch }
  if (patch.status !== undefined) {
    const next = patch.status as TicketStatus
    if (isTerminal(next)) {
      if (effectivePatch.closed_at === undefined) {
        effectivePatch.closed_at = new Date().toISOString()
      }
    } else {
      effectivePatch.closed_at = null
    }
  }

  const { data: ticket, error } = await supabase
    .from('tickets')
    .update(effectivePatch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  const changes = options?.changedFields ?? []
  if (changes.length > 0) {
    const events: TicketEventInsert[] = changes.map((c) => {
      if (c.field === 'status') {
        return {
          user_id: userId,
          ticket_id: ticket.id,
          event_type: 'status_changed',
          payload: { from: c.old, to: c.new },
        }
      }
      return {
        user_id: userId,
        ticket_id: ticket.id,
        event_type:
          c.field === 'next_action' ? 'next_action_updated' : 'field_updated',
        payload: { field: c.field, old: c.old, new: c.new },
      }
    })
    const { error: eventErr } = await supabase
      .from('ticket_events')
      .insert(events)
    if (eventErr) {
      console.error('ticket field-update event insert failed', eventErr)
    }
  }

  notifyTicketsChanged()
  return ticket
}

// ── ticket_open_questions ────────────────────────────────────────────────

const OPEN_QUESTIONS_CHANGED_EVENT = 'orbit:open-questions-changed'
function notifyOpenQuestionsChanged() {
  window.dispatchEvent(new CustomEvent(OPEN_QUESTIONS_CHANGED_EVENT))
}

export function useTicketOpenQuestions(ticketId: string | null) {
  const [state, dispatch] = useReducer(
    fetchReducer as Reducer<
      FetchState<TicketOpenQuestion[]>,
      FetchAction<TicketOpenQuestion[]>
    >,
    { data: [], loading: false, error: null },
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!ticketId) {
      dispatch({ type: 'reset', data: [] })
      return
    }
    let cancelled = false
    dispatch({ type: 'start' })
    supabase
      .from('ticket_open_questions')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('asked_at', { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) console.error('useTicketOpenQuestions', error)
        dispatch({ type: 'success', data: rows ?? [] })
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, version])

  useEffect(() => {
    function refresh() {
      setVersion((v) => v + 1)
    }
    window.addEventListener(OPEN_QUESTIONS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(OPEN_QUESTIONS_CHANGED_EVENT, refresh)
  }, [])

  return { data: state.data, loading: state.loading }
}

export async function addOpenQuestion(
  ticketId: string,
  question: string,
): Promise<TicketOpenQuestion> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('ticket_open_questions')
    .insert({ user_id: userId, ticket_id: ticketId, question })
    .select()
    .single()
  if (error) throw error
  notifyOpenQuestionsChanged()
  return data
}

export async function resolveOpenQuestion(
  id: string,
  resolution: string | null,
): Promise<TicketOpenQuestion> {
  const { data, error } = await supabase
    .from('ticket_open_questions')
    .update({
      resolved_at: new Date().toISOString(),
      resolution: resolution && resolution.trim() ? resolution.trim() : null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  notifyOpenQuestionsChanged()
  return data
}

export async function reopenOpenQuestion(
  id: string,
): Promise<TicketOpenQuestion> {
  const { data, error } = await supabase
    .from('ticket_open_questions')
    .update({ resolved_at: null, resolution: null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  notifyOpenQuestionsChanged()
  return data
}

export async function deleteOpenQuestion(id: string): Promise<void> {
  const { error } = await supabase
    .from('ticket_open_questions')
    .delete()
    .eq('id', id)
  if (error) throw error
  notifyOpenQuestionsChanged()
}

// ── ticket_references ────────────────────────────────────────────────────

const REFERENCES_CHANGED_EVENT = 'orbit:references-changed'
function notifyReferencesChanged() {
  window.dispatchEvent(new CustomEvent(REFERENCES_CHANGED_EVENT))
}

export function useTicketReferences(ticketId: string | null) {
  const [state, dispatch] = useReducer(
    fetchReducer as Reducer<
      FetchState<TicketReference[]>,
      FetchAction<TicketReference[]>
    >,
    { data: [], loading: false, error: null },
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!ticketId) {
      dispatch({ type: 'reset', data: [] })
      return
    }
    let cancelled = false
    dispatch({ type: 'start' })
    supabase
      .from('ticket_references')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) console.error('useTicketReferences', error)
        dispatch({ type: 'success', data: rows ?? [] })
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, version])

  useEffect(() => {
    function refresh() {
      setVersion((v) => v + 1)
    }
    window.addEventListener(REFERENCES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(REFERENCES_CHANGED_EVENT, refresh)
  }, [])

  return { data: state.data, loading: state.loading }
}

export async function addReference(
  ticketId: string,
  input: Omit<TicketReferenceInsert, 'user_id' | 'ticket_id'>,
): Promise<TicketReference> {
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('ticket_references')
    .insert({ ...input, user_id: userId, ticket_id: ticketId })
    .select()
    .single()
  if (error) throw error
  notifyReferencesChanged()
  return data
}

export async function updateReference(
  id: string,
  patch: TicketReferenceUpdate,
): Promise<TicketReference> {
  const { data, error } = await supabase
    .from('ticket_references')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  notifyReferencesChanged()
  return data
}

export async function deleteReference(id: string): Promise<void> {
  const { error } = await supabase
    .from('ticket_references')
    .delete()
    .eq('id', id)
  if (error) throw error
  notifyReferencesChanged()
}

// ── ticket_events ────────────────────────────────────────────────────────

const TICKET_EVENTS_CHANGED_EVENT = 'orbit:ticket-events-changed'
function notifyTicketEventsChanged() {
  window.dispatchEvent(new CustomEvent(TICKET_EVENTS_CHANGED_EVENT))
}

// Inserts a `note_added` event with `{body}` payload. Notes don't change
// the ticket itself, so we use a dedicated refresh event instead of
// TICKETS_CHANGED_EVENT (which would re-fetch ticket lists for nothing).
export async function addTicketNote(
  ticketId: string,
  body: string,
): Promise<TicketEvent> {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Note body is empty')

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw authErr
  const userId = auth.user?.id
  if (!userId) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('ticket_events')
    .insert({
      user_id: userId,
      ticket_id: ticketId,
      event_type: 'note_added',
      payload: { body: trimmed },
    })
    .select()
    .single()
  if (error) throw error
  notifyTicketEventsChanged()
  return data
}

// Pulls the ticket's append-only audit log in chronological order. Callers
// that want newest-first display reverse it themselves (TicketActivity does
// this — see its comment). Pass null to keep the hook idle (e.g. while the
// detail dialog is closed). Refreshes on the global events driven by flows
// that write into ticket_events: ticket field updates / status transitions
// (TICKETS_CHANGED_EVENT), assist runs (ASSIST_CHANGED_EVENT), and notes
// (TICKET_EVENTS_CHANGED_EVENT).
export function useTicketEvents(ticketId: string | null) {
  const [state, dispatch] = useReducer(
    fetchReducer as Reducer<
      FetchState<TicketEvent[]>,
      FetchAction<TicketEvent[]>
    >,
    { data: [], loading: false, error: null },
  )
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!ticketId) {
      dispatch({ type: 'reset', data: [] })
      return
    }
    let cancelled = false
    dispatch({ type: 'start' })
    supabase
      .from('ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
      .then(({ data: rows, error }) => {
        if (cancelled) return
        if (error) {
          console.error('useTicketEvents', error)
          dispatch({ type: 'failure', error })
          return
        }
        dispatch({ type: 'success', data: rows ?? [] })
      })
    return () => {
      cancelled = true
    }
  }, [ticketId, version])

  useEffect(() => {
    function refresh() {
      setVersion((v) => v + 1)
    }
    window.addEventListener(TICKETS_CHANGED_EVENT, refresh)
    window.addEventListener(ASSIST_CHANGED_EVENT, refresh)
    window.addEventListener(TICKET_EVENTS_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener(TICKETS_CHANGED_EVENT, refresh)
      window.removeEventListener(ASSIST_CHANGED_EVENT, refresh)
      window.removeEventListener(TICKET_EVENTS_CHANGED_EVENT, refresh)
    }
  }, [])

  return { data: state.data, loading: state.loading, error: state.error }
}
