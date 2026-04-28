import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Stub Supabase before any module that imports it loads. AuthProvider calls
// getSession() on mount; returning a never-resolving promise keeps it in the
// loading state so we don't need a real session.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => new Promise(() => {}),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}))

import App from './App'
import { AuthProvider } from '@/lib/auth'

describe('App', () => {
  it('renders the login route without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(document.body).toBeInTheDocument()
  })

  it('does not render protected pages while auth is loading', () => {
    render(
      <MemoryRouter initialEntries={['/now']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/inbox/i)).not.toBeInTheDocument()
  })
})
