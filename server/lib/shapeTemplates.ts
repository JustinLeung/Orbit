import {
  PHASE_CATEGORIES,
  type Shape,
  type ShapePhaseEntry,
} from './assistTypes.js'
import type { Archetype } from './classifyArchetype.js'

// A template is a ready-to-serve Shape for a recognized archetype, plus
// a function to produce the warm assistant_message that introduces it.
// Templates are only defined for archetypes we want on the fast path —
// the rest fall through to the full model call.
export type ShapeTemplate = {
  archetype: Archetype
  buildShape: (title: string) => Shape
  buildOpener: (title: string) => string
}

function phase(
  id: string,
  title: string,
  description: string,
  category: ShapePhaseEntry['category'],
): ShapePhaseEntry {
  return {
    id,
    title,
    description,
    status: 'not_started',
    category,
  }
}

// ─── event_planning ────────────────────────────────────────────────────
const eventPlanning: ShapeTemplate = {
  archetype: 'event_planning',
  buildShape: (title) => ({
    goal: `${title.trim()} — a gathering that feels right for everyone involved.`,
    phases: [
      phase(
        'brainstorm',
        'Brainstorm & decide',
        'Figure out the kind of celebration this should be — vibe, scale, whether it needs a venue or stays at home.',
        'planning',
      ),
      phase(
        'logistics',
        'Logistics & invites',
        'Lock down the practical pieces — date, place, food, invitations, RSVPs.',
        'doing',
      ),
      phase(
        'execute',
        'Execute & celebrate',
        'The day itself — set up, host, and enjoy it.',
        'doing',
      ),
      phase(
        'follow_up',
        'Follow-up',
        'Thank-yous, photos, returns — close the loop on anything left over.',
        'closing',
      ),
    ],
    completion_criteria: [
      'The event happens on schedule.',
      'Guests (and the guest of honor) feel taken care of.',
      'No outstanding logistics owed afterward.',
    ],
    inputs_needed: [
      'Date and rough guest count',
      'Budget',
      'Venue or location',
      'Any preferences from the guest of honor',
    ],
  }),
  buildOpener: (title) =>
    `This sounds like a lovely thing to put together. Here's a starting shape for **${title.trim()}** — most events flow through these phases. Tell me what's specific to yours and we can refine it.`,
}

// ─── gift_purchase ─────────────────────────────────────────────────────
const giftPurchase: ShapeTemplate = {
  archetype: 'gift_purchase',
  buildShape: (title) => ({
    goal: `${title.trim()} — a gift that feels thoughtful and lands on time.`,
    phases: [
      phase(
        'clarify',
        'Clarify what they\'d love',
        'Pin down what the recipient is into right now, anything they\'ve mentioned wanting, budget, and the deadline.',
        'planning',
      ),
      phase(
        'research',
        'Research options',
        'Browse, compare, shortlist 2–3 candidates that fit the brief.',
        'research',
      ),
      phase(
        'decide',
        'Decide',
        'Pick the one. Trust your read of the recipient.',
        'deciding',
      ),
      phase(
        'order_deliver',
        'Order & deliver',
        'Buy it, arrange delivery or pickup, wrap it, and get it to them on time.',
        'doing',
      ),
    ],
    completion_criteria: [
      'The gift arrives on time and in good shape.',
      'The recipient feels seen by it.',
    ],
    inputs_needed: [
      'Who the gift is for',
      'Occasion and deadline',
      'Budget',
      'Anything they\'ve mentioned wanting',
    ],
  }),
  buildOpener: (title) =>
    `Gift hunts have a pretty consistent shape — here's a starting structure for **${title.trim()}**. Let me know who it's for and roughly when, and we'll narrow in.`,
}

