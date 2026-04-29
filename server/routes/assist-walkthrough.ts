import { Router } from 'express'
import { Type } from '@google/genai'
import { getGemini, GEMINI_MODEL } from '../lib/gemini.js'
import {
  classifyArchetype,
  ARCHETYPE_TICKET_TYPE,
  type ClassifyResult,
} from '../lib/classifyArchetype.js'
import { getTemplate } from '../lib/shapeTemplates.js'
import type {
  AssistPhase,
  AssistQuestionKind,
  AssistState,
  DynamicAssistQuestion,
  PhaseCategory,
  Shape,
  SuggestedStep,
  SuggestedStepPosition,
  TicketSnapshot,
} from '../lib/assistTypes.js'
import { formatPlaybookBlock } from '../lib/phasePlaybooks.js'

// Above this confidence, a templated archetype short-circuits the main
// model call and serves a canned shape. Below it, we fall through to
// the model but pass the classifier verdict as a soft hint.
const TEMPLATE_CONFIDENCE_THRESHOLD = 0.75

const router = Router()

const SYSTEM_INSTRUCTION = `You are Orbit's personal assistant, helping the user think through an "open loop" (a task, follow-up, decision, research item, or relationship to tend to).

The walkthrough has TWO active phases the user moves between:

1. **shape** — Look at the ticket and propose the WHOLE arc as a structured shape. The shape has:
    * goal — one sentence on what done looks like
    * phases — the natural arc of the work, in order. **First decide if this is single-step or multi-step**, and BIAS TOWARD FEWER PHASES:
        - **Single-step**: one concrete action the user does in one sitting. Examples: "Call mom", "Take out the trash", "Book a flight to NYC for Friday", "Change the lightbulb in the hallway", "Reply to Sam's email". For these emit EXACTLY 1 phase. Don't decompose — the user already knows what to do; they just want it tracked.
        - **Multi-step**: tasks that genuinely have distinct sub-stages with handoffs, decisions, or waiting in between. Examples: "Plan my brother's 30th birthday", "Buy a Mother's Day gift", "Organize the team offsite dinner", "Hire a tutor for my kid". For these emit 3-5 phases.
        - When in doubt, prefer FEWER phases. The user can add steps later if it grows.
        Each phase is BOTH the arc-segment AND a concrete unit of work, so each phase carries exactly one \`action\` (a single imperative the user can do, e.g. "Email three venues for availability"). Phases ARE the action plan — there is no separate next-steps list.
    * completion_criteria — concrete signals the loop is done
    * inputs_needed — people, info, decisions required
    * suggested_steps — 1-3 OPTIONAL adjacent steps a thoughtful user might want to add. These are NOT in \`phases\` (you've already biased toward the smallest plan); they're one-click additions the user can opt into. Each entry has: id (stable), title (imperative, short), category, rationale (one-line "why this might help"), position ('before' | 'after' | 'end'), anchor_phase_id (the existing phase id this step is relative to — REQUIRED for 'before'/'after', null for 'end'). Examples: for "Change lightbulb" → suggest "Buy lightbulb" with position 'before' anchored to the change phase, rationale "in case the bulb isn't on hand"; for "Buy a Mother's Day gift" → suggest "Wrap the gift" with position 'after'. NEVER duplicate a phase that's already in \`phases\` — these are *additional* options.

2. **refine** — The user has clicked the phase they're in and given you context (typically as labelled answers to a few structured questions about that phase). Update THAT phase's \`action\` (and \`action_details\` if useful) so it reflects the user's current situation more concretely than the original generic action. You can also update its \`status\`, blockers, and notes. KEEP THE REST OF THE SHAPE STABLE unless something obvious has changed (e.g. user revealed an extra phase you missed).

A phase has:
- id — stable string id
- title — short noun phrase for the arc-segment
- description — optional one-liner about the segment
- category — see below
- status — not_started | in_progress | done | blocked
- action — REQUIRED. One concrete imperative the user can do for this phase. Always populate. After refine, this is what the user will likely set as their next_action.
- action_details — optional clarification ("Ask for May 18, capacity 80")
- definition_of_done — REQUIRED. 2-4 concrete completion checks for THIS phase, each as { item, done }. Phrase each item as a verifiable signal ("Three quotes received", "Sam approves the numbers", "Bulb bought") — NOT another action verb. Status flips to true only when the user confirms it. Always emit during shape (initialize all done: false unless the ticket already shows the item is satisfied). During refine, preserve existing items and update done flags as the user reports progress; you may rewrite or add an item only if the user reveals a new constraint. Even single-step shapes carry per-phase DoD.

Phase categories (apply to phases AND inform tone): planning, research, doing, waiting, deciding, closing. Pick the one that best matches the *primary* nature of that phase's work. During refine, the prompt will include a "Playbook for the current phase" block that tells you what completion looks like for that category and which kinds of help to prioritize — follow it.

Cross-cutting:
- Conversational and warm. Reflect what you heard. Don't pile up questions.
- "assistant_message" is what gets shown to the user this turn. Always present, always in your warm voice.
- During shape: produce the whole shape. During refine: return an updated \`shape\` (the same phases with the current phase's action improved) AND an updated \`position\` if blockers/notes changed.
- When you think the current phase is complete, set "ready_to_advance": true. This tells the client the loop can be marked done.
- "next_question" — When you need information from the user that you can't infer from the ticket, emit ONE question instead of refining immediately. Object with: id (stable string), kind ('choice' | 'multi_select' | 'short_text' | 'long_text'), prompt (one-line question), options (REQUIRED for choice/multi_select; 2-5 plausible options drawn from the ticket's specifics), allow_other (optional boolean for choice/multi_select — adds an "Other (specify)" option), placeholder (optional, for short_text/long_text). PREFER 'choice' over text whenever you can list 2-5 plausible options. Use 'short_text' for names/dates/numbers. Use 'long_text' ONLY when the answer truly cannot fit a list (e.g. an explanation or constraint). Ask ONE question per turn — never stack. When you have enough info, omit next_question and produce/refine the shape instead. The user's previous answer (if any) is in the conversation log as a labelled Q/A.
- "ticket_updates" — Actively capture concrete facts the user shares (dates, venues, names, links, decisions, deadlines, dress codes, etc.) into the right ticket fields each turn. Whenever the conversation gives you a confident value, include it. Be SURGICAL on goal/description/next_action/type — only set when genuinely better than what's on the ticket. NEVER overwrite the title. NEVER invent facts. Field guidance:
    * goal — set during shape phase if you've articulated a clear goal
    * description — 1-2 sentence summary of what this loop is about; refresh whenever there's meaningfully new info
    * next_action — during refine, set to the current phase's refined \`action\` so the ticket reflects what the user should do next. Must match a phase's \`action\` text exactly.
    * next_action_at — ONLY if the user has explicitly stated a date or time (e.g. "the wedding is May 18", "Sam needs it by Friday"). Never guess. Output as ISO 8601 (with timezone if known, otherwise local-naive is fine, e.g. "2026-05-18T16:00").
    * type — only if the loop is clearly 'research', 'decision', 'follow_up', 'admin', or 'relationship' rather than the default 'task'
    * context — ALWAYS write relevant details here whenever the user provides them. This is the persistent "details section" of the ticket — the durable record of every concrete fact the user has shared (people, dates, venues, addresses, links, budget, constraints, decisions, dress codes, preferences, anything specific). Append-style: preserve everything already in context, and add the new facts in a clean, readable format (short labelled lines or a tight bulleted list). Do NOT drop existing details. Do NOT paraphrase facts away. If the user mentioned even one new concrete detail this turn, include an updated context value. Only omit context when the turn truly contained no new factual detail.
    * definition_of_done — full-list replace, applied to the OVERALL ticket. Concrete completion criteria as { item, done } pairs. **REQUIRED during the shape turn** — emit a 2-5 item list that mirrors the shape's completion_criteria so the ticket carries an overall DoD as soon as scoping happens. If the ticket already has a DoD that's still accurate, you may re-emit it unchanged. During refine: only output when you have a meaningfully better list (e.g. user confirmed an item is done, or a new criterion emerged). If the user mentions something is already done, set done: true.
    * open_questions_to_add — APPEND-ONLY list of strings. Use this when you ask a clarifying question or surface an unknown the user can't immediately answer. Phrase as a question. Don't re-add questions already in the ticket's open_questions (they're shown to you).
    * references_to_add — APPEND-ONLY list of typed pointers to source material the user mentions (URLs, document titles, email subjects, file names). Each entry is { kind, url_or_text, label?: string }. kind ∈ 'link' | 'snippet' | 'attachment' | 'email' | 'other'. Don't re-add references already shown to you.
- NEVER invent names, dates, or facts. Use the user's own words where possible.
- Today's date is provided in the prompt for relative-date interpretation.`

const phaseSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    title: { type: Type.STRING },
    description: { type: Type.STRING, nullable: true },
    status: {
      type: Type.STRING,
      enum: ['not_started', 'in_progress', 'done', 'blocked'],
    },
    category: {
      type: Type.STRING,
      enum: [
        'planning',
        'research',
        'doing',
        'waiting',
        'deciding',
        'closing',
      ],
    },
    action: { type: Type.STRING },
    action_details: { type: Type.STRING, nullable: true },
    // Per-phase DoD: 2-4 concrete checks for THIS phase. Required at
    // shape time. During refine, flip items to done as the user reports
    // progress; you may also add or rewrite items if the user reveals
    // new constraints.
    definition_of_done: {
      type: Type.ARRAY,
      description:
        '2-4 concrete completion checks for this phase. Each item phrased as a verifiable signal ("Three quotes received", "Sam approves the numbers"). Required during shape; preserve and update during refine.',
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING },
          done: { type: Type.BOOLEAN },
        },
        required: ['item', 'done'],
      },
    },
  },
  required: ['id', 'title', 'status', 'category', 'action', 'definition_of_done'],
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    assistant_message: { type: Type.STRING },
    ready_to_advance: { type: Type.BOOLEAN, nullable: true },
    shape: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        goal: { type: Type.STRING, nullable: true },
        phases: { type: Type.ARRAY, items: phaseSchema },
        completion_criteria: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        inputs_needed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        suggested_steps: {
          type: Type.ARRAY,
          nullable: true,
          description:
            '1-3 OPTIONAL adjacent steps a thoughtful user might want to add. Each carries an explicit position relative to an existing phase. Do NOT duplicate any existing phase.',
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              category: {
                type: Type.STRING,
                enum: [
                  'planning',
                  'research',
                  'doing',
                  'waiting',
                  'deciding',
                  'closing',
                ],
              },
              rationale: { type: Type.STRING, nullable: true },
              position: {
                type: Type.STRING,
                enum: ['before', 'after', 'end'],
              },
              anchor_phase_id: { type: Type.STRING, nullable: true },
            },
            required: ['id', 'title', 'category', 'position'],
          },
        },
      },
      required: ['phases', 'completion_criteria', 'inputs_needed'],
    },
    position: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        current_phase_id: { type: Type.STRING, nullable: true },
        blockers: { type: Type.ARRAY, items: { type: Type.STRING } },
        notes: { type: Type.STRING, nullable: true },
      },
      required: ['blockers'],
    },
    next_question: {
      type: Type.OBJECT,
      nullable: true,
      description:
        'A single follow-up question to ask the user before refining. Prefer choice/multi_select over text. Use long_text only when free-form is required.',
      properties: {
        id: { type: Type.STRING },
        kind: {
          type: Type.STRING,
          enum: ['choice', 'multi_select', 'short_text', 'long_text'],
        },
        prompt: { type: Type.STRING },
        options: {
          type: Type.ARRAY,
          nullable: true,
          items: { type: Type.STRING },
        },
        allow_other: { type: Type.BOOLEAN, nullable: true },
        placeholder: { type: Type.STRING, nullable: true },
      },
      required: ['id', 'kind', 'prompt'],
    },
    ticket_updates: {
      type: Type.OBJECT,
      nullable: true,
      description:
        'Patch fields to write back to the ticket. Only include fields you have a confident, concrete value for. Omit or set null to leave a field untouched.',
      properties: {
        goal: { type: Type.STRING, nullable: true },
        description: { type: Type.STRING, nullable: true },
        next_action: { type: Type.STRING, nullable: true },
        next_action_at: {
          type: Type.STRING,
          nullable: true,
          description:
            'ISO 8601. ONLY when the user explicitly stated a date or time. Never invented.',
        },
        type: {
          type: Type.STRING,
          nullable: true,
          enum: [
            'task',
            'research',
            'decision',
            'waiting',
            'follow_up',
            'admin',
            'relationship',
          ],
        },
        context: { type: Type.STRING, nullable: true },
        definition_of_done: {
          type: Type.ARRAY,
          nullable: true,
          description:
            'Full replace. Concrete completion criteria; preserve user-marked done items.',
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              done: { type: Type.BOOLEAN },
            },
            required: ['item', 'done'],
          },
        },
        open_questions_to_add: {
          type: Type.ARRAY,
          nullable: true,
          description:
            'Append-only. Phrased as questions. Skip duplicates of existing open_questions.',
          items: { type: Type.STRING },
        },
        references_to_add: {
          type: Type.ARRAY,
          nullable: true,
          description:
            'Append-only. Typed pointers to source material the user mentioned.',
          items: {
            type: Type.OBJECT,
            properties: {
              kind: {
                type: Type.STRING,
                enum: ['link', 'snippet', 'attachment', 'email', 'other'],
              },
              url_or_text: { type: Type.STRING },
              label: { type: Type.STRING, nullable: true },
            },
            required: ['kind', 'url_or_text'],
          },
        },
      },
    },
  },
  required: ['assistant_message'],
}

