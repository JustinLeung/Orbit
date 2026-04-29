import type { AgentMode, TicketStatus, TicketType } from '@/types/orbit'

export const TYPE_OPTIONS: Array<{ value: TicketType; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'research', label: 'Research' },
  { value: 'decision', label: 'Decision' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'admin', label: 'Admin' },
  { value: 'relationship', label: 'Relationship' },
]

export const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'review', label: 'Review' },
  { value: 'closed', label: 'Closed' },
  { value: 'dropped', label: 'Dropped' },
]

export const AGENT_MODE_OPTIONS: Array<{ value: AgentMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'assist', label: 'Assist' },
  { value: 'semi_auto', label: 'Semi-auto' },
  { value: 'auto', label: 'Auto' },
]

export const SCALE_OPTIONS = [1, 2, 3, 4, 5] as const

export function trimOrNull(value: string): string | null {
  const t = value.trim()
  return t === '' ? null : t
}

export function scaleOrNull(value: string): number | null {
  if (value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
