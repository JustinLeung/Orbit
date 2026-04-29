import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ARCHETYPES,
  classifyArchetype,
  type Archetype,
  type ClassifyResult,
} from '../classifyArchetype.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BANK_PATH = path.join(__dirname, 'archetypeBank.jsonl')
const LAST_RUN_PATH = path.join(__dirname, 'last-run.json')

export type BankCase = {
  id: string
  title: string
  description?: string
  expected: Archetype
  notes?: string
}

export type CaseResult = BankCase & {
  predicted: Archetype | null
  confidence: number | null
  signals: string[]
  correct: boolean
  error: string | null
}

export type EvalSummary = {
  total: number
  evaluated: number
  errors: number
  correct: number
  accuracy: number
  perArchetype: Record<
    Archetype,
    { support: number; correct: number; precision: number; recall: number; f1: number }
  >
  confusion: Record<string, Record<string, number>>
  calibration: Array<{
    bucket: string
    range: [number, number]
    n: number
    accuracy: number
  }>
}

export type EvalRun = {
  ranAt: string
  summary: EvalSummary
  results: CaseResult[]
}

export async function loadBank(): Promise<BankCase[]> {
  const raw = await fs.readFile(BANK_PATH, 'utf8')
  const cases: BankCase[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const parsed = JSON.parse(trimmed) as BankCase
    if (!ARCHETYPES.includes(parsed.expected)) {
      throw new Error(
        `Bank case ${parsed.id} has invalid expected archetype: ${parsed.expected}`,
      )
    }
    cases.push(parsed)
  }
  return cases
}

// Runs the bank against the live classifier in batches so we don't spam
// rate limits. Each case can fail independently — we record the error
// and keep going.
export async function runEval({
  concurrency = 8,
  onProgress,
}: {
  concurrency?: number
  onProgress?: (done: number, total: number) => void
} = {}): Promise<EvalRun> {
  const cases = await loadBank()
  const results: CaseResult[] = []
  let done = 0

  const queue = cases.slice()
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift()
      if (!c) return
      let predicted: Archetype | null = null
      let confidence: number | null = null
      let signals: string[] = []
      let error: string | null = null
      try {
        const r: ClassifyResult = await classifyArchetype(c.title, c.description)
        predicted = r.archetype
        confidence = r.confidence
        signals = r.signals
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
      }
      results.push({
        ...c,
        predicted,
        confidence,
        signals,
        correct: predicted === c.expected,
        error,
      })
      done += 1
      onProgress?.(done, cases.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length) }, () => worker()),
  )

  // Restore original order so reports are stable.
  const orderById = new Map(cases.map((c, i) => [c.id, i]))
  results.sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0),
  )

  return {
    ranAt: new Date().toISOString(),
    summary: summarize(results),
    results,
  }
}

