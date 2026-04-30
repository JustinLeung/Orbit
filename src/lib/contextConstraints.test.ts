import { describe, it, expect } from 'vitest'
import {
  applyConstraints,
  extractConstraints,
  EMPTY_CONSTRAINTS,
} from './contextConstraints'

describe('extractConstraints', () => {
  it('returns empty when context is null/empty', () => {
    expect(extractConstraints(null)).toEqual(EMPTY_CONSTRAINTS)
    expect(extractConstraints('')).toEqual(EMPTY_CONSTRAINTS)
    expect(extractConstraints('  free notes only  ')).toEqual(EMPTY_CONSTRAINTS)
  })

  it('parses every field from the marker block', () => {
    const ctx = `Some prior notes.

<!-- orbit:constraints -->
Budget: $500
Deadline: 2026-05-20
People: 8 guests
Effort: M
<!-- /orbit:constraints -->`
    expect(extractConstraints(ctx)).toEqual({
      budget: '$500',
      deadline: '2026-05-20',
      people: '8 guests',
      effort: 'M',
    })
  })

  it('drops invalid effort values', () => {
    const ctx = `<!-- orbit:constraints -->
Effort: HUGE
<!-- /orbit:constraints -->`
    expect(extractConstraints(ctx).effort).toBe(null)
  })

  it('ignores unknown keys and skips blank values', () => {
    const ctx = `<!-- orbit:constraints -->
Budget:
Color: red
People: 4
<!-- /orbit:constraints -->`
    expect(extractConstraints(ctx)).toEqual({
      budget: null,
      deadline: null,
      people: '4',
      effort: null,
    })
  })
})

describe('applyConstraints', () => {
  it('appends a new block when no block exists yet', () => {
    const next = applyConstraints('Existing free-form notes.', {
      budget: '$500',
      deadline: null,
      people: null,
      effort: 'M',
    })
    expect(next).toMatch(/Existing free-form notes\./)
    expect(next).toMatch(/<!-- orbit:constraints -->/)
    expect(next).toMatch(/Budget: \$500/)
    expect(next).toMatch(/Effort: M/)
    expect(next).not.toMatch(/Deadline:/)
    expect(next).not.toMatch(/People:/)
  })

  it('replaces an existing block in place', () => {
    const original = `Notes here.

<!-- orbit:constraints -->
Budget: $200
Effort: S
<!-- /orbit:constraints -->`
    const next = applyConstraints(original, {
      budget: '$500',
      deadline: '2026-05-20',
      people: null,
      effort: 'L',
    })
    expect(next).toMatch(/Notes here\./)
    // Only one constraints block should remain.
    const matches = next!.match(/orbit:constraints -->/g) ?? []
    expect(matches).toHaveLength(2)
    expect(next).toMatch(/Budget: \$500/)
    expect(next).toMatch(/Deadline: 2026-05-20/)
    expect(next).toMatch(/Effort: L/)
    expect(next).not.toMatch(/Effort: S/)
  })

  it('removes the block entirely when every field is null', () => {
    const original = `Notes here.

<!-- orbit:constraints -->
Budget: $200
<!-- /orbit:constraints -->`
    const next = applyConstraints(original, EMPTY_CONSTRAINTS)
    expect(next).toBe('Notes here.')
  })

  it('returns null when context becomes empty after clearing', () => {
    const original = `<!-- orbit:constraints -->
Budget: $200
<!-- /orbit:constraints -->`
    expect(applyConstraints(original, EMPTY_CONSTRAINTS)).toBeNull()
  })

  it('round-trips: extract → apply produces an equivalent block', () => {
    const initial = applyConstraints(null, {
      budget: '$1000',
      deadline: '2026-12-25',
      people: '6',
      effort: 'XL',
    })
    expect(extractConstraints(initial)).toEqual({
      budget: '$1000',
      deadline: '2026-12-25',
      people: '6',
      effort: 'XL',
    })
  })
})
