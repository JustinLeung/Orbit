import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { sendEmail } from '../lib/resend.js'

const router = Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LinkProps = {
  action_link?: string
  email_otp?: string
}

router.post('/', async (req, res) => {
  const { email, redirectTo } = req.body ?? {}
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' })
  }

  const admin = getSupabaseAdmin()
  if (!admin) {
    return res.status(503).json({
      error: 'SUPABASE_SERVICE_ROLE_KEY (and VITE_SUPABASE_URL) must be set',
    })
  }

  const options = redirectTo ? { redirectTo } : undefined

  // magiclink works for existing users; signup creates a new one. Try magic
  // first, fall back to signup if the user doesn't exist yet.
  let gen = await admin.auth.admin.generateLink({ type: 'magiclink', email, options })
  if (gen.error) {
    const code = (gen.error as { code?: string; status?: number }).code
    const status = (gen.error as { status?: number }).status
    const isMissingUser =
      code === 'user_not_found' ||
      status === 404 ||
      /user.*not.*found/i.test(gen.error.message ?? '')
    if (isMissingUser) {
      gen = await admin.auth.admin.generateLink({
        type: 'signup',
        email,
        password: randomUUID(),
        options,
      })
    }
  }

  if (gen.error || !gen.data) {
    return res.status(500).json({ error: gen.error?.message ?? 'Failed to generate link' })
  }

  const props = (gen.data.properties ?? {}) as LinkProps
  const actionLink = props.action_link
  const code = props.email_otp
  if (!actionLink || !code) {
    return res.status(500).json({ error: 'Supabase did not return both link and code' })
  }

  const subject = `Your Orbit sign-in code: ${code}`
  const html = renderEmail({ actionLink, code })
  const text = renderText({ actionLink, code })

  // Dev fallback: with no Resend key, print the code + link to the server
  // console so the local sign-in flow still works end-to-end.
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'production') {
    console.log(
      `\n[orbit] Sign-in for ${email}\n  code: ${code}\n  link: ${actionLink}\n`,
    )
    return res.json({ ok: true, dev: true })
  }

  const result = await sendEmail({ to: email, subject, html, text })
  if ('error' in result && result.error) {
    const message =
      typeof result.error === 'object' && 'message' in result.error
        ? (result.error as { message: string }).message
        : 'Email send failed'
    if (message.includes('RESEND_API_KEY')) {
      return res.status(503).json({ error: message })
    }
    return res.status(500).json({ error: result.error })
  }

  res.json({ ok: true })
})

function renderEmail({ actionLink, code }: { actionLink: string; code: string }) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, system-ui, sans-serif; color: #111;">
    <div style="max-width: 480px; margin: 32px auto; padding: 24px; border: 1px solid #eee; border-radius: 12px;">
      <h1 style="font-size: 18px; margin: 0 0 16px;">Sign in to Orbit</h1>
      <p style="margin: 0 0 8px;">Your one-time code:</p>
      <p style="font-size: 28px; letter-spacing: 6px; font-weight: 600; margin: 0 0 24px;">${code}</p>
      <p style="margin: 0 0 12px;">Or click this link to sign in instantly:</p>
      <p style="margin: 0 0 24px;">
        <a href="${actionLink}" style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; border-radius: 8px; text-decoration: none;">Sign in to Orbit</a>
      </p>
      <p style="font-size: 12px; color: #666; margin: 0;">This code expires in 1 hour. If you didn't request it, you can ignore this email.</p>
    </div>
  </body>
</html>`
}

function renderText({ actionLink, code }: { actionLink: string; code: string }) {
  return `Sign in to Orbit

Your one-time code: ${code}

Or open this link to sign in:
${actionLink}

This code expires in 1 hour. If you didn't request it, you can ignore this email.`
}

export default router
