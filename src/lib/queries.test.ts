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
    short_id: 1,
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
        state: { phase: 'shape', shape: null, position: null, messages: [] },
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
        state: { phase: 'shape', shape: null, position: null, messages: [] },
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
        state: { phase: 'shape', shape: null, position: null, messages: [] },
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

describe('appendPhaseToShape (Add a step)', () => {
  function stateWithPhases(ids: string[]) {
    return {
      phase: 'shape' as const,
      shape: {
        goal: null,
        phases: ids.map((id) => ({
          id,
          title: id,
          description: null,
          status: 'not_started' as const,
          category: 'doing' as const,
          action: id,
          action_details: null,
          definition_of_done: [],
        })),
        completion_criteria: [],
        inputs_needed: [],
        suggested_steps: [],
      },
      position: null,
      messages: [],
      next_question: null,
    }
  }

  it('appends a phase with default category doing and action = title', async () => {
    const { appendPhaseToShape } = await import('./queries')
    const next = appendPhaseToShape(stateWithPhases([]), { title: 'Confirm with Sam' })
    expect(next?.shape?.phases).toHaveLength(1)
    expect(next?.shape?.phases[0]).toMatchObject({
      title: 'Confirm with Sam',
      action: 'Confirm with Sam',
      category: 'doing',
      status: 'not_started',
      description: null,
      action_details: null,
    })
    expect(next?.shape?.phases[0].id).toMatch(/^user-/)
  })

  it('honors a user-selected category', async () => {
    const { appendPhaseToShape } = await import('./queries')
    const next = appendPhaseToShape(stateWithPhases([]), {
      title: 'Decide vendor',
      category: 'deciding',
    })
    expect(next?.shape?.phases[0].category).toBe('deciding')
  })

  it('generates a fresh id that does not collide with existing user-N ids', async () => {
    const { appendPhaseToShape } = await import('./queries')
    const next = appendPhaseToShape(stateWithPhases(['p1', 'user-1', 'user-2']), {
      title: 'Another',
    })
    expect(next?.shape?.phases.at(-1)?.id).toBe('user-3')
  })

  it('returns null if the shape is missing or the title is whitespace', async () => {
    const { appendPhaseToShape } = await import('./queries')
    const noShape = {
      phase: 'shape' as const,
      shape: null,
      position: null,
      messages: [],
      next_question: null,
    }
    expect(appendPhaseToShape(noShape, { title: 'X' })).toBeNull()
    expect(appendPhaseToShape(stateWithPhases([]), { title: '   ' })).toBeNull()
  })

  it('preserves existing phases (append-only)', async () => {
    const { appendPhaseToShape } = await import('./queries')
    const next = appendPhaseToShape(stateWithPhases(['p1', 'p2']), { title: 'Third' })
    expect(next?.shape?.phases.map((p) => p.id)).toEqual(['p1', 'p2', expect.stringMatching(/^user-/)])
    // Untouched phases are exactly the same reference-wise (or at least content-wise).
    expect(next?.shape?.phases[0].title).toBe('p1')
    expect(next?.shape?.phases[1].title).toBe('p2')
  })
})

describe('insertPhaseAtPosition (Suggested step accept)', () => {
  function stateWithPhases(ids: string[]) {
    return {
      phase: 'shape' as const,
      shape: {
        goal: null,
        phases: ids.map((id) => ({
          id,
          title: id,
          description: null,
          status: 'not_started' as const,
          category: 'doing' as const,
          action: id,
          action_details: null,
          definition_of_done: [],
        })),
        completion_criteria: [],
        inputs_needed: [],
        suggested_steps: [],
      },
      position: null,
      messages: [],
      next_question: null,
    }
  }

  it('inserts BEFORE the anchor phase', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1', 'p2', 'p3']),
      { title: 'Buy lightbulb' },
      { kind: 'before', anchor_phase_id: 'p2' },
    )
    expect(next?.shape?.phases.map((p) => p.title)).toEqual([
      'p1',
      'Buy lightbulb',
      'p2',
      'p3',
    ])
  })

  it('inserts AFTER the anchor phase', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1', 'p2', 'p3']),
      { title: 'Wrap gift' },
      { kind: 'after', anchor_phase_id: 'p2' },
    )
    expect(next?.shape?.phases.map((p) => p.title)).toEqual([
      'p1',
      'p2',
      'Wrap gift',
      'p3',
    ])
  })

  it('appends at the END when position is end', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1']),
      { title: 'Final touches' },
      { kind: 'end' },
    )
    expect(next?.shape?.phases.map((p) => p.title)).toEqual([
      'p1',
      'Final touches',
    ])
  })

  it('falls back to END when the anchor id does not resolve', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1', 'p2']),
      { title: 'Orphan suggestion' },
      { kind: 'before', anchor_phase_id: 'gone' },
    )
    expect(next?.shape?.phases.map((p) => p.title)).toEqual([
      'p1',
      'p2',
      'Orphan suggestion',
    ])
  })

  it('honors a model-provided id when it does not collide', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1']),
      { id: 's1', title: 'From suggestion' },
      { kind: 'end' },
    )
    expect(next?.shape?.phases.at(-1)?.id).toBe('s1')
  })

  it('generates a user-N id when the model id collides with existing phase id', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const next = insertPhaseAtPosition(
      stateWithPhases(['p1', 'user-1']),
      { id: 'p1', title: 'Wants colliding id' },
      { kind: 'end' },
    )
    const last = next?.shape?.phases.at(-1)
    expect(last?.id).toBe('user-2')
  })

  it('returns null when the shape is missing or title is whitespace', async () => {
    const { insertPhaseAtPosition } = await import('./queries')
    const noShape = {
      phase: 'shape' as const,
      shape: null,
      position: null,
      messages: [],
      next_question: null,
    }
    expect(
      insertPhaseAtPosition(noShape, { title: 'X' }, { kind: 'end' }),
    ).toBeNull()
    expect(
      insertPhaseAtPosition(stateWithPhases(['p1']), { title: '  ' }, {
        kind: 'end',
      }),
    ).toBeNull()
  })
})