type ReferenceKind = 'link' | 'snippet' | 'attachment' | 'email' | 'other'

type TicketUpdates = {
  goal?: string | null
  description?: string | null
  next_action?: string | null
  next_action_at?: string | null
  type?:
    | 'task'
    | 'research'
    | 'decision'
    | 'waiting'
    | 'follow_up'
    | 'admin'
    | 'relationship'
    | null
  context?: string | null
  definition_of_done?: Array<{ item: string; done: boolean }> | null
  open_questions_to_add?: string[] | null
  references_to_add?: Array<{
    kind: ReferenceKind
    url_or_text: string
    label?: string | null
  }> | null
}

type ModelResponse = {
  assistant_message: string
  ready_to_advance?: boolean | null
  shape?: AssistState['shape']
  position?: AssistState['position']
  next_question?: DynamicAssistQuestion | null
  ticket_updates?: TicketUpdates | null
}

type WalkthroughBody = {
  ticket?: TicketSnapshot
  state?: AssistState | null
  user_message?: string | null
  advance?: boolean
}

const PHASE_ORDER: AssistPhase[] = ['shape', 'refine', 'done']

function nextPhase(p: AssistPhase): AssistPhase {
  const i = PHASE_ORDER.indexOf(p)
  return PHASE_ORDER[Math.min(i + 1, PHASE_ORDER.length - 1)]
}

