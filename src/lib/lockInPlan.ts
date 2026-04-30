// Pure logic for the "Lock in the plan" gesture on the planning surface.
//
// Locking in is deliberately deterministic — no model call. The user
// has just walked through the planning interview, the shape is concrete
// enough, and now the planning phase needs to "graduate" into a
// committed plan. Two structural things happen:
//
//   1. Every phase's `action` (the imperative the user agreed to do for
//      that phase) gets promoted into the OVERALL ticket-level
//      `definition_of_done`, unless an item with the same text is
//      already there. Phase actions ARE the executable plan, so each
//      one is a verifiable signal that the loop has progressed.
//
//   2. The current planning phase flips to `done`, the next non-done
//      phase becomes `in_progress`, and `position.current_phase_id`
//      moves with it. If there's no next phase, current_phase_id
//      stays where it is — the lock-in is a no-op transition.
//
// Mirrored to server/lib/lockInPlan.ts so the live eval can import it
// without crossing the src/server tsconfig boundary.

import type {
  AssistState,
  Shape,
  ShapePhaseEntry,
} from './assistTypes'
import type { DefinitionOfDoneItem } from '@/types/orbit'

export type LockInPreCondition =
  | { ok: true }
  | { ok: false; reason: 'no_goal' | 'no_phases' | 'no_dod_item' }

// Mirrors the ticket fields lockInPlan needs to read. Kept narrow so the
// pure helper doesn't depend on the full Ticket type — the eval can
// pass a minimal stub.
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
  // The merged ticket-level DoD: existing items preserved, plus one
  // appended item per phase action that wasn't already present
  // (case-insensitive match on `item`). `done` flags on existing items
  // are preserved.
  next_dod: DefinitionOfDoneItem[]
  // Items that were ADDED by lock-in (subset of next_dod). Useful for
  // toast messaging and audit logging.
  added_dod_items: string[]
  // The shape with the planning phase flipped to done and the next
  // phase advanced to in_progress.
  next_shape: Shape
  // Position with current_phase_id moved to the next phase (or kept if
  // there's no next phase).
  next_position: AssistState['position']
}

// Pure: computes the post-lock-in state. Doesn't mutate inputs.
export function computeLockInUpdates(
  ticket: LockInTicketView,
  state: AssistState,
): LockInResult | null {
  if (!state.shape) return null
  const phases = state.shape.phases
  if (phases.length === 0) return null

  // ── DoD merge ──────────────────────────────────────────────────────
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

  // ── Phase advance ──────────────────────────────────────────────────
  const currentPhaseId = state.position?.current_phase_id ?? null
  const currentIdx = currentPhaseId
    ? phases.findIndex((p) => p.id === currentPhaseId)
    : -1
  // The phase we're "graduating" — the current planning phase if one is
  // picked, otherwise the first planning-category phase.
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
  // Next phase = first non-done phase after `lockedIdx`. Falls back to
  // any non-done phase if lockedIdx is -1.
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
