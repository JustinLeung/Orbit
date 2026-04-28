import { Router } from 'express'
import { sendEmail } from '../lib/resend.js'

const router = Router()

router.post('/', async (req, res) => {
  const { to, subject, html } = req.body ?? {}
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, and html are required' })
  }

  const result = await sendEmail({ to, subject, html })
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

  const data = 'data' in result ? result.data : undefined
  res.json({ id: data?.id })
})

export default router