// ─── trip_planning ─────────────────────────────────────────────────────
const tripPlanning: ShapeTemplate = {
  archetype: 'trip_planning',
  buildShape: (title) => ({
    goal: `${title.trim()} — a trip planned end-to-end so you can actually enjoy it.`,
    phases: [
      phase(
        'dates_destination',
        'Decide dates & destination',
        'Lock in when you\'re going and the broad shape of where.',
        'deciding',
      ),
      phase(
        'book',
        'Book transport & lodging',
        'Flights or trains, accommodation, anything with limited availability.',
        'doing',
      ),
      phase(
        'itinerary',
        'Build the itinerary',
        'Day-by-day plan: must-dos, reservations, breathing room.',
        'planning',
      ),
      phase(
        'pack_go',
        'Pack & go',
        'Pre-departure logistics — packing, holds on mail, pet care, currency, docs.',
        'doing',
      ),
      phase(
        'wrap_up',
        'Wrap-up',
        'Reimbursements, photos, anything to follow up on after you\'re back.',
        'closing',
      ),
    ],
    completion_criteria: [
      'You\'re booked, packed, and traveled without surprises.',
      'No loose ends after the trip ends.',
    ],
    inputs_needed: [
      'Dates (or a window)',
      'Destination',
      'Budget',
      'Who\'s going',
      'Anything that has to happen on this trip',
    ],
  }),
  buildOpener: (title) =>
    `Trip planning has a fairly predictable arc — here's a starting structure for **${title.trim()}**. Tell me roughly when and where and we'll fill in the details.`,
}

// ─── decision ──────────────────────────────────────────────────────────
const decision: ShapeTemplate = {
  archetype: 'decision',
  buildShape: (title) => ({
    goal: `${title.trim()} — a clear call you feel good about.`,
    phases: [
      phase(
        'frame',
        'Frame the decision',
        'Name the actual question, the realistic options, and the criteria that matter to you.',
        'planning',
      ),
      phase(
        'gather',
        'Gather info',
        'Talk to people who\'d know, look up the facts, fill the gaps in your picture.',
        'research',
      ),
      phase(
        'weigh',
        'Weigh options',
        'Pros, cons, second-order effects, gut check. Identify what would change your mind.',
        'deciding',
      ),
      phase(
        'decide',
        'Decide',
        'Make the call. Write down why, so future-you understands.',
        'deciding',
      ),
      phase(
        'communicate',
        'Communicate & act',
        'Tell the people who need to know, then actually take the first step.',
        'closing',
      ),
    ],
    completion_criteria: [
      'A decision is made and acted on.',
      'You can articulate why, in plain terms.',
      'Anyone affected has been told.',
    ],
    inputs_needed: [
      'The actual question being decided',
      'The realistic options',
      'What matters most to you here',
      'Any deadline',
    ],
  }),
  buildOpener: (title) =>
    `Decisions like this usually move through a similar arc. Here's a starting frame for **${title.trim()}** — happy to refine it once you tell me what's on the table.`,
}

// ─── hiring ────────────────────────────────────────────────────────────
const hiring: ShapeTemplate = {
  archetype: 'hiring',
  buildShape: (title) => ({
    goal: `${title.trim()} — a strong hire who fits the role and the team.`,
    phases: [
      phase(
        'define_role',
        'Define the role',
        'Sharpen the job description, must-haves vs. nice-to-haves, leveling, comp band.',
        'planning',
      ),
      phase(
        'source',
        'Source candidates',
        'Job posts, referrals, recruiter outreach — build the top of the funnel.',
        'doing',
      ),
      phase(
        'interview',
        'Interview',
        'Run the loop. Calibrate signal across interviewers.',
        'doing',
      ),
      phase(
        'decide',
        'Decide',
        'Debrief, weigh trade-offs, make a call.',
        'deciding',
      ),
      phase(
        'offer_onboard',
        'Offer & onboard',
        'Extend the offer, negotiate, close. Plan the first weeks.',
        'closing',
      ),
    ],
    completion_criteria: [
      'A candidate accepts and starts.',
      'They\'re ramping on a clear plan.',
    ],
    inputs_needed: [
      'Role definition and leveling',
      'Comp band',
      'Interview panel and rubric',
      'Sourcing channels',
    ],
  }),
  buildOpener: (title) =>
    `Hiring loops have a fairly standard arc — here's a starting structure for **${title.trim()}**. Tell me where you are (just defining the role? already interviewing?) and we'll narrow in.`,
}

