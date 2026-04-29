import type { PhaseCategory } from '@/lib/assistTypes'

export type AssistQuestion = {
  id: string
  label: string
  placeholder: string
  multiline?: boolean
}

// Static catalog of structured prompts per phase category. The user picks
// their current phase from the AI-generated shape; the phase's `category`
// drives which prompts they see, so the assistant gets focused context
// instead of an open chat.
//
// Keep each set to 2–4 questions — anything more becomes a wall of inputs.
// First question is always the "what's the situation right now" anchor.
export const ASSIST_QUESTIONS: Record<PhaseCategory, AssistQuestion[]> = {
  planning: [
    {
      id: 'scope',
      label: "What's the scope you're trying to nail down?",
      placeholder: 'e.g. picking a venue size and budget range',
      multiline: true,
    },
    {
      id: 'options',
      label: 'What options or approaches are you weighing?',
      placeholder: 'List the rough alternatives, even if half-formed',
      multiline: true,
    },
    {
      id: 'constraints',
      label: 'Any hard constraints (deadline, cost, people)?',
      placeholder: 'e.g. must be done by May 15, budget under $500',
    },
  ],
  research: [
    {
      id: 'question',
      label: 'What are you trying to find out?',
      placeholder: 'The core question, in one sentence',
      multiline: true,
    },
    {
      id: 'tried',
      label: "What have you already looked at or ruled out?",
      placeholder: 'Saves the assistant from suggesting dead ends',
      multiline: true,
    },
    {
      id: 'good_enough',
      label: 'What would "good enough to move on" look like?',
      placeholder: 'e.g. three solid candidates with prices',
    },
  ],
  doing: [
    {
      id: 'progress',
      label: "What's done and what's left?",
      placeholder: 'Be concrete — the assistant will turn this into next steps',
      multiline: true,
    },
    {
      id: 'stuck',
      label: 'Anywhere you feel stuck or unsure?',
      placeholder: "It's fine to say 'nothing'",
      multiline: true,
    },
    {
      id: 'deadline',
      label: 'When does this need to be wrapped?',
      placeholder: 'e.g. by end of week, or no firm deadline',
    },
  ],
  waiting: [
    {
      id: 'who',
      label: "Who or what are you waiting on?",
      placeholder: 'e.g. Sam to send the contract, the venue to confirm',
    },
    {
      id: 'asked',
      label: 'When did you last nudge them, and how?',
      placeholder: 'e.g. emailed Tuesday, no reply yet',
      multiline: true,
    },
    {
      id: 'fallback',
      label: 'What do you do if they keep not responding?',
      placeholder: 'A backup plan or escalation path',
      multiline: true,
    },
  ],
  deciding: [
    {
      id: 'options',
      label: 'What are the live options on the table?',
      placeholder: 'List them — even rough sketches help',
      multiline: true,
    },
    {
      id: 'criteria',
      label: 'What are you optimizing for?',
      placeholder: 'e.g. lowest risk, fastest to ship, best for the team',
      multiline: true,
    },
    {
      id: 'leaning',
      label: 'Which way are you currently leaning, and why?',
      placeholder: 'Even a weak prior helps frame the choice',
      multiline: true,
    },
  ],
  closing: [
    {
      id: 'remaining',
      label: 'What still needs to happen before this is closed?',
      placeholder: 'e.g. send the final email, file the receipt',
      multiline: true,
    },
    {
      id: 'confirm',
      label: 'Is anyone waiting on confirmation from you?',
      placeholder: 'e.g. Sam expects a reply, vendor needs sign-off',
    },
    {
      id: 'archive',
      label: 'Anything to capture before you stop thinking about this?',
      placeholder: 'Lessons, links, contacts worth keeping',
      multiline: true,
    },
  ],
}

// Format the user's structured answers into a single message the assistant
// can consume via the existing /api/assist/walkthrough `user_message` field.
// Keeping the contract free-form means no server change; the labelled prompts
// give the model enough scaffolding to produce a focused position+next-steps
// turn.
export function formatStructuredAnswers(
  category: PhaseCategory,
  phaseTitle: string,
  answers: Record<string, string>,
): string {
  const questions = ASSIST_QUESTIONS[category]
  const lines: string[] = [
    `I'm in the "${phaseTitle}" phase (${category}). Here's where I am:`,
  ]
  for (const q of questions) {
    const value = (answers[q.id] ?? '').trim()
    if (!value) continue
    lines.push('', `Q: ${q.label}`, `A: ${value}`)
  }
  return lines.join('\n')
}
