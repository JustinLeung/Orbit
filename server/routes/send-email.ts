import { Router } from 'express'
import { Resend } from 'resend'

const router = Router()

let resend: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

router.post('/', async (req, res) => {
  const client = getResend()
  if (!client) {
    return res.status(503).json({ error: 'RESEND_API_KEY is not configured' })
  }

  const { to, subject, html } = req.body ?? {}
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, and html are required' })
  }

  const { data, error } = await client.emails.send({
    from: process.env.RESEND_FROM ?? 'Orbit <noreply@example.com>',
    to,
    subject,
    html,
  })

  if (error) {
    return res.status(500).json({ error })
  }
  res.json({ id: data?.id })
})

export default router