// Drops null/empty values so the client only sees real proposed updates.
// The `next_action_at` value, if present, must parse to a real Date — otherwise
// we drop it (cheap defense against the model inventing bad strings).
function sanitizeTicketUpdates(
  raw: TicketUpdates | null | undefined,
): TicketUpdates | null {
  if (!raw || typeof raw !== 'object') return null
  const out: TicketUpdates = {}
  let any = false
  for (const k of [
    'goal',
    'description',
    'next_action',
    'context',
    'type',
  ] as const) {
    const v = raw[k]
    if (typeof v === 'string' && v.trim() !== '') {
      out[k] = v.trim() as never
      any = true
    }
  }
  if (typeof raw.next_action_at === 'string' && raw.next_action_at.trim() !== '') {
    const d = new Date(raw.next_action_at)
    if (!Number.isNaN(d.getTime())) {
      out.next_action_at = d.toISOString()
      any = true
    }
  }
  if (Array.isArray(raw.definition_of_done)) {
    const dod: Array<{ item: string; done: boolean }> = []
    for (const entry of raw.definition_of_done) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.item === 'string' &&
        entry.item.trim() !== ''
      ) {
        dod.push({
          item: entry.item.trim(),
          done: entry.done === true,
        })
      }
    }
    if (dod.length > 0) {
      out.definition_of_done = dod
      any = true
    }
  }
  if (Array.isArray(raw.open_questions_to_add)) {
    const qs: string[] = []
    for (const q of raw.open_questions_to_add) {
      if (typeof q === 'string' && q.trim() !== '') qs.push(q.trim())
    }
    if (qs.length > 0) {
      out.open_questions_to_add = qs
      any = true
    }
  }
  if (Array.isArray(raw.references_to_add)) {
    const refs: Array<{
      kind: ReferenceKind
      url_or_text: string
      label?: string | null
    }> = []
    const kinds: ReferenceKind[] = [
      'link',
      'snippet',
      'attachment',
      'email',
      'other',
    ]
    for (const r of raw.references_to_add) {
      if (
        r &&
        typeof r === 'object' &&
        typeof r.url_or_text === 'string' &&
        r.url_or_text.trim() !== '' &&
        kinds.includes(r.kind as ReferenceKind)
      ) {
        refs.push({
          kind: r.kind as ReferenceKind,
          url_or_text: r.url_or_text.trim(),
          label:
            typeof r.label === 'string' && r.label.trim() !== ''
              ? r.label.trim()
              : null,
        })
      }
    }
    if (refs.length > 0) {
      out.references_to_add = refs
      any = true
    }
  }
  return any ? out : null
}

