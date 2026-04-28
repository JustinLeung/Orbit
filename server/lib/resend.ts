import { Resend } from 'resend'

let cached: Resend | null = null

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!cached) cached = new Resend(process.env.RESEND_API_KEY)
  return cached
}

export function getFromAddress(): string {
  return process.env.RESEND_FROM ?? 'Orbit <noreply@example.com>'
}

export type SendEmailArgs = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendEmail(args: SendEmailArgs) {
  const client = getResend()
  if (!client) {
    return { error: { message: 'RESEND_API_KEY is not configured' } as const }
  }
  return client.emails.send({ from: getFromAddress(), ...args })
}
