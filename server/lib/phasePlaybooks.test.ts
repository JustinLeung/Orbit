import { describe, it, expect } from 'vitest'
import { PHASE_CATEGORIES } from './assistTypes.js'
import { PHASE_PLAYBOOKS, formatPlaybookBlock } from './phasePlaybooks.js'

describe('phasePlaybooks', () => {
  it('has a playbook for every PhaseCategory', () => {
    for (const cat of PHASE_CATEGORIES) {
      expect(PHASE_PLAYBOOKS[cat]).toBeDefined()
    }
  })

  it('does not define playbooks for unknown categories', () => {
    const allowed = new Set<string>(PHASE_CATEGORIES)
    for (const key of Object.keys(PHASE_PLAYBOOKS)) {
      expect(allowed.has(key)).toBe(true)
    }
  })

  it('every playbook has non-empty completion, action_shape, and at least one specific_help', () => {
    for (const cat of PHASE_CATEGORIES) {
      const pb = PHASE_PLAYBOOKS[cat]
      expect(pb.completion.trim().length).toBeGreaterThan(0)
      expect(pb.action_shape.trim().length).toBeGreaterThan(0)
      expect(pb.specific_helps.length).toBeGreaterThan(0)
      for (const h of pb.specific_helps) {
        expect(h.trim().length).toBeGreaterThan(0)
      }
    }
  })

  // Lock the contract that the planning playbook still steers the model
  // toward a one-at-a-time MC interview. The interview hints live in the
  // shared INTERVIEW_HINTS block now (so doing/deciding/closing can opt
  // in too), but planning has interview: true so the rendered playbook
  // block must contain them.
  it('planning playbook is opted into the interview pattern', () => {
    expect(PHASE_PLAYBOOKS.planning.interview).toBe(true)
  })

  it('rendered planning playbook contains the shared interview hints', () => {
    const block = formatPlaybookBlock('planning', 'Plan it').toLowerCase()
    expect(block).toContain('next_question')
    expect(block).toContain('one question per turn')
    expect(block).toMatch(/choice/)
    expect(block).toMatch(/short_text/)
    expect(block).toContain('long_text')
    expect(block).toMatch(/never re-ask|already asked/i)
  })

  it('non-interview categories do NOT include the interview hints', () => {
    for (const cat of PHASE_CATEGORIES) {
      if (PHASE_PLAYBOOKS[cat].interview) continue
      const block = formatPlaybookBlock(cat, 'X').toLowerCase()
      expect(block).not.toContain('next_question')
      expect(block).not.toContain('one question per turn')
    }
  })

  it('formatPlaybookBlock renders the title, completion, action shape, and helps', () => {
    const block = formatPlaybookBlock('research', 'Look up venues')
    expect(block).toContain('Look up venues')
    expect(block).toContain('research')
    expect(block).toContain('Completion looks like')
    expect(block).toContain('Action shape')
    expect(block).toContain('Specific helps to offer')
    for (const h of PHASE_PLAYBOOKS.research.specific_helps) {
      expect(block).toContain(h)
    }
  })
})
