import { NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Clock,
  Inbox,
  LogOut,
  MessageCircle,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/inbox', label: 'Inbox', icon: Inbox },
  { to: '/now', label: 'Now', icon: Target },
  { to: '/waiting', label: 'Waiting', icon: Clock },
  { to: '/follow-up', label: 'Follow-Up', icon: MessageCircle },
  { to: '/review', label: 'Review', icon: Sparkles },
  { to: '/stuck', label: 'Stuck', icon: AlertTriangle },
  { to: '/people', label: 'People', icon: Users },
]

export function AppLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="px-5 py-6">
          <h1 className="text-lg font-semibold tracking-tight">Orbit</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Keep every open loop in motion.
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t px-3 py-3">
          <div className="truncate px-2 pb-2 text-xs text-muted-foreground">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
