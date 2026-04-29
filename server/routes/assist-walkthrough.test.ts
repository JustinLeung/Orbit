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

  it('shape phase: starts with empty state and returns a shape', async () => {
    process.env.GEMINI_API_KEY = 'k'
    mockClassifierFallthrough()
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: "Here's how I see the shape of this.",
        ready_to_advance: false,
        shape: {
          goal: 'Align Q3 budget',
          phases: [
            { id: 'p1', title: 'Pull last year actuals', status: 'not_started', category: 'research' },
            { id: 'p2', title: 'Draft Q3 numbers', status: 'not_started', category: 'doing' },
            { id: 'p3', title: 'Review with Sam', status: 'not_started', category: 'waiting' },
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
          next_steps: null,
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

  it('advance: bumps phase from shape to position before calling model', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'OK — where are you on this?',
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
            phases: [{ id: 'p1', title: 'P1', description: null, status: 'not_started', category: 'planning' }],
            completion_criteria: [],
            inputs_needed: [],
          },
          position: null,
          next_steps: null,
          messages: [],
        },
      })

    expect(res.body.state.phase).toBe('position')
    expect(res.body.state.position).toMatchObject({ current_phase_id: 'p1' })
    expect(res.body.state.shape).not.toBeNull() // carried forward
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
          phase: 'next_steps',
          shape: null,
          position: null,
          next_steps: [{ kind: 'next_step', title: 'do x', details: null, category: 'doing' }],
          messages: [],
        },
      })

    expect(generateContent).not.toHaveBeenCalled()
    expect(res.body.state.phase).toBe('done')
    expect(res.body.state.next_steps).toHaveLength(1)
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
            { id: 'p1', title: 'Decide on theme', status: 'not_started', category: 'deciding' },
            { id: 'p2', title: 'Wait for venue confirmation', status: 'not_started', category: 'waiting' },
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
            next_steps: null,
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

  it('next_steps phase: caps at 5', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        assistant_message: 'Try these.',
        next_steps: Array.from({ length: 8 }, (_, i) => ({
          kind: 'next_step',
          title: `step ${i}`,
          details: null,
          category: 'doing',
        })),
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: TICKET,
        state: {
          phase: 'next_steps',
          shape: null,
          position: null,
          next_steps: null,
          messages: [],
        },
      })
    expect(res.body.state.next_steps).toHaveLength(5)
  })
})
