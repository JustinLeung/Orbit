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

  it('returns risks when the model produces a clean payload', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        risks: [
          {
            question: 'What if the venue cancels last minute?',
            rationale: null,
          },
          {
            question: 'Are we sure the budget covers tax and tip?',
            rationale: 'Catered dinners often get expensive late.',
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
    expect(res.body.risks[0].question).toMatch(/cancels/)
  })

  it('drops risks whose prompt duplicates an existing open question', async () => {
    process.env.GEMINI_API_KEY = 'k'
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        risks: [
          { question: 'What if the venue cancels last minute?' },
          { question: 'How will we handle weather?' },
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
            { question: 'what if the venue cancels last minute', resolved: false, resolution: null },
          ],
        },
      })
    expect(res.status).toBe(200)
    expect(res.body.risks).toHaveLength(1)
    expect(res.body.risks[0].question).toMatch(/weather/)
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
