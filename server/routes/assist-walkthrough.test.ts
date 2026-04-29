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
  },
}))

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
    generateContent.mockResolvedValueOnce({ text: 'not json' })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: TICKET })
    expect(res.status).toBe(502)
  })

  it('502 when assistant_message is missing', async () => {
    process.env.GEMINI_API_KEY = 'k'
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

  it('passes through definition_of_done, open_questions_to_add, references_to_add', async () => {
    process.env.GEMINI_API_KEY = 'k'
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
    const promptText = generateContent.mock.calls[0][0].contents as string
    expect(promptText).toContain('Definition of done so far')
    expect(promptText).toContain('[x] ship it')
    expect(promptText).toContain('Open questions on this ticket')
    expect(promptText).toContain('who owns the ship date?')
    expect(promptText).toContain('References on this ticket')
    expect(promptText).toContain('https://example.test/spec')
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
