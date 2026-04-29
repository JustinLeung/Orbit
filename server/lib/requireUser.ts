import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { getSupabaseAdmin } from './supabaseAdmin.js'

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string
    userEmail?: string
  }
}

const BEARER_RE = /^Bearer\s+(.+)$/i

export function requireUser(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return res.status(503).json({
        error: 'SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL) must be set',
      })
    }

    const header = req.header('authorization')
    const match = header && BEARER_RE.exec(header)
    const token = match?.[1]?.trim()
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization bearer token' })
    }

    const { data, error } = await admin.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    req.userId = data.user.id
    if (data.user.email) req.userEmail = data.user.email
    next()
  }
}
