import { describe, it, expect } from 'vitest'
import {
  checkLockInPreconditions,
  computeLockInUpdates,
} from './lockInPlan'
import type { AssistState } from '@/lib/assistTypes'

function shapeWithPhases(
  phases: Array<{
    id: string
    title: string
    category: AssistState['shape'] extends infer S
      ? S extends { phases: Array<infer P> }
        ? P extends { category: infer C }
          ? C
          : never
        : never
      : never
    action?: string | null
    status?:
      | 'not_started'
      | 'in_progress'
      | 'done'
      | 'blocked'
  }>,
): AssistState {
  return {
    phase: 'refine',
    shape: {
      goal: 'Goal',
      phases: phases.map((p) => ({
        id: p.id,
        title: p.title,
        description: null,
        category: p.category,
        status: p.status ?? 'not_started',
        action: p.action ?? null,
        action_details: null,
        definition_of_done: [],
      })),
      completion_criteria: [],
      inputs_needed: [],
      suggested_steps: [],
    },
    position: { current_phase_id: 'p1', blockers: [], notes: null },
    messages: [],
    next_question: null,
  }
}

describe('checkLockInPreconditions', () => {
  it('fails when goal is missing', () => {
    const state = shapeWithPhases([{ id: 'p1', title: 'Plan it', category: 'planning' }])
    expect(
      checkLockInPreconditions(
        { goal: null, definition_of_done: [{ item: 'Done', done: false }] },
        state,
      ),
    ).toEqual({ ok: false, reason: 'no_goal' })
  })

  it('fails when phases are missing', () => {
    expect(
      checkLockInPreconditions(
        { goal: 'g', definition_of_done: [{ item: 'Done', done: false }] },
        null,
      ),
    ).toEqual({ ok: false, reason: 'no_phases' })
  })

  it('fails when ticket DoD is empty', () => {
    const state = shapeWithPhases([{ id: 'p1', title: 'x', category: 'planning' }])
    expect(
      checkLockInPreconditions(
        { goal: 'g', definition_of_done: [] },
        state,
      ),
    ).toEqual({ ok: false, reason: 'no_dod_item' })
  })

  it('passes when all three preconditions are met', () => {
    const state = shapeWithPhases([{ id: 'p1', title: 'x', category: 'planning' }])
    expect(
      checkLockInPreconditions(
        { goal: 'g', definition_of_done: [{ item: 'Done', done: false }] },
        state,
      ),
    ).toEqual({ ok: true })
  })
})

describe('computeLockInUpdates', () => {
  it('promotes phase actions into ticket DoD without duplicating existing items', () => {
    const state = shapeWithPhases([
      { id: 'p1', title: 'Plan', category: 'planning', action: 'Sketch the plan' },
      { id: 'p2', title: 'Book', category: 'doing', action: 'Book the venue' },
      { id: 'p3', title: 'Send', category: 'doing', action: 'Send invites' },
    ])
    const result = computeLockInUpdates(
      {
        goal: 'g',
        // case-insensitive match on the second phase action — should
        // NOT be re-added.
        definition_of_done: [{ item: 'book the venue', done: false }],
      },
      state,
    )
    expect(result).not.toBeNull()
    expect(result!.added_dod_items).toEqual(['Sketch the plan', 'Send invites'])
    expect(result!.next_dod.map((d) => d.item)).toEqual([
      'book the venue',
      'Sketch the plan',
      'Send invites',
    ])
  })

  it('skips empty/whitespace phase actions', () => {
    const state = shapeWithPhases([
      { id: 'p1', title: 'Plan', category: 'planning', action: 'Sketch' },
      { id: 'p2', title: 'Mystery', category: 'doing', action: '   ' },
      { id: 'p3', title: 'Done', category: 'closing', action: null },
    ])
    const result = computeLockInUpdates(
      { goal: 'g', definition_of_done: [] },
      state,
    )
    expect(result!.added_dod_items).toEqual(['Sketch'])
  })

  it('flips current planning phase to done and advances to next phase', () => {
    const state = shapeWithPhases([
      { id: 'p1', title: 'Plan', category: 'planning', action: 'Sketch' },
      { id: 'p2', title: 'Book', category: 'doing', action: 'Book' },
      { id: 'p3', title: 'Send', category: 'doing', action: 'Send' },
    ])
    const result = computeLockInUpdates(
      { goal: 'g', definition_of_done: [] },
      state,
    )
    expect(result!.next_shape.phases[0].status).toBe('done')
    expect(result!.next_shape.phases[1].status).toBe('in_progress')
    expect(result!.next_shape.phases[2].status).toBe('not_started')
    expect(result!.next_position?.current_phase_id).toBe('p2')
  })

  it('keeps current_phase_id when there is no next phase', () => {
    const state = shapeWithPhases([
      { id: 'p1', title: 'Just plan', category: 'planning', action: 'Sketch' },
    ])
    const result = computeLockInUpdates(
      { goal: 'g', definition_of_done: [] },
      state,
    )
    expect(result!.next_shape.phases[0].status).toBe('done')
    expect(result!.next_position?.current_phase_id).toBe('p1')
  })

  it('returns null when shape is missing', () => {
    const state: AssistState = {
      phase: 'refine',
      shape: null,
      position: null,
      messages: [],
      next_question: null,
    }
    expect(
      computeLockInUpdates({ goal: 'g', definition_of_done: [] }, state),
    ).toBeNull()
  })
})
