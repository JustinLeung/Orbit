import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const generateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent }
  },
  // The route imports `Type` for its responseSchema. Provide a minimal
  // shim so module resolution succeeds in tests.
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    INTEGER: 'INTEGER',
    ARRAY: 'ARRAY',
  },
}))

async function makeApp() {
  const { default: route } = await import('./assist-clarify.js')
  const { __resetGeminiForTests } = await import('../lib/gemini.js')
  __resetGeminiForTests()
  const app = express()
  app.use(express.json())
  app.use('/api/assist/clarify', route)
  return app
}

describe('POST /api/assist/clarify', () => {
  beforeEach(() => {
    generateContent.mockReset()
    delete process.env.GEMINI_API_KEY
  })

  it('400s when initial is missing', async () => {
    process.env.GEMINI_API_KEY = 'k'
    const app = await makeApp()
    const res = await request(app).post('/api/assist/clarify').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/initial/)
  })

  it('503s when GEMINI_API_KEY is not configured', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({ initial: 'follow up with sam' })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/GEMINI_API_KEY/)
  })

  it('returns the next question when the model is not done', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        done: false,
        question: {
          prompt: 'When do you need to hear back?',
          suggestions: ['Today', 'This week', 'No rush'],
        },
      }),
    })

    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({ initial: 'follow up with sam', turns: [] })

    expect(res.status).toBe(200)
    expect(res.body.done).toBe(false)
    expect(res.body.question.prompt).toMatch(/hear back/)
    expect(res.body.question.suggestions).toHaveLength(3)
  })

  it('caps suggestions at 4', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        done: false,
        question: {
          prompt: 'Pick one',
          suggestions: ['a', 'b', 'c', 'd', 'e', 'f'],
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({ initial: 'x', turns: [] })
    expect(res.body.question.suggestions).toHaveLength(4)
  })

  it('returns a draft when the model is done', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        done: true,
        draft: {
          title: 'Follow up with Sam re: Q3 budget',
          description: null,
          type: 'follow_up',
          status: 'inbox',
          goal: null,
          next_action: 'Email Sam asking for the latest numbers',
          next_action_at: null,
          urgency: 3,
          importance: 4,
          energy_required: null,
          context: null,
        },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({
        initial: 'follow up with sam about Q3 budget',
        turns: [{ question: 'How urgent?', answer: 'somewhat' }],
      })
    expect(res.status).toBe(200)
    expect(res.body.done).toBe(true)
    expect(res.body.draft.title).toMatch(/Sam/)
    expect(res.body.draft.type).toBe('follow_up')
  })

  it('502s when the model returns malformed JSON', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({ text: 'not json {' })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({ initial: 'x', turns: [] })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/JSON/)
  })

  it('502s when the model fails to finalize after 3 turns', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        done: false,
        question: { prompt: 'one more?', suggestions: [] },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({
        initial: 'x',
        turns: [
          { question: 'q1', answer: 'a1' },
          { question: 'q2', answer: 'a2' },
          { question: 'q3', answer: 'a3' },
        ],
      })
    expect(res.status).toBe(502)
    expect(res.body.error).toMatch(/finalize/)
  })

  it('502s when finalize=true but model still asks', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        done: false,
        question: { prompt: 'sure?', suggestions: [] },
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/clarify')
      .send({ initial: 'x', turns: [], finalize: true })
    expect(res.status).toBe(502)
  })
})
