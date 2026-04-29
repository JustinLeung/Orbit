import { describe, it, expect } from 'vitest'
import { PHASE_CATEGORIES } from '@/lib/assistTypes'
import { ASSIST_QUESTIONS, formatStructuredAnswers } from './assistQuestions'

describe('assistQuestions', () => {
  it('has a 2-4 question set for every PhaseCategory', () => {
    for (const cat of PHASE_CATEGORIES) {
      const qs = ASSIST_QUESTIONS[cat]
      expect(qs).toBeDefined()
      expect(qs.length).toBeGreaterThanOrEqual(2)
      expect(qs.length).toBeLessThanOrEqual(4)
    }
  })

  it('every question has a non-empty id, label, and placeholder', () => {
    for (const cat of PHASE_CATEGORIES) {
      for (const q of ASSIST_QUESTIONS[cat]) {
        expect(q.id.trim().length).toBeGreaterThan(0)
        expect(q.label.trim().length).toBeGreaterThan(0)
        expect(q.placeholder.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('question ids are unique within each category', () => {
    for (const cat of PHASE_CATEGORIES) {
      const ids = ASSIST_QUESTIONS[cat].map((q) => q.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  // Lock the contract that the user_message sent to the model is structured
  // as labelled Q/A pairs the playbook can lean on. If this breaks, the
  // server-side playbook prompts will need to be re-validated.
  it('formatStructuredAnswers renders labelled Q/A pairs and skips empty answers', () => {
    const out = formatStructuredAnswers('research', 'Look up venues', {
      question: 'What are options near Pelican Hill?',
      tried: '',
      good_enough: 'Three solid candidates with prices',
    })
    expect(out).toContain('"Look up venues"')
    expect(out).toContain('research')
    expect(out).toContain('Q: What are you trying to find out?')
    expect(out).toContain('A: What are options near Pelican Hill?')
    expect(out).toContain('Q: What would "good enough to move on" look like?')
    expect(out).toContain('A: Three solid candidates with prices')
    expect(out).not.toContain('A: \n')
  })
})