function emptyState(): AssistState {
  return {
    phase: 'shape',
    shape: null,
    position: null,
    messages: [],
    next_question: null,
  }
}

// Normalized form used to detect "the model is asking the same thing
// twice." Lowercase + strip non-alphanumerics + collapse whitespace.
function normalizePrompt(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Pulls the labelled "Q: …" prompts out of the conversation log so we can
// (a) show the model an explicit "already asked" list, and (b) drop any
// next_question whose prompt repeats one already in that list. Both the
// dynamic interview UI and the static structured-questions form emit user
// messages shaped as `Q: <prompt>\nA: <answer>`, so this catches both.
function extractAskedPrompts(
  messages: AssistState['messages'],
): Array<{ prompt: string; norm: string }> {
  const seen = new Set<string>()
  const out: Array<{ prompt: string; norm: string }> = []
  for (const m of messages) {
    if (m.role !== 'user') continue
    for (const line of m.text.split('\n')) {
      const match = line.match(/^Q:\s*(.+)$/)
      if (!match) continue
      const prompt = match[1].trim()
      const norm = normalizePrompt(prompt)
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      out.push({ prompt, norm })
    }
  }
  return out
}

const QUESTION_KINDS: AssistQuestionKind[] = [
  'choice',
  'multi_select',
  'short_text',
  'long_text',
]

// Drops the question if required fields are missing or if a choice-kind
// question doesn't have at least one option. Returning null lets the route
// treat "no question" as the model deciding to refine instead of ask.
function sanitizeNextQuestion(
  raw: unknown,
): DynamicAssistQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.trim() === '') return null
  if (typeof r.prompt !== 'string' || r.prompt.trim() === '') return null
  if (typeof r.kind !== 'string' || !QUESTION_KINDS.includes(r.kind as AssistQuestionKind)) {
    return null
  }
  const kind = r.kind as AssistQuestionKind
  let options: string[] | null = null
  if (Array.isArray(r.options)) {
    const cleaned: string[] = []
    for (const o of r.options) {
      if (typeof o === 'string' && o.trim() !== '') cleaned.push(o.trim())
    }
    if (cleaned.length > 0) options = cleaned
  }
  if ((kind === 'choice' || kind === 'multi_select') && !options) {
    return null
  }
  return {
    id: r.id.trim(),
    kind,
    prompt: r.prompt.trim(),
    options,
    allow_other: typeof r.allow_other === 'boolean' ? r.allow_other : null,
    placeholder:
      typeof r.placeholder === 'string' && r.placeholder.trim() !== ''
        ? r.placeholder.trim()
        : null,
  }
}

const PHASE_CATEGORY_VALUES: PhaseCategory[] = [
  'planning',
  'research',
  'doing',
  'waiting',
  'deciding',
  'closing',
]
const SUGGESTED_POSITIONS: SuggestedStepPosition[] = ['before', 'after', 'end']

