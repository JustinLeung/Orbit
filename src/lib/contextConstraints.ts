// Constraint pills (Budget / Deadline / People / Effort) live in the
// ticket's free-form `context` string, fenced by stable HTML-comment
// markers so we can extract + replace them deterministically without
// clobbering whatever else the user (or the model) has written there.
//
// Layout inside `context`:
//
//   …whatever else is already in context…
//
//   <!-- orbit:constraints -->
//   Budget: $500
//   Deadline: 2026-05-20
//   People: 8
//   Effort: M
//   <!-- /orbit:constraints -->
//
// Re-extraction is cheap (regex on the markers) so the pills stay
// re-editable. The block is always pinned to the END of context — the
// model treats `context` as append-style, so we want our marker block
// out of the way of the running narrative.

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

// Returns the new `context` string with the constraints block replaced.
// If every field is null, the block is removed (so we don't leave an
// empty marker stub behind). Returns null when the resulting context
// would be empty — callers should treat that as "clear context".
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
