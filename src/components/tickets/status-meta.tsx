import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  CirclePause,
  CircleX,
  Hourglass,
  type LucideIcon,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Wand2,
  Sparkles,
  Search,
  Mail,
  Users,
  ClipboardList,
  Lightbulb,
  Inbox as InboxIcon,
} from 'lucide-react'
import type { TicketStatus, TicketType } from '@/types/orbit'

// ── Status ────────────────────────────────────────────────────────────────
//
// Linear represents status with a colored circular icon. We map Orbit's
// status enum to a similar visual vocabulary so that the same icon shows
// up in list rows, the detail header, and the status menu.

export type StatusMeta = {
  label: string
  icon: LucideIcon
  // Tailwind text-color class — the icon is "stroke-only", color is set
  // through `text-*` rather than explicit fill.
  tone: string
  // Filled-pill background tone, used by the status pill in the dialog
  // header for stronger visual weight.
  pillBg: string
  pillFg: string
}

export const STATUS_META: Record<TicketStatus, StatusMeta> = {
  inbox: {
    label: 'Inbox',
    icon: CircleDashed,
    tone: 'text-muted-foreground',
    pillBg: 'bg-muted',
    pillFg: 'text-muted-foreground',
  },
  active: {
    label: 'In progress',
    icon: CircleDotDashed,
    tone: 'text-amber-500',
    pillBg: 'bg-amber-500/10',
    pillFg: 'text-amber-600 dark:text-amber-400',
  },
  waiting: {
    label: 'Waiting',
    icon: CirclePause,
    tone: 'text-sky-500',
    pillBg: 'bg-sky-500/10',
    pillFg: 'text-sky-600 dark:text-sky-400',
  },
  follow_up: {
    label: 'Follow-up',
    icon: CircleDot,
    tone: 'text-violet-500',
    pillBg: 'bg-violet-500/10',
    pillFg: 'text-violet-600 dark:text-violet-400',
  },
  review: {
    label: 'Review',
    icon: Hourglass,
    tone: 'text-fuchsia-500',
    pillBg: 'bg-fuchsia-500/10',
    pillFg: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
  closed: {
    label: 'Closed',
    icon: CircleCheck,
    tone: 'text-emerald-500',
    pillBg: 'bg-emerald-500/10',
    pillFg: 'text-emerald-600 dark:text-emerald-400',
  },
  dropped: {
    label: 'Dropped',
    icon: CircleX,
    tone: 'text-muted-foreground',
    pillBg: 'bg-muted',
    pillFg: 'text-muted-foreground',
  },
}

// Display order Linear-style: backlog → active → done.
export const STATUS_ORDER: TicketStatus[] = [
  'inbox',
  'active',
  'waiting',
  'follow_up',
  'review',
  'closed',
  'dropped',
]

// ── Priority (urgency) ────────────────────────────────────────────────────
//
// Orbit stores urgency/importance/energy as a 1–5 scale. For the priority
// column we collapse it into Linear's no-priority/low/medium/high/urgent
// vocabulary. The mapping mirrors what feels right at the boundary: 1 = low,
// 5 = urgent.

export type PriorityMeta = {
  label: string
  icon: LucideIcon
  tone: string
}

export function urgencyMeta(value: number | null): PriorityMeta {
  if (value == null) {
    return {
      label: 'No priority',
      icon: Signal,
      tone: 'text-muted-foreground/60',
    }
  }
  if (value >= 5) {
    return {
      label: 'Urgent',
      icon: SignalHigh,
      tone: 'text-destructive',
    }
  }
  if (value >= 4) {
    return { label: 'High', icon: SignalHigh, tone: 'text-amber-500' }
  }
  if (value >= 3) {
    return { label: 'Medium', icon: SignalMedium, tone: 'text-amber-500' }
  }
  if (value >= 2) {
    return { label: 'Low', icon: SignalLow, tone: 'text-muted-foreground' }
  }
  return { label: 'Low', icon: SignalLow, tone: 'text-muted-foreground' }
}

// ── Type ──────────────────────────────────────────────────────────────────

export type TypeMeta = {
  label: string
  icon: LucideIcon
  tone: string
}

export const TYPE_META: Record<TicketType, TypeMeta> = {
  task: { label: 'Task', icon: ClipboardList, tone: 'text-foreground' },
  research: { label: 'Research', icon: Search, tone: 'text-sky-500' },
  decision: { label: 'Decision', icon: Lightbulb, tone: 'text-amber-500' },
  waiting: { label: 'Waiting', icon: CirclePause, tone: 'text-sky-500' },
  follow_up: { label: 'Follow-up', icon: Mail, tone: 'text-violet-500' },
  admin: { label: 'Admin', icon: InboxIcon, tone: 'text-muted-foreground' },
  relationship: {
    label: 'Relationship',
    icon: Users,
    tone: 'text-emerald-500',
  },
}

// ── Agent mode ────────────────────────────────────────────────────────────

export const AGENT_MODE_META = {
  none: { label: 'None', icon: Circle, tone: 'text-muted-foreground/60' },
  assist: { label: 'Assist', icon: Sparkles, tone: 'text-primary' },
  semi_auto: { label: 'Semi-auto', icon: Wand2, tone: 'text-violet-500' },
  auto: { label: 'Auto', icon: Wand2, tone: 'text-fuchsia-500' },
} as const
