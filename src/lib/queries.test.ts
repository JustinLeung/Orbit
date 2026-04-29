import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ticket } from '@/types/orbit'

// A flexible Supabase chain mock. `tableHandlers` maps table name to a
// function that returns the builder object the call site expects (with
// `.select()`, `.insert()`, `.update()`, `.delete()`, `.eq()`, etc.).
type Handler = () => unknown
let tableHandlers: Record<string, Handler> = {}

const authGetSession = vi.fn()
const authGetUser = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: authGetSession, getUser: authGetUser },
    from: (name: string) => {
      const handler = tableHandlers[name]
      if (!handler) {
        throw new Error(`unmocked supabase.from(${name})`)
      }
      return handler()
    },
  },
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Helper: builds a chained mock that ignores intermediate calls and only
// resolves at the terminal `.maybeSingle()` / `.single()` / awaited value.
function chainable(terminal: { data?: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {}
  const passthrough = ['select', 'eq', 'order', 'limit', 'in', 'lte', 'gte']
  for (const k of passthrough) obj[k] = () => obj
  obj.single = () => Promise.resolve(terminal)
  obj.maybeSingle = () => Promise.resolve(terminal)
  // Some chains are awaited directly (no .single()) — make the object
  // thenable so `await supabase.from(...).select(...).eq(...).order(...)` resolves.
  obj.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(terminal).then(onFulfilled)
  return obj
}

function baseTicket(overrides: Partial<Ticket> = {}): Ticket {
  const now = '2026-04-29T00:00:00Z'
  return {
    id: 'ticket-1',
    user_id: 'u',
    title: 'T',
    description: null,
    type: 'task',
    status: 'inbox',
    goal: null,
    next_action: null,
    next_action_at: null,
    human_owner: null,
    waiting_on: null,
    urgency: null,
    importance: null,
    energy_required: null,
    context: null,
    agent_mode: 'none',
    agent_status: 'idle',
    created_at: now,
    updated_at: now,
    closed_at: null,
    definition_of_done: [],
    ...overrides,
  }
}

beforeEach(() => {
  tableHandlers = {}
  fetchMock.mockReset()
  authGetSession.mockResolvedValue({
    data: { session: { access_token: 't', user: { id: 'u' } } },
    error: null,
  })
  authGetUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('runAssistTurn — dedup + failure handling', () => {
  it('treats URLs that differ only in case as distinct (no false dedup)', async () => {
    // existing reference has Q3 (uppercase); model proposes q3 (lowercase).
    // These are different paths and both should be added.
    const referenceInsert = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'r-new' }, error: null }),
      }),
    })

    tableHandlers = {
      ticket_open_questions: () => chainable({ data: [], error: null }),
      ticket_references: () => {
        // First call: snapshot select. Subsequent calls: insert.
        return {
          select: () => chainable({
            data: [
              {
                kind: 'link',
                url_or_text: 'https://docs.example/Q3',
                label: null,
              },
            ],
            error: null,
          }),
          insert: referenceInsert,
        }
      },
      tickets: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: baseTicket(), error: null }),
            }),
          }),
        }),
      }),
      ticket_events: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
      agent_runs: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    }

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        state: { phase: 'shape', shape: null, position: null, next_steps: null, messages: [] },
        assistant_message: 'ok',
        ready_to_advance: false,
        ticket_updates: {
          // include a scalar field so changes.length > 0 → updateTicket fires
          context: 'updated context',
          references_to_add: [
            { kind: 'link', url_or_text: 'https://docs.example/q3', label: null },
          ],
        },
      }),
    })

    const { runAssistTurn } = await import('./queries')
    const out = await runAssistTurn({
      ticket: baseTicket({ context: 'old' }),
      state: null,
      userMessage: null,
    })

    expect(referenceInsert).toHaveBeenCalledTimes(1)
    const inserted = referenceInsert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      kind: 'link',
      url_or_text: 'https://docs.example/q3',
    })
    // Both ticket-update + reference-add should appear in applied_updates.
    const fields = out.applied_updates.map((a) => a.field)
    expect(fields).toContain('context')
    expect(fields).toContain('references')
  })

  it('skips child-row appends when updateTicket fails (no false success)', async () => {
    const questionInsert = vi.fn()
    const referenceInsert = vi.fn()

    tableHandlers = {
      ticket_open_questions: () => ({
        select: () => chainable({ data: [], error: null }),
        insert: questionInsert,
      }),
      ticket_references: () => ({
        select: () => chainable({ data: [], error: null }),
        insert: referenceInsert,
      }),
      tickets: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: () =>
                // simulate a failed update
                Promise.resolve({ data: null, error: new Error('boom') }),
            }),
          }),
        }),
      }),
      ticket_events: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
      agent_runs: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    }

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        state: { phase: 'shape', shape: null, position: null, next_steps: null, messages: [] },
        assistant_message: 'ok',
        ready_to_advance: false,
        ticket_updates: {
          // include a scalar to force the updateTicket path
          context: 'whatever',
          open_questions_to_add: ['who owns this?'],
          references_to_add: [
            { kind: 'link', url_or_text: 'https://example.test', label: null },
          ],
        },
      }),
    })

    const { runAssistTurn } = await import('./queries')
    const out = await runAssistTurn({
      ticket: baseTicket(),
      state: null,
      userMessage: null,
    })

    // Critical: child writes must NOT happen when ticket update failed.
    expect(questionInsert).not.toHaveBeenCalled()
    expect(referenceInsert).not.toHaveBeenCalled()
    // applied_updates must not claim we added questions/references.
    const fields = out.applied_updates.map((a) => a.field)
    expect(fields).not.toContain('open_questions')
    expect(fields).not.toContain('references')
  })

  it('snapshot fetches existing open_questions and references before posting', async () => {
    const oqSelect = vi.fn().mockReturnValue(
      chainable({
        data: [
          { question: 'who owns?', resolved_at: null, resolution: null },
        ],
        error: null,
      }),
    )
    const refSelect = vi.fn().mockReturnValue(
      chainable({
        data: [
          {
            kind: 'link',
            url_or_text: 'https://example.test/spec',
            label: 'spec',
          },
        ],
        error: null,
      }),
    )

    tableHandlers = {
      ticket_open_questions: () => ({ select: oqSelect }),
      ticket_references: () => ({ select: refSelect }),
      agent_runs: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
      ticket_events: () => ({
        insert: () => Promise.resolve({ error: null }),
      }),
    }

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        state: { phase: 'shape', shape: null, position: null, next_steps: null, messages: [] },
        assistant_message: 'ok',
        ready_to_advance: false,
      }),
    })

    const { runAssistTurn } = await import('./queries')
    await runAssistTurn({
      ticket: baseTicket(),
      state: null,
      userMessage: null,
    })

    expect(oqSelect).toHaveBeenCalled()
    expect(refSelect).toHaveBeenCalled()
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    )
    expect(body.ticket.open_questions).toEqual([
      { question: 'who owns?', resolved: false, resolution: null },
    ])
    expect(body.ticket.references).toEqual([
      {
        kind: 'link',
        url_or_text: 'https://example.test/spec',
        label: 'spec',
      },
    ])
  })
})
