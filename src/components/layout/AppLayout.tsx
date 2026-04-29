import { NavLink, Outlet } from 'react-router-dom'
import {
  AlertTriangle,
  Clock,
  Inbox,
  LogOut,
  MessageCircle,
  Plus,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/useAuth'
import { CreateTicketProvider } from '@/lib/createTicket'
import { useCreateTicket } from '@/lib/useCreateTicket'
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

function Sidebar() {
  const { user, signOut } = useAuth()
  const { openCreate } = useCreateTicket()

  return (
    <aside className="flex w-56 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-6">
        <h1 className="text-lg font-semibold tracking-tight">Orbit</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Keep every open loop in motion.
        </p>
      </div>
      <div className="px-3 pb-3">
        <Button
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => openCreate()}
        >
          <Plus className="size-4" />
          New ticket
          <span className="ml-auto rounded border border-primary-foreground/30 px-1 text-[10px] font-mono text-primary-foreground/70">
            n
          </span>
        </Button>
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
  )
}

export function AppLayout() {
  return (
    <CreateTicketProvider>
      <div className="flex min-h-svh">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </CreateTicketProvider>
  )
}
