import type { PhaseCategory } from './assistTypes.js'

// Per-category steer for the assistant during the `refine` phase. Each
// playbook says: what "this phase is complete" looks like, what specific
// kinds of help the assistant should offer to drive toward it, and the
// shape the refined `action` should take. Injected into the prompt only
// when the user is on a specific phase, so shape-phase prompts stay lean.
//
// `interview: true` opts the category into the one-at-a-time
// `next_question` interview pattern. The shared interview hints (asked-
// once, MC-preferred, etc.) get spliced in by `formatPlaybookBlock` —
// the playbook's `specific_helps` only needs to cover phase-specific
// guidance.
export type PhasePlaybook = {
  completion: string
  specific_helps: string[]
  action_shape: string
  interview?: boolean
}

// Shared hints for any category that opts into the interview pattern.
// Defined once so adding a new interview-style agent (e.g. doing's
// "stuck" mini-interview, deciding's tiebreaker, closing's DoD walk)
// doesn't require copy-pasting the dedup + MC-preference rules.
export const INTERVIEW_HINTS: string[] = [
  'INTERVIEW the user before refining: when key information is unclear, emit `next_question` (ONE question per turn) instead of refining the action.',
  "NEVER re-ask a question already in the conversation log or in the prompt's \"Questions already asked\" list. If you've already gotten an answer to it, move on to a different unknown — or stop asking and refine.",
  "Prefer kind: 'choice' with 2-5 options drawn from the ticket's specifics. Set allow_other: true when the list might miss something.",
  "Use kind: 'short_text' for names/dates/numbers. Use kind: 'long_text' ONLY when the answer truly cannot fit a list.",
  'Stop interviewing once you have enough to refine. Then update the phase action and any relevant ticket fields.',
]

export const PHASE_PLAYBOOKS: Record<PhaseCategory, PhasePlaybook> = {
  planning: {
    interview: true,
    completion:
      'The work has scope, constraints, and concrete next moves written down.',
    specific_helps: [
      'For planning specifically, choice options should reflect common scoping splits (e.g. for a birthday party: "dinner at home / restaurant / activity-based / surprise event").',
      'Once you have enough to write a concrete plan, propose a definition_of_done checklist that captures the scope and constraints, and refine the action.',
      'Surface unresolved scope/constraint unknowns the user could not answer as open_questions_to_add.',
      'When the plan is concrete enough to execute, set ready_to_advance: true.',
    ],
    action_shape:
      '"Break down …" or "Sketch the plan for …" — a planning verb with a concrete artifact.',
  },
  research: {
    completion:
      "Enough info gathered that the user has hit their own \"good enough to move on\" bar.",
    specific_helps: [
      'Capture sources the user mentions as references_to_add (link / snippet / email / attachment).',
      'Turn unresolved sub-questions into open_questions_to_add, phrased as questions.',
      "When the user signals their info bar is met, set ready_to_advance: true.",
    ],
    action_shape:
      '"Find X by/from Y" — names the thing being looked up and where to look.',
  },
  doing: {
    completion: 'The artifact or output exists.',
    specific_helps: [
      "Track definition_of_done progress: when the user mentions an item is done, output that item with done: true.",
      'Capture blockers the user surfaces as open_questions_to_add.',
      'If the user mentions a deadline, set next_action_at (ISO 8601, never invented).',
    ],
    action_shape:
      '"Draft the …" / "Write the …" / "Build the …" — a produce-verb with a concrete object.',
  },
  waiting: {
    completion:
      'The other side has responded, or the user has triggered their fallback plan.',
    specific_helps: [
      'Capture who/what is being waited on in context.',
      'If the user has a nudge date in mind, set next_action_at to that date.',
      "Suggest ticket type 'waiting' via ticket_updates if it isn't already.",
      'Record the fallback plan as a separate phase or as a note in position.notes.',
    ],
    action_shape:
      '"Nudge P via channel by date" or "Follow up with P about X" — names the person, the channel, and (when known) the deadline.',
  },
  deciding: {
    completion: 'A choice has been made and the rationale is captured.',
    specific_helps: [
      'Capture the live options + decision criteria as definition_of_done items ("evaluated against cost", "evaluated against speed").',
      "Record the user's current leaning in context or position.notes.",
      "Once a choice + rationale is articulated, set ready_to_advance: true.",
    ],
    action_shape:
      '"Pick between A and B by date" or "Decide whether to …" — names the options and (when known) the deadline.',
  },
  closing: {
    completion: 'All definition_of_done items are checked and nothing is left to capture.',
    specific_helps: [
      'Walk remaining definition_of_done items and propose flipping each to done: true when the user confirms.',
      "Surface anything worth archiving (lessons, links, contacts) as references_to_add.",
      "Suggest ticket status 'review' or 'closed' via ticket_updates when DoD is fully done.",
    ],
    action_shape:
      '"Send the recap …" / "File the receipt …" / "Mark X done" — a wrap-up verb with a concrete final artifact.',
  },
}

// Renders a playbook as a Markdown-ish block to splice into the prompt.
// When the playbook opts into the interview pattern, the shared
// INTERVIEW_HINTS are appended ahead of the category-specific helps so
// the model gets the dedup + MC-preference rules in every interview turn.
export function formatPlaybookBlock(
  category: PhaseCategory,
  phaseTitle: string,
): string {
  const pb = PHASE_PLAYBOOKS[category]
  const lines: string[] = [
    `Playbook for the current phase ("${phaseTitle}", category: ${category}):`,
    `- Completion looks like: ${pb.completion}`,
    `- Action shape: ${pb.action_shape}`,
    '- Specific helps to offer:',
  ]
  if (pb.interview) {
    for (const h of INTERVIEW_HINTS) lines.push(`  * ${h}`)
  }
  for (const h of pb.specific_helps) lines.push(`  * ${h}`)
  return lines.join('\n')
}