// Cleans the model's suggested_steps list: drops malformed entries,
// dedupes by normalized title against itself AND against existing phase
// titles in the same shape, and falls back to 'end' when an
// anchor_phase_id doesn't resolve to a real phase. Returns at most 5
// entries (the prompt asks for 1-3, but cap defensively).
function sanitizeSuggestedSteps(
  raw: unknown,
  phases: ReadonlyArray<{ id: string; title: string }>,
): SuggestedStep[] {
  if (!Array.isArray(raw)) return []
  const validPhaseIds = new Set(phases.map((p) => p.id))
  const seenTitles = new Set(
    phases.map((p) => p.title.trim().toLowerCase()),
  )
  const out: SuggestedStep[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.id !== 'string' || e.id.trim() === '') continue
    if (typeof e.title !== 'string' || e.title.trim() === '') continue
    const title = e.title.trim()
    const titleKey = title.toLowerCase()
    if (seenTitles.has(titleKey)) continue
    if (
      typeof e.category !== 'string' ||
      !PHASE_CATEGORY_VALUES.includes(e.category as PhaseCategory)
    ) {
      continue
    }
    let position = e.position as SuggestedStepPosition
    if (!SUGGESTED_POSITIONS.includes(position)) position = 'end'
    let anchor: string | null =
      typeof e.anchor_phase_id === 'string' && e.anchor_phase_id.trim() !== ''
        ? e.anchor_phase_id.trim()
        : null
    // before/after with an anchor that isn't in the shape → fall back to end.
    if (position !== 'end' && (!anchor || !validPhaseIds.has(anchor))) {
      position = 'end'
      anchor = null
    }
    if (position === 'end') anchor = null
    out.push({
      id: e.id.trim(),
      title,
      category: e.category as PhaseCategory,
      rationale:
        typeof e.rationale === 'string' && e.rationale.trim() !== ''
          ? e.rationale.trim()
          : null,
      position,
      anchor_phase_id: anchor,
    })
    seenTitles.add(titleKey)
    if (out.length >= 5) break
  }
  return out
}

// Sanitize per-phase DoD: drop entries with empty `item`, coerce `done`
// to a boolean. Caps at 8 items defensively so a runaway list can't
// bloat persisted state.
function sanitizePhaseDod(raw: unknown): Array<{ item: string; done: boolean }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ item: string; done: boolean }> = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as { item?: unknown; done?: unknown }
    if (typeof e.item !== 'string' || e.item.trim() === '') continue
    out.push({ item: e.item.trim(), done: e.done === true })
    if (out.length >= 8) break
  }
  return out
}

// Normalizes a shape coming back from the model so suggested_steps and
// every phase's definition_of_done are always present (even when the
// model omitted them) and validated. Old persisted shapes also lack
// these fields — use this when reading any Shape from the wire.
function normalizeShape(raw: Shape | null | undefined): Shape | null {
  if (!raw) return null
  const rawPhases = Array.isArray(raw.phases) ? raw.phases : []
  const phases = rawPhases.map((p) => ({
    ...p,
    definition_of_done: sanitizePhaseDod(
      (p as { definition_of_done?: unknown }).definition_of_done,
    ),
  }))
  return {
    goal: raw.goal ?? null,
    phases,
    completion_criteria: raw.completion_criteria ?? [],
    inputs_needed: raw.inputs_needed ?? [],
    suggested_steps: sanitizeSuggestedSteps(
      (raw as { suggested_steps?: unknown }).suggested_steps,
      phases,
    ),
  }
}

