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

async function makeApp() {
  const { default: route } = await import('./assist-pre-mortem.js')
  const { __resetGeminiForTests } = await import('../lib/gemini.js')
  __resetGeminiForTests()
  const app = express()
  app.use(express.json())
  app.use('/api/assist/pre-mortem', route)
  return app
}

const TICKET = {
  title: "Plan my brother's 30th birthday",
  description: 'Saturday May 16 in SF',
}

describe('POST /api/assist/pre-mortem', () => {
  beforeEach(() => {
    generateContent.mockReset()
    delete process.env.GEMINI_API_KEY
  })

  it('400s when ticket.title is missing', async () => {
    process.env.GEMINI_API_KEY = 'k'
    const app = await makeApp()
    const res = await request(app).post('/api/assist/pre-mortem').send({})
    expect(res.status).toBe(400)
  })

  it('503s when GEMINI_API_KEY is unset', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/pre-mortem')
      .send({ ticket: TICKET })
    expect(res.status).toBe(503)
  })

  it('returns unblocker items when the model produces a clean payload', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        risks: [
          {
            question: 'Which of the three venues fits the budget?',
            rationale: null,
          },
          {
            question: 'Is Sam free on the 16th, or do we need a different date?',
            rationale: 'Date confirmation unblocks invites.',
          },
        ],
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/pre-mortem')
      .send({ ticket: TICKET })
    expect(res.status).toBe(200)
    expect(res.body.risks).toHaveLength(2)
    expect(res.body.risks[0].question).toMatch(/venues/)
  })

  it('drops items whose prompt duplicates an existing open question', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        risks: [
          { question: 'Which of the three venues fits the budget?' },
          { question: 'What date works for the venue and Sam?' },
        ],
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/pre-mortem')
      .send({
        ticket: {
          ...TICKET,
          open_questions: [
            {
              question: 'which of the three venues fits the budget',
              resolved: false,
              resolution: null,
            },
          ],
        },
      })
    expect(res.status).toBe(200)
    expect(res.body.risks).toHaveLength(1)
    expect(res.body.risks[0].question).toMatch(/date/)
  })

  it('caps the list at 5 even if the model returns more', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        risks: [
          { question: 'A?' },
          { question: 'B?' },
          { question: 'C?' },
          { question: 'D?' },
          { question: 'E?' },
          { question: 'F?' },
          { question: 'G?' },
        ],
      }),
    })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/pre-mortem')
      .send({ ticket: TICKET })
    expect(res.status).toBe(200)
    expect(res.body.risks).toHaveLength(5)
  })

  it('502s on malformed JSON', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({ text: 'not-json' })
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/pre-mortem')
      .send({ ticket: TICKET })
    expect(res.status).toBe(502)
  })
})
