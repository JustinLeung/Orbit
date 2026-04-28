import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'

export function LoginPage() {
  const { session, loading, sendMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'sent' }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' })

  if (loading) return null
  if (session) return <Navigate to="/now" replace />

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    setStatus({ kind: 'sending' })
    const { error } = await sendMagicLink(email)
    if (error) {
      setStatus({ kind: 'error', message: error.message })
      return
    }
    setStatus({ kind: 'sent' })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep every open loop in motion.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <Input
            type="email"
            required
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status.kind === 'sending' || status.kind === 'sent'}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={
              !email ||
              status.kind === 'sending' ||
              status.kind === 'sent'
            }
          >
            {status.kind === 'sending'
              ? 'Sending…'
              : status.kind === 'sent'
                ? 'Magic link sent'
                : 'Send magic link'}
          </Button>
        </form>

        {status.kind === 'sent' ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Check your devtools console for the magic link, or open Inbucket at{' '}
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
