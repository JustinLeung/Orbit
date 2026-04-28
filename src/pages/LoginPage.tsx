import { Navigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'

export function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth()

  if (loading) return null
  if (session) return <Navigate to="/now" replace />

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep every open loop in motion.
        </p>
        <Button className="mt-6 w-full" onClick={() => void signInWithGoogle()}>
          Continue with Google
        </Button>
      </div>
    </div>
  )
}
