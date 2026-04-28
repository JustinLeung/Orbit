import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const generateLink = vi.fn()
const emailsSend = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { generateLink } },
  }),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailsSend }
  },
}))

async function makeApp() {
  const { default: route } = await import('./send-otp.js')
  const { __resetSupabaseAdminForTests } = await import('../lib/supabaseAdmin.js')
  const { __resetResendForTests } = await import('../lib/resend.js')
  __resetSupabaseAdminForTests()
  __resetResendForTests()
  const app = express()
  app.use(express.json())
  app.use('/api/auth/send-otp', route)
  return app
}

describe('POST /api/auth/send-otp', () => {
  beforeEach(() => {
    generateLink.mockReset()
    emailsSend.mockReset()
    delete process.env.RESEND_API_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_URL
    process.env.NODE_ENV = 'test'
  })

  it('400s when email is missing or malformed', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    const app = await makeApp()
    const res1 = await request(app).post('/api/auth/send-otp').send({})
    expect(res1.status).toBe(400)
    const res2 = await request(app).post('/api/auth/send-otp').send({ email: 'nope' })
    expect(res2.status).toBe(400)
  })

  it('503s when service role key is missing', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'a@example.com' })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/SERVICE_ROLE_KEY/)
  })

  it('falls back to signup when the user does not exist, then sends via Resend', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    process.env.RESEND_API_KEY = 'rk'
    process.env.NODE_ENV = 'production'

    generateLink
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'User not found', code: 'user_not_found', status: 404 },
      })
      .mockResolvedValueOnce({
        data: {
          properties: {
            action_link: 'https://supabase.example/verify?token=abc',
            email_otp: '123456',
          },
        },
        error: null,
      })
    emailsSend.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null })

    const app = await makeApp()
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'new@example.com', redirectTo: 'http://localhost:5173' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(generateLink).toHaveBeenCalledTimes(2)
    expect(generateLink.mock.calls[0][0].type).toBe('magiclink')
    expect(generateLink.mock.calls[1][0].type).toBe('signup')
    expect(emailsSend).toHaveBeenCalledTimes(1)
    const sent = emailsSend.mock.calls[0][0]
    expect(sent.to).toBe('new@example.com')
    expect(sent.html).toContain('123456')
    expect(sent.html).toContain('https://supabase.example/verify?token=abc')
  })

  it('uses dev fallback (logs to console) when RESEND_API_KEY is missing in dev', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    generateLink.mockResolvedValueOnce({
      data: {
        properties: {
          action_link: 'https://supabase.example/verify?token=xyz',
          email_otp: '987654',
        },
      },
      error: null,
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const app = await makeApp()
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'dev@example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, dev: true })
    expect(emailsSend).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
    const logged = logSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('987654')
    expect(logged).toContain('https://supabase.example/verify?token=xyz')
    logSpy.mockRestore()
  })
})