function summarize(results: CaseResult[]): EvalSummary {
  const total = results.length
  const evaluated = results.filter((r) => r.error === null).length
  const errors = total - evaluated
  const correct = results.filter((r) => r.correct).length

  // Per-archetype precision/recall: built from confusion counts.
  const perArchetype = {} as EvalSummary['perArchetype']
  const confusion: EvalSummary['confusion'] = {}
  for (const a of ARCHETYPES) {
    perArchetype[a] = { support: 0, correct: 0, precision: 0, recall: 0, f1: 0 }
    confusion[a] = {}
    for (const b of ARCHETYPES) confusion[a][b] = 0
  }

  for (const r of results) {
    if (r.error !== null || r.predicted === null) continue
    confusion[r.expected][r.predicted] += 1
    perArchetype[r.expected].support += 1
    if (r.correct) perArchetype[r.expected].correct += 1
  }

  for (const a of ARCHETYPES) {
    const tp = confusion[a][a] ?? 0
    let fp = 0
    let fn = 0
    for (const b of ARCHETYPES) {
      if (b === a) continue
      fp += confusion[b][a] ?? 0
      fn += confusion[a][b] ?? 0
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    perArchetype[a].precision = precision
    perArchetype[a].recall = recall
    perArchetype[a].f1 = f1
  }

  // Calibration: bucket by confidence and report accuracy in each bucket.
  // High confidence should correlate with high accuracy.
  const buckets: Array<{ label: string; range: [number, number] }> = [
    { label: '0.0–0.5', range: [0, 0.5] },
    { label: '0.5–0.7', range: [0.5, 0.7] },
    { label: '0.7–0.85', range: [0.7, 0.85] },
    { label: '0.85–1.0', range: [0.85, 1.0001] },
  ]
  const calibration = buckets.map((b) => {
    const inBucket = results.filter(
      (r) =>
        r.confidence !== null &&
        r.confidence >= b.range[0] &&
        r.confidence < b.range[1],
    )
    const acc =
      inBucket.length === 0
        ? 0
        : inBucket.filter((r) => r.correct).length / inBucket.length
    return { bucket: b.label, range: b.range, n: inBucket.length, accuracy: acc }
  })

  return {
    total,
    evaluated,
    errors,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    perArchetype,
    confusion,
    calibration,
  }
}

export async function loadLastRun(): Promise<EvalRun | null> {
  try {
    const raw = await fs.readFile(LAST_RUN_PATH, 'utf8')
    return JSON.parse(raw) as EvalRun
  } catch {
    return null
  }
}

export async function saveLastRun(run: EvalRun): Promise<void> {
  await fs.writeFile(LAST_RUN_PATH, JSON.stringify(run, null, 2) + '\n', 'utf8')
}

export type Diff = {
  newlyCorrect: CaseResult[]
  newlyWrong: CaseResult[]
  stillWrong: CaseResult[]
  flippedPrediction: Array<{
    id: string
    title: string
    before: Archetype | null
    after: Archetype | null
  }>
}

export function diffRuns(prev: EvalRun, next: EvalRun): Diff {
  const prevById = new Map(prev.results.map((r) => [r.id, r]))
  const newlyCorrect: CaseResult[] = []
  const newlyWrong: CaseResult[] = []
  const stillWrong: CaseResult[] = []
  const flippedPrediction: Diff['flippedPrediction'] = []

  for (const r of next.results) {
    const before = prevById.get(r.id)
    if (!before) continue
    if (!before.correct && r.correct) newlyCorrect.push(r)
    else if (before.correct && !r.correct) newlyWrong.push(r)
    else if (!before.correct && !r.correct) stillWrong.push(r)
    if (before.predicted !== r.predicted) {
      flippedPrediction.push({
        id: r.id,
        title: r.title,
        before: before.predicted,
        after: r.predicted,
      })
    }
  }

  return { newlyCorrect, newlyWrong, stillWrong, flippedPrediction }
}

// Renders a human-readable summary to the console. Kept here (not in the
// CLI) so it can be reused by other reporters or tests if needed.
export function formatReport(run: EvalRun, diff: Diff | null): string {
  const { summary } = run
  const lines: string[] = []
  lines.push('')
  lines.push(`Archetype classifier eval — ${run.ranAt}`)
  lines.push('─'.repeat(60))
  lines.push(
    `Cases: ${summary.total}   evaluated: ${summary.evaluated}   errors: ${summary.errors}`,
  )
  lines.push(
    `Accuracy: ${(summary.accuracy * 100).toFixed(1)}% (${summary.correct}/${summary.total})`,
  )
  lines.push('')
  lines.push('Per-archetype:')
  lines.push(
    `  ${'archetype'.padEnd(20)} ${'sup'.padStart(4)} ${'P'.padStart(6)} ${'R'.padStart(6)} ${'F1'.padStart(6)}`,
  )
  for (const a of ARCHETYPES) {
    const m = summary.perArchetype[a]
    if (m.support === 0 && a !== 'other') continue
    lines.push(
      `  ${a.padEnd(20)} ${String(m.support).padStart(4)} ${m.precision.toFixed(2).padStart(6)} ${m.recall.toFixed(2).padStart(6)} ${m.f1.toFixed(2).padStart(6)}`,
    )
  }
  lines.push('')
  lines.push('Confidence calibration:')
  for (const b of summary.calibration) {
    lines.push(
      `  ${b.bucket.padEnd(10)} n=${String(b.n).padStart(3)}   acc=${(b.accuracy * 100).toFixed(0)}%`,
    )
  }
  lines.push('')
  lines.push('Misclassified:')
  const wrong = run.results.filter((r) => !r.correct && r.error === null)
  if (wrong.length === 0) {
    lines.push('  (none)')
  } else {
    for (const r of wrong) {
      lines.push(
        `  [${r.id}] expected=${r.expected} predicted=${r.predicted} conf=${r.confidence?.toFixed(2) ?? '-'}`,
      )
      lines.push(`         "${r.title}"`)
    }
  }
  const errored = run.results.filter((r) => r.error !== null)
  if (errored.length > 0) {
    lines.push('')
    lines.push('Errored cases:')
    for (const r of errored) {
      lines.push(`  [${r.id}] ${r.error}`)
    }
  }
  if (diff) {
    lines.push('')
    lines.push('Diff vs. previous run:')
    lines.push(`  newly correct: ${diff.newlyCorrect.length}`)
    for (const r of diff.newlyCorrect) {
      lines.push(`    [${r.id}] now ${r.predicted}: "${r.title}"`)
    }
    lines.push(`  newly wrong:   ${diff.newlyWrong.length}`)
    for (const r of diff.newlyWrong) {
      lines.push(
        `    [${r.id}] expected ${r.expected}, got ${r.predicted}: "${r.title}"`,
      )
    }
    lines.push(`  flipped:       ${diff.flippedPrediction.length}`)
  }
  lines.push('')
  return lines.join('\n')
}
