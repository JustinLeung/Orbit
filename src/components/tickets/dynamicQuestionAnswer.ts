import type { DynamicAssistQuestion } from '@/lib/assistTypes'

// Collapses the user's selection(s) into a single answer string the model
// can read. Lives in its own module (not the .tsx component file) so React
// Fast Refresh stays happy — component files should only export
// components.
export function computeAnswer(
  question: DynamicAssistQuestion,
  s: {
    choice: string | null
    multi: Set<string>
    text: string
    other: string
    otherSelected: boolean
  },
): string {
  if (question.kind === 'choice') {
    if (s.otherSelected) return s.other.trim()
    return s.choice ?? ''
  }
  if (question.kind === 'multi_select') {
    const picks = Array.from(s.multi)
    if (s.otherSelected && s.other.trim() !== '') picks.push(s.other.trim())
    return picks.join(', ')
  }
  return s.text.trim()
}