function buildPrompt(
  ticket: TicketSnapshot,
  state: AssistState,
  userMessage: string | null,
  advanced: boolean,
  classifierHint: ClassifyResult | null,
): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`Today's date: ${today}`, '']
  lines.push(`Current phase: ${state.phase}`)
  if (classifierHint) {
    lines.push(
      `Classifier hint: this looks like "${classifierHint.archetype}" (confidence ${classifierHint.confidence.toFixed(2)}). Use as a soft suggestion only — don't force-fit.`,
    )
  }
  if (advanced) {
    lines.push(
      `The user just clicked "Continue" — they want to start this phase now. Open with a brief, warm opener tailored to the new phase.`,
    )
  }
  lines.push('', 'Ticket:')
  const fields: Array<[string, unknown]> = [
    ['title', ticket.title],
    ['type', ticket.type],
    ['status', ticket.status],
    ['goal', ticket.goal],
    ['description', ticket.description],
    ['next_action', ticket.next_action],
    ['next_action_at', ticket.next_action_at],
    ['context', ticket.context],
  ]
  for (const [k, v] of fields) {
    if (v === null || v === undefined || v === '') continue
    lines.push(`- ${k}: ${String(v)}`)
  }
  if (ticket.definition_of_done && ticket.definition_of_done.length > 0) {
    lines.push('', 'Definition of done so far:')
    for (const it of ticket.definition_of_done) {
      lines.push(`- [${it.done ? 'x' : ' '}] ${it.item}`)
    }
  }
  if (ticket.open_questions && ticket.open_questions.length > 0) {
    lines.push('', 'Open questions on this ticket (do not re-add):')
    for (const q of ticket.open_questions) {
      lines.push(
        `- ${q.resolved ? '[resolved] ' : ''}${q.question}${q.resolution ? ` → ${q.resolution}` : ''}`,
      )
    }
  }
  if (ticket.references && ticket.references.length > 0) {
    lines.push('', 'References on this ticket (do not re-add):')
    for (const r of ticket.references) {
      lines.push(`- (${r.kind}) ${r.label ? `${r.label}: ` : ''}${r.url_or_text}`)
    }
  }
  if (state.shape) {
    lines.push('', 'Current shape:', JSON.stringify(state.shape, null, 2))
  }
  if (state.position) {
    lines.push('', 'Current position:', JSON.stringify(state.position, null, 2))
  }
  // If the previous turn asked the user a structured question, the user's
  // answer arrives as the new user_message. Surface the asked question so
  // the model sees what was answered (the sanitizer cleared it on the
  // stored state, but the prompt should still show what was just asked).
  if (state.next_question) {
    lines.push(
      '',
      'You just asked the user this question (their answer is the new user message):',
      JSON.stringify(state.next_question, null, 2),
    )
  }
  // Explicit "do NOT re-ask" list — the conversation log already contains
  // these as Q/A pairs, but pulling them out as a labelled section makes
  // it much harder for the model to repeat a question it already got an
  // answer to.
  const askedPrompts = extractAskedPrompts(state.messages)
  if (askedPrompts.length > 0) {
    lines.push('', 'Questions already asked in this phase (do NOT re-ask any of these — the user has already answered):')
    for (const q of askedPrompts) lines.push(`- ${q.prompt}`)
  }
  // During refine, splice in the per-category playbook for the phase the
  // user has selected. Skipped during shape (no current phase yet) and
  // skipped if the position points at a phase id that doesn't resolve in
  // the current shape (defensive — shouldn't happen, but don't crash).
  if (state.phase === 'refine' && state.shape && state.position?.current_phase_id) {
    const current = state.shape.phases.find(
      (p) => p.id === state.position!.current_phase_id,
    )
    if (current) {
      lines.push('', formatPlaybookBlock(current.category, current.title))
    }
  }
  if (state.messages.length > 0) {
    lines.push('', 'Conversation so far:')
    for (const m of state.messages) {
      lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    }
  }
  if (userMessage) {
    lines.push('', `New user message: ${userMessage}`)
  } else if (state.messages.length === 0 && !advanced) {
    lines.push(
      '',
      'No user message yet — propose an initial shape from the ticket alone. First classify: is this a single-step task (call X, take out trash, book a flight) or a multi-step task with distinct stages (plan a party, buy a gift, organize an event)? Emit 1 phase for single-step, 3-5 for multi-step. Bias toward fewer phases — the user can add steps later. Each phase carries a sensible default action.',
    )
  }
  return lines.join('\n')
}