// ─── research ──────────────────────────────────────────────────────────
const research: ShapeTemplate = {
  archetype: 'research',
  buildShape: (title) => ({
    goal: `${title.trim()} — enough understanding to act or explain.`,
    phases: [
      phase(
        'define_question',
        'Define the question',
        'Sharpen what you actually want to know — and why. Specific beats broad.',
        'planning',
      ),
      phase(
        'gather',
        'Gather sources',
        'Pull together docs, articles, conversations, primary data — whatever\'s relevant.',
        'research',
      ),
      phase(
        'synthesize',
        'Synthesize',
        'Boil it down — what\'s the picture across sources? Where do they agree, where do they conflict?',
        'planning',
      ),
      phase(
        'form_view',
        'Form a view',
        'Land on a position you can defend, with the caveats you know about.',
        'deciding',
      ),
      phase(
        'share_act',
        'Share or act',
        'Write it up, tell the people who need to know, or take the next concrete step.',
        'closing',
      ),
    ],
    completion_criteria: [
      'You can explain the answer in plain terms.',
      'You know what you still don\'t know.',
      'The output has been used or shared.',
    ],
    inputs_needed: [
      'The specific question',
      'Why you want to know',
      'How deep you need to go',
    ],
  }),
  buildOpener: (title) =>
    `Research arcs all have a similar shape — here's a starting structure for **${title.trim()}**. What's the actual question you're trying to answer?`,
}

// ─── bug_fix ───────────────────────────────────────────────────────────
const bugFix: ShapeTemplate = {
  archetype: 'bug_fix',
  buildShape: (title) => ({
    goal: `${title.trim()} — the thing works again, and stays working.`,
    phases: [
      phase(
        'reproduce',
        'Reproduce',
        'Get the broken behavior to happen reliably. Without that, you\'re guessing.',
        'research',
      ),
      phase(
        'diagnose',
        'Diagnose the cause',
        'Trace from the symptom back to the root. Don\'t stop at the first plausible suspect.',
        'research',
      ),
      phase(
        'fix',
        'Fix',
        'Apply the smallest change that addresses the actual cause.',
        'doing',
      ),
      phase(
        'verify',
        'Verify',
        'Confirm the fix holds — re-run the repro, check adjacent behavior didn\'t regress.',
        'closing',
      ),
      phase(
        'prevent',
        'Prevent recurrence',
        'Test, alert, doc, or design change so this exact thing doesn\'t come back.',
        'closing',
      ),
    ],
    completion_criteria: [
      'The reported symptom is gone.',
      'You understand why it broke.',
      'A safeguard exists against the same regression.',
    ],
    inputs_needed: [
      'A clear repro or reliable trigger',
      'Access to logs/state at the time of failure',
    ],
  }),
  buildOpener: (title) =>
    `Repair work tends to follow a predictable arc — here's a starting structure for **${title.trim()}**. Can you reproduce it on demand yet, or is it intermittent?`,
}

// ─── waiting_followup ──────────────────────────────────────────────────
const waitingFollowup: ShapeTemplate = {
  archetype: 'waiting_followup',
  buildShape: (title) => ({
    goal: `${title.trim()} — the response lands and you can move on to whatever it unblocks.`,
    phases: [
      phase(
        'confirm_owed',
        'Confirm what\'s owed',
        'Be precise about who owes what, by when, and how you\'ll know it arrived.',
        'planning',
      ),
      phase(
        'remind',
        'Send the reminder',
        'A clear, polite nudge with the ask and a deadline.',
        'doing',
      ),
      phase(
        'track',
        'Track the response',
        'Hold space for it without dropping. Plan the next nudge if it doesn\'t come.',
        'waiting',
      ),
      phase(
        'unblock',
        'Unblock the next step',
        'Once you have it (or decide to move without it), do the thing it was blocking.',
        'doing',
      ),
    ],
    completion_criteria: [
      'You have the response, or have routed around the missing one.',
      'The dependent work has resumed.',
    ],
    inputs_needed: [
      'Who you\'re waiting on',
      'What exactly they owe',
      'When you need it by',
      'What this is blocking',
    ],
  }),
  buildOpener: (title) =>
    `Waiting loops are mostly about precision and a calm cadence — here's a starting structure for **${title.trim()}**. Who's it on, and what's it blocking?`,
}

