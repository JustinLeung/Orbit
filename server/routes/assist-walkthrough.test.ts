import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    INTEGER: 'INTEGER',
    ARRAY: 'ARRAY',
    NUMBER: 'NUMBER',
  },
}))

// Helper: mock the classifier as 'other' with low confidence so the fast
// path falls through to the main model. Used by tests that exercise the
// model path on the first shape turn.
function mockClassifierFallthrough() {
  generateContent.mockResolvedValueOnce({
    text: JSON.stringify({
      archetype: 'other',
      confidence: 0.3,
      signals: [],
    }),
  })
}

async function makeApp() {
  const { default: route } = await import('./assist-walkthrough.js')
  const { __resetGeminiForTests } = await import('../lib/gemini.js')
  __resetGeminiForTests()
  const app = express()
  app.use(express.json())
  app.use('/api/assist/walkthrough', route)
  return app
}

const TICKET = { title: 'Plan Q3 budget review' }

describe('POST /api/assist/walkthrough', () => {
  beforeEach(() => {
    generateContent.mockReset()
    delete process.env.GEMINI_API_KEY
  })

  it('400s when ticket.title is missing', async () => {
    process.env.GEMINI_API_KEY = 'k'
    const app = await makeApp()
    const res = await request(app).post('/api/assist/walkthrough').send({})
    expect(res.status).toBe(400)
  })

  it('503s when GEMINI_API_KEY is not configured', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.status).toBe(503)
  })

  it('shape phase: starts with empty state and returns a shape with action-bearing phases', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: "Here's how I see the shape of this.",
        ready_to_advance: false,
        shape: {
          goal: 'Align Q3 budget',
          phases: [
            {
              id: 'p1',
              title: 'Pull last year actuals',
              status: 'not_started',
              category: 'research',
              action: 'Download the Q2 actuals from Drive',
              action_details: 'Then export the FY-to-date row',
            },
            {
              id: 'p2',
              title: 'Draft Q3 numbers',
              status: 'not_started',
              category: 'doing',
              action: 'Block 60 min and draft top-line numbers',
            },
            {
              id: 'p3',
              title: 'Review with Sam',
              status: 'not_started',
              category: 'waiting',
              action: 'Send the draft to Sam for review',
            },
          ],
          completion_criteria: ['Sam approves the numbers'],
          inputs_needed: ['Last year actuals spreadsheet'],
        },
      }),
    })

    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET, state: null, user_message: null })

    expect(res.status).toBe(200)
    expect(res.body.state.phase).toBe('shape')
    expect(res.body.state.shape.phases).toHaveLength(3)
    expect(res.body.state.shape.phases[0].action).toMatch(/Q2 actuals/)
    expect(res.body.state.shape.phases[2].action).toMatch(/Sam/)
    expect(res.body.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      text: expect.stringContaining('shape'),
    })
    expect(res.body.ready_to_advance).toBe(false)
  })

  it('appends user message to history before model call', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Got it.',
        ready_to_advance: true,
        shape: { phases: [], completion_criteria: [], inputs_needed: [] },
      }),
    })

    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: TICKET,
        state: {
          phase: 'shape',
          shape: null,
          position: null,
          messages: [
            { role: 'assistant', text: 'first turn', ts: '2026-04-28T00:00:00Z' },
          ],
        },
        user_message: 'Looks right',
      })

    expect(res.status).toBe(200)
    expect(res.body.state.messages).toHaveLength(3)
    expect(res.body.state.messages[1]).toMatchObject({
      role: 'user',
      text: 'Looks right',
    })
    expect(res.body.ready_to_advance).toBe(true)
  })

  it('advance: bumps phase from shape to refine before calling model', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'OK — I refined that phase.',
        shape: {
          goal: 'x',
          phases: [
            {
              id: 'p1',
              title: 'P1',
              description: null,
              status: 'in_progress',
              category: 'planning',
              action: 'Draft the doc with the three options laid out',
            },
          ],
          completion_criteria: [],
          inputs_needed: [],
        },
        position: { current_phase_id: 'p1', blockers: [], notes: null },
      }),
    })

    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: TICKET,
        advance: true,
        state: {
          phase: 'shape',
          shape: {
            goal: 'x',
            phases: [
              {
                id: 'p1',
                title: 'P1',
                description: null,
                status: 'not_started',
                category: 'planning',
                action: 'Generic placeholder action',
              },
            ],
            completion_criteria: [],
            inputs_needed: [],
          },
          position: null,
          messages: [],
        },
      })

    expect(res.body.state.phase).toBe('refine')
    expect(res.body.state.position).toMatchObject({ current_phase_id: 'p1' })
    expect(res.body.state.shape.phases[0].action).toMatch(/three options/)
  })

  it('advance to done short-circuits without calling the model', async () => {
    process.env.GEMINI_API_KEY = 'k'
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: TICKET,
        advance: true,
        state: {
          phase: 'refine',
          shape: null,
          position: null,
          messages: [],
        },
      })

    expect(generateContent).not.toHaveBeenCalled()
    expect(res.body.state.phase).toBe('done')
  })

  it('502 on malformed JSON', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({ text: 'not json' })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.status).toBe(502)
  })

  it('502 when assistant_message is missing', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ shape: { phases: [], completion_criteria: [], inputs_needed: [] } }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.status).toBe(502)
  })

  it('passes through ticket_updates when present', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Got the wedding details.',
        ticket_updates: {
          goal: 'Attend the wedding well-prepared',
          context: 'Venue: Pelican Hill. Dress code: black-tie optional.',
          next_action_at: '2026-05-18T16:00:00',
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET, user_message: 'wedding is May 18 at Pelican Hill, black tie optional' })
    expect(res.body.ticket_updates).toMatchObject({
      goal: 'Attend the wedding well-prepared',
      context: expect.stringContaining('Pelican Hill'),
    })
    // ISO normalized
    expect(res.body.ticket_updates.next_action_at).toMatch(/^2026-05-18T/)
  })

  it('drops invalid date strings from ticket_updates', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'noted',
        ticket_updates: { next_action_at: 'sometime soon' },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.body.ticket_updates).toBeNull()
  })

  it('returns null ticket_updates when nothing meaningful was set', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'OK',
        ticket_updates: { goal: '', description: null },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.body.ticket_updates).toBeNull()
  })

  it('shape phases carry category through to the response', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Here is the shape.',
        shape: {
          phases: [
            {
              id: 'p1',
              title: 'Decide on theme',
              status: 'not_started',
              category: 'deciding',
              action: 'Pick between woodland and beach themes',
            },
            {
              id: 'p2',
              title: 'Wait for venue confirmation',
              status: 'not_started',
              category: 'waiting',
              action: 'Follow up with venue if no reply by Friday',
            },
          ],
          completion_criteria: [],
          inputs_needed: [],
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET, state: null })
    expect(res.body.state.shape.phases[0].category).toBe('deciding')
    expect(res.body.state.shape.phases[1].category).toBe('waiting')
  })

  describe('first-shape-turn fast path', () => {
    it('serves a template directly on high-confidence classification', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          archetype: 'event_planning',
          confidence: 0.95,
          signals: ['birthday'],
        }),
      })

      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: { title: "Plan Katja's birthday" }, state: null })

      expect(res.status).toBe(200)
      expect(generateContent).toHaveBeenCalledTimes(1) // classifier only — no main model
      expect(res.body.template_used).toBe('event_planning')
      expect(res.body.classifier).toMatchObject({
        archetype: 'event_planning',
        confidence: 0.95,
      })
      expect(res.body.state.phase).toBe('shape')
      expect(res.body.state.shape.phases.length).toBeGreaterThanOrEqual(3)
      expect(res.body.state.shape.goal).toContain("Plan Katja's birthday")
      expect(res.body.ticket_updates).toMatchObject({ type: 'task' })
      expect(res.body.ready_to_advance).toBe(false)
    })

    it('falls through to model when confidence is below threshold', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          archetype: 'event_planning',
          confidence: 0.5,
          signals: ['party'],
        }),
      })
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'OK, model handled it.',
          shape: { phases: [], completion_criteria: [], inputs_needed: [] },
        }),
      })

      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: { title: 'Maybe a party' }, state: null })

      expect(res.status).toBe(200)
      expect(generateContent).toHaveBeenCalledTimes(2)
      expect(res.body.template_used).toBeNull()
      expect(res.body.classifier).toMatchObject({ archetype: 'event_planning' })

      // The second call (main model) should have received the classifier hint.
      const mainPrompt = generateContent.mock.calls[1][0].contents as string
      expect(mainPrompt).toContain('Classifier hint')
      expect(mainPrompt).toContain('event_planning')
    })

    it('falls through to model on "other" classification, even at high confidence', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          archetype: 'other',
          confidence: 0.95,
          signals: ['vague'],
        }),
      })
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'OK',
          shape: { phases: [], completion_criteria: [], inputs_needed: [] },
        }),
      })

      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: { title: 'Sort out the kitchen' }, state: null })

      expect(generateContent).toHaveBeenCalledTimes(2)
      expect(res.body.template_used).toBeNull()
      expect(res.body.classifier).toMatchObject({ archetype: 'other' })
    })

    it('falls through silently when the classifier errors', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockRejectedValueOnce(new Error('flash boom'))
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'OK',
          shape: { phases: [], completion_criteria: [], inputs_needed: [] },
        }),
      })

      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })

      expect(res.status).toBe(200)
      expect(generateContent).toHaveBeenCalledTimes(2)
      expect(res.body.template_used).toBeNull()
      expect(res.body.classifier).toBeNull()
    })

    it('does not run on subsequent shape turns (state.shape already set)', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'refining',
          shape: { phases: [], completion_criteria: [], inputs_needed: [] },
        }),
      })

      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'shape',
            shape: {
              goal: 'g',
              phases: [],
              completion_criteria: [],
              inputs_needed: [],
            },
            position: null,
            messages: [],
          },
        })

      expect(generateContent).toHaveBeenCalledTimes(1) // skipped classifier
    })

    it('does not run when user_message is present', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'noted',
          shape: { phases: [], completion_criteria: [], inputs_needed: [] },
        }),
      })

      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null, user_message: 'hi' })

      expect(generateContent).toHaveBeenCalledTimes(1) // skipped classifier
    })
  })

  it('passes through definition_of_done, open_questions_to_add, references_to_add', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Captured the structure.',
        ticket_updates: {
          definition_of_done: [
            { item: 'Pull last year actuals', done: false },
            { item: 'Sam approves the numbers', done: false },
          ],
          open_questions_to_add: [
            'Is the freeze date still in effect?',
            '   ', // whitespace-only — should be dropped
          ],
          references_to_add: [
            { kind: 'link', url_or_text: 'https://docs.example/q3', label: 'Q3 doc' },
            { kind: 'invalid', url_or_text: 'should be skipped' }, // bad kind — dropped
            { kind: 'snippet', url_or_text: '   ' }, // empty body — dropped
          ],
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.body.ticket_updates).toMatchObject({
      definition_of_done: [
        { item: 'Pull last year actuals', done: false },
        { item: 'Sam approves the numbers', done: false },
      ],
      open_questions_to_add: ['Is the freeze date still in effect?'],
      references_to_add: [
        {
          kind: 'link',
          url_or_text: 'https://docs.example/q3',
          label: 'Q3 doc',
        },
      ],
    })
  })

  it('surfaces existing open_questions and references in the prompt to the model', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ assistant_message: 'noted' }),
    })
    const app = await makeApp()
    await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: {
          title: 'X',
          definition_of_done: [{ item: 'ship it', done: true }],
          open_questions: [
            { question: 'who owns the ship date?', resolved: false, resolution: null },
          ],
          references: [
            { kind: 'link', url_or_text: 'https://example.test/spec', label: 'spec' },
          ],
        },
      })
    // Fast-path classifier runs first; the main model is the second call.
    const promptText = generateContent.mock.calls[1][0].contents as string
    expect(promptText).toContain('Definition of done so far')
    expect(promptText).toContain('[x] ship it')
    expect(promptText).toContain('Open questions on this ticket')
    expect(promptText).toContain('who owns the ship date?')
    expect(promptText).toContain('References on this ticket')
    expect(promptText).toContain('https://example.test/spec')
  })

  describe('suggested_steps wire passthrough', () => {
    function shapeWithSuggestions(overrides: unknown) {
      return {
        goal: 'x',
        phases: [
          {
            id: 'p1',
            title: 'Change lightbulb',
            description: null,
            status: 'not_started',
            category: 'doing',
            action: 'Change the bulb',
          },
        ],
        completion_criteria: [],
        inputs_needed: [],
        suggested_steps: overrides,
      }
    }

    async function postShape(suggestions: unknown) {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'shape ready',
          shape: shapeWithSuggestions(suggestions),
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      return res
    }

    it('passes valid suggestions through to state.shape.suggested_steps', async () => {
      const res = await postShape([
        {
          id: 's1',
          title: 'Buy lightbulb',
          category: 'doing',
          rationale: 'in case the bulb is dead',
          position: 'before',
          anchor_phase_id: 'p1',
        },
      ])
      expect(res.status).toBe(200)
      expect(res.body.state.shape.suggested_steps).toEqual([
        {
          id: 's1',
          title: 'Buy lightbulb',
          category: 'doing',
          rationale: 'in case the bulb is dead',
          position: 'before',
          anchor_phase_id: 'p1',
        },
      ])
    })

    it('falls back to position=end when anchor_phase_id does not resolve', async () => {
      const res = await postShape([
        {
          id: 's1',
          title: 'Test the new bulb',
          category: 'doing',
          position: 'after',
          anchor_phase_id: 'phase-that-does-not-exist',
        },
      ])
      const s = res.body.state.shape.suggested_steps[0]
      expect(s.position).toBe('end')
      expect(s.anchor_phase_id).toBeNull()
    })

    it('drops a suggestion that duplicates an existing phase title (case-insensitive)', async () => {
      const res = await postShape([
        {
          id: 's1',
          title: 'change lightbulb',
          category: 'doing',
          position: 'end',
        },
        {
          id: 's2',
          title: 'Buy lightbulb',
          category: 'doing',
          position: 'before',
          anchor_phase_id: 'p1',
        },
      ])
      const titles = res.body.state.shape.suggested_steps.map(
        (s: { title: string }) => s.title,
      )
      expect(titles).toEqual(['Buy lightbulb'])
    })

    it('drops malformed entries (missing required fields, bad category)', async () => {
      const res = await postShape([
        { id: '', title: 'x', category: 'doing', position: 'end' },
        { id: 's2', title: '   ', category: 'doing', position: 'end' },
        { id: 's3', title: 'Bad cat', category: 'rambling', position: 'end' },
        { id: 's4', title: 'OK', category: 'doing', position: 'end' },
      ])
      const ss = res.body.state.shape.suggested_steps
      expect(ss).toHaveLength(1)
      expect(ss[0]).toMatchObject({ id: 's4', title: 'OK', position: 'end' })
    })

    it('caps suggested_steps at 5 entries', async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        id: `s${i}`,
        title: `Suggestion ${i}`,
        category: 'doing',
        position: 'end',
      }))
      const res = await postShape(many)
      expect(res.body.state.shape.suggested_steps.length).toBe(5)
    })

    it('defaults suggested_steps to [] when the model omits the field', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          shape: {
            goal: null,
            phases: [],
            completion_criteria: [],
            inputs_needed: [],
            // suggested_steps omitted
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      expect(res.body.state.shape.suggested_steps).toEqual([])
    })

    it('system prompt requires per-phase definition_of_done AND ticket-level definition_of_done at shape time', async () => {
      // Fast-path classifier runs first, then the main model — assert
      // against the main model's systemInstruction.
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      await request(app).post('/api/assist/walkthrough').send({ ticket: TICKET })
      const call = generateContent.mock.calls[1][0]
      const systemInstruction = call.config.systemInstruction as string
      // Per-phase DoD must be required on every phase.
      expect(systemInstruction).toMatch(/definition_of_done.*REQUIRED/i)
      expect(systemInstruction).toMatch(/2-4 concrete completion checks/i)
      // Ticket-level DoD must be required during shape.
      expect(systemInstruction).toMatch(/REQUIRED during the shape turn/i)
    })

    it('backfills empty definition_of_done on phases when the model omitted them', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          shape: {
            goal: null,
            phases: [
              {
                id: 'p1',
                title: 'P1',
                description: null,
                status: 'not_started',
                category: 'doing',
                action: 'Do it',
                // definition_of_done omitted on purpose
              },
            ],
            completion_criteria: [],
            inputs_needed: [],
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      expect(res.body.state.shape.phases[0].definition_of_done).toEqual([])
    })

    it('passes through per-phase definition_of_done when the model emits it', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          shape: {
            goal: null,
            phases: [
              {
                id: 'p1',
                title: 'P1',
                description: null,
                status: 'not_started',
                category: 'doing',
                action: 'Do it',
                definition_of_done: [
                  { item: 'Got the thing', done: false },
                  { item: 'Sent it to Sam', done: false },
                  { item: '   ', done: false }, // empty item — sanitized out
                ],
              },
            ],
            completion_criteria: [],
            inputs_needed: [],
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      expect(res.body.state.shape.phases[0].definition_of_done).toEqual([
        { item: 'Got the thing', done: false },
        { item: 'Sent it to Sam', done: false },
      ])
    })

    it('system prompt teaches the model to emit optional adjacent steps', async () => {
      // We don't hit the model; we just assert the systemInstruction passed
      // to the SDK contains the suggested_steps contract. Fast-path
      // classifier runs first, then the main model — assert against the
      // main model's call.
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      await request(app).post('/api/assist/walkthrough').send({ ticket: TICKET })
      const call = generateContent.mock.calls[1][0]
      const systemInstruction = call.config.systemInstruction as string
      expect(systemInstruction).toContain('suggested_steps')
      expect(systemInstruction).toContain('Buy lightbulb')
      expect(systemInstruction).toContain('NEVER duplicate')
    })
  })

  describe('per-category playbook injection', () => {
    function shapeWithCategory(category: string) {
      return {
        goal: 'x',
        phases: [
          {
            id: 'p1',
            title: 'P1',
            description: null,
            status: 'in_progress' as const,
            category,
            action: 'placeholder',
          },
        ],
        completion_criteria: [],
        inputs_needed: [],
      }
    }

    async function callRefine(category: string) {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: shapeWithCategory(category),
            position: { current_phase_id: 'p1', blockers: [], notes: null },
            messages: [],
          },
          user_message: 'context',
        })
      return generateContent.mock.calls.at(-1)![0].contents as string
    }

    it('research → prompt mentions "good enough" and references/open_questions hints', async () => {
      const prompt = await callRefine('research')
      expect(prompt).toContain('Playbook for the current phase')
      expect(prompt).toContain('good enough')
      expect(prompt).toContain('references_to_add')
      expect(prompt).toContain('open_questions_to_add')
    })

    it('waiting → prompt mentions nudge + next_action_at hint', async () => {
      const prompt = await callRefine('waiting')
      expect(prompt).toContain('Playbook for the current phase')
      expect(prompt.toLowerCase()).toContain('nudge')
      expect(prompt).toContain('next_action_at')
    })

    it('closing → prompt mentions DoD-flip + status review/closed', async () => {
      const prompt = await callRefine('closing')
      expect(prompt).toContain('Playbook for the current phase')
      expect(prompt).toContain('definition_of_done')
      expect(prompt).toMatch(/review|closed/)
    })

    it('planning → prompt mentions next_question, one-at-a-time, and choice/short_text/long_text', async () => {
      const prompt = await callRefine('planning')
      expect(prompt).toContain('Playbook for the current phase')
      expect(prompt).toContain('next_question')
      expect(prompt.toLowerCase()).toContain('one question per turn')
      expect(prompt).toContain('choice')
      expect(prompt).toContain('short_text')
      expect(prompt).toContain('long_text')
    })

    it('deciding → prompt mentions options/criteria and ready_to_advance', async () => {
      const prompt = await callRefine('deciding')
      expect(prompt).toContain('Playbook for the current phase')
      expect(prompt.toLowerCase()).toContain('options')
      expect(prompt).toContain('ready_to_advance')
    })

    it('bootstrap (no state) → prompt instructs single-step vs multi-step classification, biased to fewer', async () => {
      // Fast-path classifier runs first, then the main model — assert
      // against the main model's prompt.
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      const promptText = generateContent.mock.calls[1][0].contents as string
      // bootstrap-only line in buildPrompt
      expect(promptText).toContain('single-step task')
      expect(promptText).toContain('multi-step task')
      expect(promptText).toContain('1 phase for single-step')
      expect(promptText).toContain('3-5 for multi-step')
      expect(promptText.toLowerCase()).toContain('bias toward fewer')
    })

    it('shape phase → no playbook block in prompt', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET, state: null })
      const prompt = generateContent.mock.calls[1][0].contents as string
      expect(prompt).not.toContain('Playbook for the current phase')
    })

    it('opting a non-planning category into interview: true flows the hints into the prompt', async () => {
      const { PHASE_PLAYBOOKS } = await import('../lib/phasePlaybooks.js')
      const previous = PHASE_PLAYBOOKS.deciding.interview
      PHASE_PLAYBOOKS.deciding.interview = true
      try {
        const prompt = await callRefine('deciding')
        expect(prompt).toContain('Playbook for the current phase')
        // The shared INTERVIEW_HINTS block now renders for deciding too.
        expect(prompt).toContain('next_question')
        expect(prompt.toLowerCase()).toContain('one question per turn')
        expect(prompt).toMatch(/never re-ask/i)
      } finally {
        PHASE_PLAYBOOKS.deciding.interview = previous
      }
    })

    it('refine with unresolved current_phase_id → no playbook block, no crash', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'ok' }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: shapeWithCategory('doing'),
            position: { current_phase_id: 'does-not-exist', blockers: [], notes: null },
            messages: [],
          },
        })
      expect(res.status).toBe(200)
      const prompt = generateContent.mock.calls[0][0].contents as string
      expect(prompt).not.toContain('Playbook for the current phase')
    })
  })

  describe('next_question wire passthrough', () => {
    it('passes a valid choice question through to state and top-level', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'A quick question to nail down scope.',
          next_question: {
            id: 'q_size',
            kind: 'choice',
            prompt: 'How many people are you planning for?',
            options: ['Under 10', '10-25', '25-50', '50+'],
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET })
      expect(res.body.next_question).toMatchObject({
        id: 'q_size',
        kind: 'choice',
        options: ['Under 10', '10-25', '25-50', '50+'],
      })
      expect(res.body.state.next_question).toMatchObject({ id: 'q_size' })
    })

    it('drops a choice question with no options', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          next_question: {
            id: 'q1',
            kind: 'choice',
            prompt: 'Pick one',
            // missing options
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET })
      expect(res.body.next_question).toBeNull()
      expect(res.body.state.next_question).toBeNull()
    })

    it('drops a question with empty prompt or unknown kind', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          next_question: { id: 'q1', kind: 'rambling', prompt: 'hi' },
        }),
      })
      const app = await makeApp()
      const res1 = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET })
      expect(res1.body.next_question).toBeNull()

      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'ok',
          next_question: { id: 'q2', kind: 'short_text', prompt: '   ' },
        }),
      })
      const res2 = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET })
      expect(res2.body.next_question).toBeNull()
    })

    it('passes short_text without options through cleanly', async () => {
      process.env.GEMINI_API_KEY = 'k'
      mockClassifierFallthrough()
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'one more thing',
          next_question: {
            id: 'q_when',
            kind: 'short_text',
            prompt: 'When is the deadline?',
            placeholder: 'e.g. May 18',
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({ ticket: TICKET })
      expect(res.body.next_question).toMatchObject({
        kind: 'short_text',
        placeholder: 'e.g. May 18',
      })
    })

    it('drops a duplicate question whose prompt was already asked-and-answered', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'one more!',
          next_question: {
            id: 'q_again',
            kind: 'choice',
            // Same prompt, different punctuation/case → still a duplicate.
            prompt: 'how many people are you planning for',
            options: ['Under 10', '10-25'],
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: null,
            position: null,
            messages: [
              {
                role: 'user',
                text: 'Q: How many people are you planning for?\nA: Under 10',
                ts: '2026-04-29T00:00:00Z',
              },
            ],
            next_question: null,
          },
        })
      expect(res.body.next_question).toBeNull()
      expect(res.body.state.next_question).toBeNull()
    })

    it('keeps a non-duplicate question even when others have been asked', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          assistant_message: 'next thing',
          next_question: {
            id: 'q_when',
            kind: 'short_text',
            prompt: 'When is the deadline?',
          },
        }),
      })
      const app = await makeApp()
      const res = await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: null,
            position: null,
            messages: [
              {
                role: 'user',
                text: 'Q: How many people?\nA: Under 10',
                ts: '2026-04-29T00:00:00Z',
              },
            ],
            next_question: null,
          },
        })
      expect(res.body.next_question).toMatchObject({ id: 'q_when' })
    })

    it('prompt lists already-asked questions as a "do NOT re-ask" block', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'noted' }),
      })
      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: null,
            position: null,
            messages: [
              {
                role: 'user',
                text: 'Q: How many people?\nA: 25',
                ts: '2026-04-29T00:00:00Z',
              },
              {
                role: 'user',
                text: 'Q: What is the budget?\nA: $1000',
                ts: '2026-04-29T00:01:00Z',
              },
            ],
            next_question: null,
          },
        })
      const promptText = generateContent.mock.calls[0][0].contents as string
      expect(promptText).toContain('Questions already asked')
      expect(promptText).toContain('do NOT re-ask')
      expect(promptText).toContain('How many people?')
      expect(promptText).toContain('What is the budget?')
    })

    it('surfaces the previously-asked question in the prompt to the model', async () => {
      process.env.GEMINI_API_KEY = 'k'
      generateContent.mockResolvedValueOnce({
        text: JSON.stringify({ assistant_message: 'noted' }),
      })
      const app = await makeApp()
      await request(app)
        .post('/api/assist/walkthrough')
        .send({
          ticket: TICKET,
          state: {
            phase: 'refine',
            shape: {
              goal: null,
              phases: [
                {
                  id: 'p1',
                  title: 'Plan it',
                  description: null,
                  status: 'in_progress',
                  category: 'planning',
                  action: 'placeholder',
                },
              ],
              completion_criteria: [],
              inputs_needed: [],
            },
            position: { current_phase_id: 'p1', blockers: [], notes: null },
            messages: [],
            next_question: {
              id: 'q_size',
              kind: 'choice',
              prompt: 'How many people?',
              options: ['Under 10', '10-25'],
            },
          },
          user_message: 'Under 10',
        })
      const promptText = generateContent.mock.calls[0][0].contents as string
      expect(promptText).toContain('You just asked the user this question')
      expect(promptText).toContain('How many people?')
    })
  })

  it('refine phase: takes updated shape from model and carries position forward', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Refined the action for that phase.',
        shape: {
          goal: 'x',
          phases: [
            {
              id: 'p1',
              title: 'Research venues',
              description: null,
              status: 'in_progress',
              category: 'research',
              action: 'Email the three Pelican Hill candidates for May 18 availability',
              action_details: 'Confirm capacity for 80 in your message',
            },
          ],
          completion_criteria: [],
          inputs_needed: [],
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: TICKET,
        state: {
          phase: 'refine',
          shape: {
            goal: 'x',
            phases: [
              {
                id: 'p1',
                title: 'Research venues',
                description: null,
                status: 'not_started',
                category: 'research',
                action: 'Look up venues',
              },
            ],
            completion_criteria: [],
            inputs_needed: [],
          },
          position: { current_phase_id: 'p1', blockers: [], notes: null },
          messages: [],
        },
        user_message: 'wedding is May 18 at Pelican Hill, ~80 people',
      })
    expect(res.body.state.phase).toBe('refine')
    expect(res.body.state.shape.phases[0].action).toMatch(/Pelican Hill/)
    expect(res.body.state.position).toMatchObject({ current_phase_id: 'p1' })
  })
})
