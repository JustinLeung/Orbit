// Mirror of src/lib/lockInPlan.ts — see that file for the why. Kept
// duplicated so live evals (server/routes/*.evals.test.ts) can import
// the pure helper without crossing the src/server tsconfig boundary.

import type {
  AssistState,
  Shape,
  ShapePhaseEntry,
} from './assistTypes.js'

// Mirrors src/types/orbit.DefinitionOfDoneItem. Inlined here so the
// server tree doesn't need a path alias.
export type DefinitionOfDoneItem = { item: string; done: boolean }

export type LockInPreCondition =
  | { ok: true }
  | { ok: false; reason: 'no_goal' | 'no_phases' | 'no_dod_item' }

export type LockInTicketView = {
  goal: string | null
  definition_of_done: DefinitionOfDoneItem[] | null
}

export function checkLockInPreconditions(
  ticket: LockInTicketView,
  state: AssistState | null,
): LockInPreCondition {
  if (!ticket.goal || ticket.goal.trim() === '') {
    return { ok: false, reason: 'no_goal' }
  }
  const phases = state?.shape?.phases ?? []
  if (phases.length < 1) {
    return { ok: false, reason: 'no_phases' }
  }
  const dod = ticket.definition_of_done ?? []
  if (dod.length < 1) {
    return { ok: false, reason: 'no_dod_item' }
  }
  return { ok: true }
}

export type LockInResult = {
  next_dod: DefinitionOfDoneItem[]
  added_dod_items: string[]
  next_shape: Shape
  next_position: AssistState['position']
}

export function computeLockInUpdates(
  ticket: LockInTicketView,
  state: AssistState,
): LockInResult | null {
  if (!state.shape) return null
  const phases = state.shape.phases
  if (phases.length === 0) return null

  const existing = ticket.definition_of_done ?? []
  const seen = new Set(existing.map((d) => d.item.trim().toLowerCase()))
  const added: string[] = []
  const next_dod: DefinitionOfDoneItem[] = existing.map((d) => ({ ...d }))
  for (const p of phases) {
    const action = p.action?.trim()
    if (!action) continue
    const key = action.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next_dod.push({ item: action, done: false })
    added.push(action)
  }

  const currentPhaseId = state.position?.current_phase_id ?? null
  const currentIdx = currentPhaseId
    ? phases.findIndex((p) => p.id === currentPhaseId)
    : -1
  const lockedIdx =
    currentIdx >= 0
      ? currentIdx
      : phases.findIndex((p) => p.category === 'planning')
  const flippedPhases: ShapePhaseEntry[] = phases.map((p, i) => {
    if (lockedIdx >= 0 && i === lockedIdx) {
      return { ...p, status: 'done' }
    }
    return p
  })
  const startSearch = lockedIdx >= 0 ? lockedIdx + 1 : 0
  let nextIdx = -1
  for (let i = startSearch; i < flippedPhases.length; i += 1) {
    if (flippedPhases[i].status !== 'done') {
      nextIdx = i
      break
    }
  }
  if (nextIdx >= 0) {
    flippedPhases[nextIdx] = {
      ...flippedPhases[nextIdx],
      status: 'in_progress',
    }
  }
  const next_shape: Shape = { ...state.shape, phases: flippedPhases }
  const nextCurrentId =
    nextIdx >= 0 ? flippedPhases[nextIdx].id : currentPhaseId
  const next_position: AssistState['position'] = {
    current_phase_id: nextCurrentId,
    blockers: state.position?.blockers ?? [],
    notes: state.position?.notes ?? null,
  }
  return { next_dod, added_dod_items: added, next_shape, next_position }
}
