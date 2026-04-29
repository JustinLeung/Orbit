import { describe, it, expect } from 'vitest'
import { computeAnswer } from './dynamicQuestionAnswer'
import type { DynamicAssistQuestion } from '@/lib/assistTypes'

const choice: DynamicAssistQuestion = {
  id: 'q1',
  kind: 'choice',
  prompt: 'How big?',
  options: ['small', 'medium', 'large'],
  allow_other: true,
  placeholder: null,
}
const multi: DynamicAssistQuestion = {
  id: 'q2',
  kind: 'multi_select',
  prompt: 'Which of these?',
  options: ['A', 'B', 'C'],
  allow_other: true,
  placeholder: null,
}
const short: DynamicAssistQuestion = {
  id: 'q3',
  kind: 'short_text',
  prompt: 'When?',
  options: null,
  allow_other: null,
  placeholder: 'e.g. May 18',
}
const long: DynamicAssistQuestion = {
  id: 'q4',
  kind: 'long_text',
  prompt: 'Explain',
  options: null,
  allow_other: null,
  placeholder: null,
}

const empty = {
  choice: null,
  multi: new Set<string>(),
  text: '',
  other: '',
  otherSelected: false,
}

describe('computeAnswer', () => {
  it('choice: returns the picked option', () => {
    expect(computeAnswer(choice, { ...empty, choice: 'medium' })).toBe('medium')
  })

  it('choice + Other: returns the typed-in text, trimmed', () => {
    expect(
      computeAnswer(choice, {
        ...empty,
        otherSelected: true,
        other: '  weirdly tiny ',
      }),
    ).toBe('weirdly tiny')
  })

  it('multi_select: joins picks with ", " in selection order', () => {
    expect(
      computeAnswer(multi, { ...empty, multi: new Set(['A', 'C']) }),
    ).toBe('A, C')
  })

  it('multi_select + Other: appends the typed-in text', () => {
    expect(
      computeAnswer(multi, {
        ...empty,
        multi: new Set(['B']),
        otherSelected: true,
        other: 'D',
      }),
    ).toBe('B, D')
  })

  it('multi_select + Other with empty input: skips Other', () => {
    expect(
      computeAnswer(multi, {
        ...empty,
        multi: new Set(['B']),
        otherSelected: true,
        other: '   ',
      }),
    ).toBe('B')
  })

  it('short_text: returns the trimmed text', () => {
    expect(computeAnswer(short, { ...empty, text: '  May 18  ' })).toBe('May 18')
  })

  it('long_text: returns the trimmed text', () => {
    expect(computeAnswer(long, { ...empty, text: '  hello\nworld ' })).toBe(
      'hello\nworld',
    )
  })

  it('returns empty string when nothing is selected/typed', () => {
    expect(computeAnswer(choice, empty)).toBe('')
    expect(computeAnswer(multi, empty)).toBe('')
    expect(computeAnswer(short, empty)).toBe('')
  })
})
