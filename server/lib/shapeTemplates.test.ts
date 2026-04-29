import { describe, it, expect } from 'vitest'
import { PHASE_CATEGORIES } from './assistTypes.js'
import {
  getTemplate,
  listTemplatedArchetypes,
} from './shapeTemplates.js'
import { ARCHETYPES } from './classifyArchetype.js'

describe('shapeTemplates', () => {
  it('exposes templates for every archetype except "other"', () => {
    expect(listTemplatedArchetypes().sort()).toEqual(
      [
        'admin_paperwork',
        'bug_fix',
        'decision',
        'event_planning',
        'gift_purchase',
        'hiring',
        'relationship',
        'research',
        'trip_planning',
        'waiting_followup',
        'writing',
      ].sort(),
    )
  })

  it('returns null for "other"', () => {
    expect(getTemplate('other')).toBeNull()
  })

  for (const archetype of ARCHETYPES) {
    const tpl = getTemplate(archetype)
    if (!tpl) continue

    describe(`${archetype} template`, () => {
      const sampleTitle = 'Plan something specific for someone'
      const shape = tpl.buildShape(sampleTitle)

      it('produces a non-empty goal', () => {
        expect(shape.goal).toBeTruthy()
        expect(shape.goal).toContain(sampleTitle)
      })

      it('has 3-5 phases', () => {
        expect(shape.phases.length).toBeGreaterThanOrEqual(3)
        expect(shape.phases.length).toBeLessThanOrEqual(5)
      })

      it('has unique phase ids', () => {
        const ids = shape.phases.map((p) => p.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('every phase has a valid category and starts not_started', () => {
        for (const p of shape.phases) {
          expect(PHASE_CATEGORIES).toContain(p.category)
          expect(p.status).toBe('not_started')
          expect(p.title).toBeTruthy()
          expect(p.description).toBeTruthy()
        }
      })

      it('has at least 2 completion criteria and 2 inputs needed', () => {
        expect(shape.completion_criteria.length).toBeGreaterThanOrEqual(2)
        expect(shape.inputs_needed.length).toBeGreaterThanOrEqual(2)
        for (const c of shape.completion_criteria) expect(c).toBeTruthy()
        for (const i of shape.inputs_needed) expect(i).toBeTruthy()
      })

      it('opener is a non-empty string that mentions the title', () => {
        const opener = tpl.buildOpener(sampleTitle)
        expect(typeof opener).toBe('string')
        expect(opener.length).toBeGreaterThan(20)
        expect(opener).toContain(sampleTitle)
      })
    })
  }
})
