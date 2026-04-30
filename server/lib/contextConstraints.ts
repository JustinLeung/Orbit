// Mirror of src/lib/contextConstraints.ts — see that file for the why.
// Client + server have separate tsconfigs; cross-tree imports are messy,
// so the helpers are duplicated. Change one, change the other.

export type ConstraintEffort = 'S' | 'M' | 'L' | 'XL'

export type Constraints = {
  budget: string | null
  deadline: string | null
  people: string | null
  effort: ConstraintEffort | null
}

export const EMPTY_CONSTRAINTS: Constraints = {
  budget: null,
  deadline: null,
  people: null,
  effort: null,
}

const CONSTRAINTS_BLOCK_RE =
  /\n*<!-- orbit:constraints -->[\s\S]*?<!-- \/orbit:constraints -->\n*/

const LINE_RE = /^([A-Za-z]+):\s*(.+)$/

const EFFORT_VALUES: ConstraintEffort[] = ['S', 'M', 'L', 'XL']

function isEffort(s: string): s is ConstraintEffort {
  return (EFFORT_VALUES as string[]).includes(s)
}

export function extractConstraints(
  context: string | null | undefined,
): Constraints {
  if (!context) return { ...EMPTY_CONSTRAINTS }
  const match = context.match(CONSTRAINTS_BLOCK_RE)
  if (!match) return { ...EMPTY_CONSTRAINTS }
  const inner = match[0]
    .replace(/<!-- orbit:constraints -->/, '')
    .replace(/<!-- \/orbit:constraints -->/, '')
  const out: Constraints = { ...EMPTY_CONSTRAINTS }
  for (const rawLine of inner.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    const m = line.match(LINE_RE)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (value === '') continue
    if (key === 'budget') out.budget = value
    else if (key === 'deadline') out.deadline = value
    else if (key === 'people') out.people = value
    else if (key === 'effort') out.effort = isEffort(value) ? value : null
  }
  return out
}

function formatBlock(c: Constraints): string {
  const lines: string[] = ['<!-- orbit:constraints -->']
  if (c.budget) lines.push(`Budget: ${c.budget}`)
  if (c.deadline) lines.push(`Deadline: ${c.deadline}`)
  if (c.people) lines.push(`People: ${c.people}`)
  if (c.effort) lines.push(`Effort: ${c.effort}`)
  lines.push('<!-- /orbit:constraints -->')
  return lines.join('\n')
}

export function applyConstraints(
  context: string | null | undefined,
  next: Constraints,
): string | null {
  const allEmpty = !next.budget && !next.deadline && !next.people && !next.effort
  const stripped = (context ?? '').replace(CONSTRAINTS_BLOCK_RE, '\n')
  const trimmed = stripped.replace(/\s+$/, '').replace(/^\s+/, '')
  if (allEmpty) {
    return trimmed === '' ? null : trimmed
  }
  const block = formatBlock(next)
  if (trimmed === '') return block
  return `${trimmed}\n\n${block}`
}
