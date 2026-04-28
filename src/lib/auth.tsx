import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { logOtpToConsole } from '@/lib/devOtp'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  sendOtp: (email: string) => Promise<{ error: Error | null }>
  verifyOtp: (
    email: string,
    token: string,
  ) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

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
        // Without this, the magic link in the email falls back to the
        // Supabase project's site_url, which is pinned to localhost.
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (!error) {
          void logOtpToConsole(email)
        }
        return { error }
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

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
