import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'awaiting-code' }
  | { kind: 'verifying' }
  | { kind: 'error'; message: string }

// Both providers are offered in prod; dev hides the Google button because
// the local Supabase stack has no OAuth credentials wired up.
const SHOW_GOOGLE = !import.meta.env.DEV

export function LoginPage() {
  const { session, loading, sendOtp, verifyOtp, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  if (loading) return null
  if (session) return <Navigate to="/now" replace />

  async function onGoogle() {
    setStatus({ kind: 'sending' })
    const { error } = await signInWithGoogle()
    if (error) setStatus({ kind: 'error', message: error.message })
  }

  async function onSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    setStatus({ kind: 'sending' })
    const { error } = await sendOtp(email)
    if (error) {
      setStatus({ kind: 'error', message: error.message })
      return
    }
    setStatus({ kind: 'awaiting-code' })
  }

  async function onVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code) return
    setStatus({ kind: 'verifying' })
    const { error } = await verifyOtp(email, code)
    if (error) {
      setStatus({ kind: 'error', message: error.message })
      return
    }
    // Auth state listener will navigate via the <Navigate> above.
  }

  const awaitingCode =
    status.kind === 'awaiting-code' ||
    status.kind === 'verifying' ||
    (status.kind === 'error' && code.length > 0)

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep every open loop in motion.
        </p>

        {SHOW_GOOGLE ? (
          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onGoogle}
              disabled={status.kind === 'sending'}
            >
              {status.kind === 'sending' ? 'Redirecting…' : 'Continue with Google'}
            </Button>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        ) : null}

        {!awaitingCode ? (
          <form onSubmit={onSendOtp} className="mt-3 space-y-3">
            <Input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status.kind === 'sending'}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={!email || status.kind === 'sending'}
            >
              {status.kind === 'sending' ? 'Sending…' : 'Email me a code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onVerifyOtp} className="mt-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium">{email}</span>.
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              disabled={status.kind === 'verifying'}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || status.kind === 'verifying'}
            >
              {status.kind === 'verifying' ? 'Verifying…' : 'Verify code'}
            </Button>
            <button
              type="button"
              className="w-full text-xs text-muted-foreground underline"
              onClick={() => {
                setCode('')
                setStatus({ kind: 'idle' })
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {import.meta.env.DEV && status.kind === 'awaiting-code' ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Check your devtools console for the code, or open Mailpit at{' '}
            <a
              className="underline"
              href="http://127.0.0.1:54424"
              target="_blank"
              rel="noreferrer"
            >
              127.0.0.1:54424
            </a>
            .
          </p>
        ) : null}

        {status.kind === 'error' ? (
          <p className="mt-4 text-xs text-destructive">{status.message}</p>
        ) : null}
      </div>
    </div>
  )
}
