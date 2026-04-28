import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import sendEmailRoute from './send-email.js'
import { __resetResendForTests } from '../lib/resend.js'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/send-email', sendEmailRoute)
  return app
}

describe('POST /api/send-email', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY
    __resetResendForTests()
  })

  it('returns 503 when RESEND_API_KEY is not configured', async () => {
    const res = await request(makeApp())
      .post('/api/send-email')
      .send({ to: 'a@example.com', subject: 'hi', html: '<p>hi</p>' })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/RESEND_API_KEY/)
  })

  it('returns 400 when required fields are missing (and key is set)', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    const res = await request(makeApp())
      .post('/api/send-email')
      .send({ to: 'a@example.com' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/)
  })
})
