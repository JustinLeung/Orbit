import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue } from '@/lib/useAuth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Onboarding seed for fresh prod accounts. The RPC is idempotent
      // (no-ops if the user already has tickets), so re-firing on every
      // SIGNED_IN is safe. Dev uses `npm run seed` instead.
      if (event === 'SIGNED_IN' && next && import.meta.env.PROD) {
        void supabase.rpc('seed_onboarding_tickets').then(({ error }) => {
          if (error) console.warn('Onboarding seed skipped:', error.message)
        })
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      sendOtp: async (email) => {
        // We send the email ourselves via Resend (server route) instead of
        // letting Supabase send it. The route returns both a 6-digit code and
        // a magic link in one email; the user can use either.
        try {
          const res = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              redirectTo: window.location.origin,
            }),
          })
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as
              | { error?: unknown }
              | null
            const message =
              typeof body?.error === 'string'
                ? body.error
                : `Sign-in failed (${res.status})`
            return { error: new Error(message) }
          }
          return { error: null }
        } catch (err) {
          return { error: err instanceof Error ? err : new Error(String(err)) }
        }
      },
      verifyOtp: async (email, token) => {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'email',
        })
        return { error }
      },
      signInWithGoogle: async () => {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        })
        return { error }
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
    }),
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
