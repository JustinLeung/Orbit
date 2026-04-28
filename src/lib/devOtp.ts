// Local dev convenience: after `signInWithOtp` sends an email, the message
// lands in the Supabase Mailpit container instead of a real inbox. We pull
// the latest message for the address, extract the 6-digit code, and log it
// to the browser console so you can paste it straight into the form.
//
// Only ever runs in dev — production builds skip it entirely.

// Mailpit has no CORS headers, so we route through the Vite dev proxy
// (see `server.proxy['/__mailpit']` in vite.config.ts).
const MAILPIT_URL = '/__mailpit'

type MailpitMessage = {
  ID: string
  Created: string
  Snippet: string
}

type MailpitSearch = {
  messages: MailpitMessage[]
}

export async function logOtpToConsole(email: string) {
  if (!import.meta.env.DEV) return

  // Mailpit needs a moment to receive the message after Supabase sends it.
  await new Promise((r) => setTimeout(r, 500))

  try {
    const query = encodeURIComponent(`to:${email}`)
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}&limit=1`)
    if (!res.ok) {
      console.warn('[orbit] Mailpit not reachable — open', MAILPIT_URL)
      return
    }
    const data = (await res.json()) as MailpitSearch
    if (!data.messages.length) {
      console.warn('[orbit] No OTP email yet — try Mailpit UI:', MAILPIT_URL)
      return
    }
    const latest = data.messages.sort((a, b) => b.Created.localeCompare(a.Created))[0]

    let code = latest.Snippet.match(/\b\d{6}\b/)?.[0]
    if (!code) {
      const detailRes = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)
      const detail = (await detailRes.json()) as { Text: string }
      code = detail.Text.match(/\b\d{6}\b/)?.[0]
    }

    if (code) {
      // eslint-disable-next-line no-console
      console.log('%c[orbit] OTP →', 'color:#a855f7;font-weight:bold', code)
    } else {
      console.warn('[orbit] Could not parse OTP from email')
    }
  } catch (err) {
    console.warn('[orbit] Failed to fetch OTP from Mailpit:', err)
  }
}