// ─── writing ───────────────────────────────────────────────────────────
const writing: ShapeTemplate = {
  archetype: 'writing',
  buildShape: (title) => ({
    goal: `${title.trim()} — a finished piece you're willing to share.`,
    phases: [
      phase(
        'outline',
        'Outline',
        'Audience, key claim, structure. Solid skeleton beats clever phrasing.',
        'planning',
      ),
      phase(
        'draft',
        'Draft',
        'Get all the words down. Rough is fine — coverage over polish.',
        'doing',
      ),
      phase(
        'revise',
        'Revise',
        'Cut, restructure, tighten the argument. This is where the work happens.',
        'doing',
      ),
      phase(
        'polish',
        'Polish',
        'Line edits, examples, transitions, formatting.',
        'doing',
      ),
      phase(
        'publish',
        'Publish',
        'Ship it where it needs to go.',
        'closing',
      ),
    ],
    completion_criteria: [
      'The piece is published or delivered.',
      'You\'d sign your name to it.',
    ],
    inputs_needed: [
      'Audience',
      'Length and format',
      'Deadline',
      'Where it\'ll live when published',
    ],
  }),
  buildOpener: (title) =>
    `Writing tends to go better with a clear arc — here's a starting structure for **${title.trim()}**. Who's the audience, and is there a deadline?`,
}

// ─── admin_paperwork ───────────────────────────────────────────────────
const adminPaperwork: ShapeTemplate = {
  archetype: 'admin_paperwork',
  buildShape: (title) => ({
    goal: `${title.trim()} — submitted, accepted, and off your plate.`,
    phases: [
      phase(
        'requirements',
        'Gather requirements',
        'Find the official source — what forms, what fees, what deadlines, what supporting docs.',
        'research',
      ),
      phase(
        'collect_docs',
        'Collect documents',
        'Pull together every supporting item you\'ll need to attach.',
        'doing',
      ),
      phase(
        'fill_out',
        'Fill out the forms',
        'Carefully. Re-read before submitting — small errors cost weeks.',
        'doing',
      ),
      phase(
        'submit',
        'Submit',
        'Send it through the right channel. Keep a copy of everything.',
        'doing',
      ),
      phase(
        'confirm',
        'Confirm receipt',
        'Track the confirmation. Note any expected processing time and the next milestone.',
        'closing',
      ),
    ],
    completion_criteria: [
      'The submission is confirmed received.',
      'You know what (if anything) you owe next.',
    ],
    inputs_needed: [
      'The official requirements/checklist',
      'Deadlines',
      'Supporting documents',
      'Fees and how to pay them',
    ],
  }),
  buildOpener: (title) =>
    `Admin loops are mostly about not missing pieces — here's a starting structure for **${title.trim()}**. Do you have the official checklist of what they need?`,
}

// ─── relationship ──────────────────────────────────────────────────────
const relationship: ShapeTemplate = {
  archetype: 'relationship',
  buildShape: (title) => ({
    goal: `${title.trim()} — the connection feels alive, with a sustainable rhythm.`,
    phases: [
      phase(
        'reason_cadence',
        'Reason & cadence',
        'Why now, and what kind of contact fits — coffee, call, text, longer note?',
        'planning',
      ),
      phase(
        'reach_out',
        'Reach out',
        'Send the message or make the ask. Keep it warm and easy to say yes to.',
        'doing',
      ),
      phase(
        'follow_through',
        'Follow through',
        'Show up well — the thing you reached out for, with care.',
        'doing',
      ),
      phase(
        'next_touchpoint',
        'Schedule the next touchpoint',
        'Don\'t leave it open-ended. A loose plan to reconnect keeps the relationship from drifting.',
        'closing',
      ),
    ],
    completion_criteria: [
      'You\'ve reconnected meaningfully.',
      'There\'s a loose plan for the next touchpoint.',
    ],
    inputs_needed: [
      'Who the person is and what they\'re into',
      'What feels like the right kind of contact',
      'Your honest capacity for cadence',
    ],
  }),
  buildOpener: (title) =>
    `Relationship loops thrive on small, consistent touches — here's a starting structure for **${title.trim()}**. What's the right kind of contact for this one?`,
}

const TEMPLATES: Partial<Record<Archetype, ShapeTemplate>> = {
  event_planning: eventPlanning,
  gift_purchase: giftPurchase,
  trip_planning: tripPlanning,
  decision,
  hiring,
  research,
  bug_fix: bugFix,
  waiting_followup: waitingFollowup,
  writing,
  admin_paperwork: adminPaperwork,
  relationship,
}

export function getTemplate(archetype: Archetype): ShapeTemplate | null {
  return TEMPLATES[archetype] ?? null
}

export function listTemplatedArchetypes(): Archetype[] {
  return Object.keys(TEMPLATES) as Archetype[]
}
