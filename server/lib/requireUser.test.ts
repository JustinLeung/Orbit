import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'

const getUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser },
  }),
}))

async function makeApp() {
  const { requireUser } = await import('./requireUser.js')
  const { __resetSupabaseAdminForTests } = await import('./supabaseAdmin.js')
  __resetSupabaseAdminForTests()
  const app = express()
  app.use(express.json())
  app.get('/protected', requireUser(), (req, res) => {
    res.json({ userId: req.userId, userEmail: req.userEmail })
  })
  return app
}

describe('requireUser middleware', () => {
  beforeEach(() => {
    getUser.mockReset()
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_URL
  })

  it('503s when the admin client is not configured', async () => {
    const app = await makeApp()
    const res = await request(app).get('/protected')
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/SERVICE_ROLE_KEY/)
  })

  it('401s when the Authorization header is missing', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    const app = await makeApp()
    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('401s when the Authorization header is malformed', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    const app = await makeApp()
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc')
    expect(res.status).toBe(401)
    expect(getUser).not.toHaveBeenCalled()
  })

  it('401s when the token is rejected by Supabase', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    const app = await makeApp()
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer bogus')
    expect(res.status).toBe(401)
    expect(getUser).toHaveBeenCalledWith('bogus')
  })

  it('attaches userId/userEmail and calls next on a valid token', async () => {
    process.env.VITE_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv'
    getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123', email: 'a@example.com' } },
      error: null,
    })
    const app = await makeApp()
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer good-token')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-123', userEmail: 'a@example.com' })
    expect(getUser).toHaveBeenCalledWith('good-token')
  })
})
