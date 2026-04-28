// Local dev convenience: after `signInWithOtp` sends a magic link, the email
// lands in the Supabase Inbucket container instead of a real inbox. We pull
// the latest message for the address, extract the confirmation URL, and log
// it to the browser console so you can click straight through.
//
// Only ever runs in dev — production builds skip it entirely.

const INBUCKET_URL = 'http://127.0.0.1:54424'

type InbucketMessage = {
  id: string
  from: { address: string }
  date: string
}

export async function logMagicLinkToConsole(email: string) {
  if (!import.meta.env.DEV) return

  const mailbox = email.split('@')[0]
  // Inbucket needs a moment to receive the message after Supabase sends it.
  await new Promise((r) => setTimeout(r, 500))

  try {
    const listRes = await fetch(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`)
    if (!listRes.ok) {
      console.warn('[orbit] Inbucket not reachable — open', INBUCKET_URL)
      return
    }
    const messages = (await listRes.json()) as InbucketMessage[]
    if (!messages.length) {
      console.warn('[orbit] No magic-link email yet — try Inbucket UI:', INBUCKET_URL)
      return
    }
    const latest = messages.sort((a, b) => b.date.localeCompare(a.date))[0]
    const detailRes = await fetch(
      `${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${latest.id}`,
    )
    const detail = (await detailRes.json()) as { body: { text: string } }
    const url = detail.body.text.match(/https?:\/\/\S+/)?.[0]
    if (url) {
      // eslint-disable-next-line no-console
      console.log('%c[orbit] Magic link →', 'color:#a855f7;font-weight:bold', url)
    } else {
      console.warn('[orbit] Could not parse magic link from email body')
    }
  } catch (err) {
    console.warn('[orbit] Failed to fetch magic link from Inbucket:', err)
  }
}