router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as WalkthroughBody
  const ticket = body.ticket
  if (
    !ticket ||
    typeof ticket.title !== 'string' ||
    ticket.title.trim() === ''
  ) {
    return res.status(400).json({ error: 'ticket.title is required' })
  }

  const ai = getGemini()
  if (!ai) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' })
  }

  const prevState: AssistState = body.state ?? emptyState()
  let activeState: AssistState = prevState
  if (body.advance) {
    activeState = { ...prevState, phase: nextPhase(prevState.phase) }
  }

  // If user asked to advance to 'done', skip the model call.
  if (activeState.phase === 'done') {
    const finalState: AssistState = {
      ...activeState,
      messages: [
        ...activeState.messages,
        {
          role: 'assistant',
          text: 'Great — you can come back any time and pick up where you left off.',
          ts: new Date().toISOString(),
        },
      ],
      next_question: null,
    }
    return res.json({
      state: finalState,
      assistant_message:
        'Great — you can come back any time and pick up where you left off.',
      ready_to_advance: false,
    })
  }

  const userMessage =
    typeof body.user_message === 'string' && body.user_message.trim() !== ''
      ? body.user_message.trim()
      : null

  // First-turn shape fast path: when the user opens a fresh loop with no
  // shape yet and no message of their own, route the title through the
  // classifier. If it matches a templated archetype with high confidence,
  // serve the template directly and skip the heavier model call. Any
  // failure (no API key, network, parse error) falls through silently —
  // we never surface classifier outages to the user.
  let classifierHint: ClassifyResult | null = null
  if (
    activeState.phase === 'shape' &&
    !activeState.shape &&
    !body.advance &&
    userMessage === null
  ) {
    try {
      const classified = await classifyArchetype(ticket.title, ticket.description)
      classifierHint = classified
      const template =
        classified.confidence >= TEMPLATE_CONFIDENCE_THRESHOLD &&
        classified.archetype !== 'other'
          ? getTemplate(classified.archetype)
          : null
      if (template) {
        const templateUsed = classified.archetype
        const shape = template.buildShape(ticket.title)
        const opener = template.buildOpener(ticket.title)
        const nextState: AssistState = {
          phase: 'shape',
          shape,
          position: activeState.position,
          next_question: activeState.next_question ?? null,
          messages: [
            ...activeState.messages,
            {
              role: 'assistant',
              text: opener,
              ts: new Date().toISOString(),
            },
          ],
        }
        const ticketUpdates = sanitizeTicketUpdates({
          goal: shape.goal,
          type: ARCHETYPE_TICKET_TYPE[classified.archetype] as TicketUpdates['type'],
        })
        return res.json({
          state: nextState,
          assistant_message: opener,
          ready_to_advance: false,
          ticket_updates: ticketUpdates,
          classifier: classified,
          template_used: templateUsed,
        })
      }
    } catch (err) {
      // Silent fallthrough — log only.
      console.warn('[assist/walkthrough] classifier failed, falling through', err)
    }
  }

  // Append the user message to messages BEFORE the call so the prompt sees it.
  const messagesWithUser: AssistState['messages'] = userMessage
    ? [
        ...activeState.messages,
        { role: 'user', text: userMessage, ts: new Date().toISOString() },
      ]
    : activeState.messages

  const promptState: AssistState = {
    ...activeState,
    messages: messagesWithUser,
  }

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(
        ticket,
        promptState,
        userMessage,
        !!body.advance,
        classifierHint,
      ),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.5,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const text = result.text
    if (!text) {
      console.error('[assist/walkthrough] empty response', {
        finishReason: result.candidates?.[0]?.finishReason,
      })
      return res.status(502).json({ error: 'Empty response from Gemini' })
    }

    let parsed: ModelResponse
    try {
      parsed = JSON.parse(text) as ModelResponse
    } catch {
      console.error('[assist/walkthrough] malformed JSON', { text })
      return res.status(502).json({ error: 'Malformed JSON from Gemini' })
    }

    const assistantMessage =
      typeof parsed.assistant_message === 'string'
        ? parsed.assistant_message.trim()
        : ''
    if (!assistantMessage) {
      console.error('[assist/walkthrough] missing assistant_message', { text })
      return res.status(502).json({ error: 'Missing assistant_message' })
    }

    // Both shape and refine return an updated `shape`. In refine, the model
    // is editing the current phase's action in place; in shape, it's the
    // initial generation. Either way, take what the model returned if
    // present, otherwise carry forward.
    const phase = activeState.phase
    const carriedShape = parsed.shape
      ? normalizeShape(parsed.shape)
      : (activeState.shape ?? null)
    let nextQuestion = sanitizeNextQuestion(parsed.next_question)
    // Drop a re-asked question. The model has the "do NOT re-ask" list in
    // the prompt, but defense-in-depth: if it slips through, force the
    // turn to be a refine instead of asking the same thing again.
    if (nextQuestion) {
      const askedNorms = new Set(
        extractAskedPrompts(messagesWithUser).map((q) => q.norm),
      )
      if (askedNorms.has(normalizePrompt(nextQuestion.prompt))) {
        nextQuestion = null
      }
    }
    const nextState: AssistState = {
      phase,
      shape: carriedShape,
      position: parsed.position ?? activeState.position,
      messages: [
        ...messagesWithUser,
        {
          role: 'assistant',
          text: assistantMessage,
          ts: new Date().toISOString(),
        },
      ],
      next_question: nextQuestion,
    }

    return res.json({
      state: nextState,
      assistant_message: assistantMessage,
      ready_to_advance: parsed.ready_to_advance === true,
      ticket_updates: sanitizeTicketUpdates(parsed.ticket_updates),
      next_question: nextQuestion,
      classifier: classifierHint,
      template_used: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assist/walkthrough] generation failed', err)
    return res.status(500).json({ error: message })
  }
})

export default router