describe('removePhaseFromShape', () => {
  function stateWith(ids: string[], opts?: { current?: string; nextQ?: boolean }) {
    return {
      phase: 'shape' as const,
      shape: {
        goal: null,
        phases: ids.map((id) => ({
          id,
          title: id,
          description: null,
          status: 'not_started' as const,
          category: 'doing' as const,
          action: id,
          action_details: null,
          definition_of_done: [],
        })),
        completion_criteria: [],
        inputs_needed: [],
        suggested_steps: [],
      },
      position: opts?.current
        ? { current_phase_id: opts.current, blockers: [], notes: null }
        : null,
      messages: [],
      next_question: opts?.nextQ
        ? {
            id: 'q1',
            kind: 'short_text' as const,
            prompt: 'huh?',
            options: null,
            allow_other: null,
            placeholder: null,
          }
        : null,
    }
  }

  it('removes a phase by id and preserves the order of the rest', async () => {
    const { removePhaseFromShape } = await import('./queries')
    const next = removePhaseFromShape(stateWith(['p1', 'p2', 'p3']), 'p2')
    expect(next?.shape?.phases.map((p) => p.id)).toEqual(['p1', 'p3'])
  })

  it('returns null when the id does not resolve', async () => {
    const { removePhaseFromShape } = await import('./queries')
    expect(
      removePhaseFromShape(stateWith(['p1']), 'gone'),
    ).toBeNull()
  })

  it('returns null when no shape is present', async () => {
    const { removePhaseFromShape } = await import('./queries')
    const noShape = {
      phase: 'shape' as const,
      shape: null,
      position: null,
      messages: [],
      next_question: null,
    }
    expect(removePhaseFromShape(noShape, 'p1')).toBeNull()
  })

  it('clears current_phase_id and next_question when removing the current phase', async () => {
    const { removePhaseFromShape } = await import('./queries')
    const next = removePhaseFromShape(
      stateWith(['p1', 'p2'], { current: 'p2', nextQ: true }),
      'p2',
    )
    expect(next?.position?.current_phase_id).toBeNull()
    expect(next?.next_question).toBeNull()
  })

  it('keeps current_phase_id and next_question when removing a different phase', async () => {
    const { removePhaseFromShape } = await import('./queries')
    const next = removePhaseFromShape(
      stateWith(['p1', 'p2'], { current: 'p1', nextQ: true }),
      'p2',
    )
    expect(next?.position?.current_phase_id).toBe('p1')
    expect(next?.next_question).not.toBeNull()
  })
})

describe('addTicketNote', () => {
  it('inserts a note_added event with trimmed body and notifies listeners', async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: 'evt-1',
              ticket_id: 'ticket-1',
              event_type: 'note_added',
              payload: { body: 'hello world' },
            },
            error: null,
          }),
      }),
    })
    tableHandlers = {
      ticket_events: () => ({ insert }),
    }

    const refresh = vi.fn()
    window.addEventListener('orbit:ticket-events-changed', refresh)

    try {
      const { addTicketNote } = await import('./queries')
      const result = await addTicketNote('ticket-1', '  hello world  \n')

      expect(insert).toHaveBeenCalledTimes(1)
      expect(insert.mock.calls[0][0]).toMatchObject({
        user_id: 'u',
        ticket_id: 'ticket-1',
        event_type: 'note_added',
        payload: { body: 'hello world' },
      })
      expect(result.event_type).toBe('note_added')
      expect(refresh).toHaveBeenCalled()
    } finally {
      window.removeEventListener('orbit:ticket-events-changed', refresh)
    }
  })

  it('rejects empty bodies without touching the database', async () => {
    const insert = vi.fn()
    tableHandlers = {
      ticket_events: () => ({ insert }),
    }

    const { addTicketNote } = await import('./queries')
    await expect(addTicketNote('ticket-1', '   \n  ')).rejects.toThrow(
      /empty/i,
    )
    expect(insert).not.toHaveBeenCalled()
  })
})
