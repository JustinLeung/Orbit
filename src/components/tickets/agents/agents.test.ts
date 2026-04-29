import { describe, it, expect } from 'vitest'
import { PHASE_CATEGORIES } from '@/lib/assistTypes'
import { DEFAULT_AGENT, PHASE_AGENTS, resolveAgent } from './index'
import { PlanningAgent } from './PlanningAgent'

describe('PHASE_AGENTS dispatcher', () => {
  it('returns PlanningAgent for the planning category', () => {
    expect(resolveAgent('planning')).toBe(PlanningAgent)
  })

  it('falls back to DEFAULT_AGENT for every category without a bespoke entry', () => {
    for (const cat of PHASE_CATEGORIES) {
      if (PHASE_AGENTS[cat]) continue
      expect(resolveAgent(cat)).toBe(DEFAULT_AGENT)
    }
  })

  it('every PhaseCategory resolves to a non-null component', () => {
    for (const cat of PHASE_CATEGORIES) {
      const A = resolveAgent(cat)
      expect(A).toBeDefined()
      expect(typeof A).toBe('function')
    }
  })
})
