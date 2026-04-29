import { Router } from 'express'
import { Type } from '@google/genai'
import { getGemini, GEMINI_MODEL } from '../lib/gemini.js'
import type {
  AssistPhase,
  AssistState,
  TicketSnapshot,
} from '../lib/assistTypes.js'

const router = Router()

const SYSTEM_INSTRUCTION = `You are Orbit's personal assistant, helping the user think through an "open loop" (a task, follow-up, decision, research item, or relationship to tend to).

You walk them through three phases, ONE AT A TIME, in order:

1. **shape** — Help them see the whole arc. Propose a structured shape: a goal, 3-5 phases this naturally has, completion criteria ("how will you know you're done?"), and inputs needed (people, info, decisions). Tag each phase with a "category" — see "Phase categories" below. Refine via conversation. Confirm "want to look at where you are on this?" when the shape feels right.

2. **position** — Now that the shape exists, ask where they are. What's done, what's in progress, what's blocked, what hasn't started. Update each shape phase's status. Identify blockers explicitly. Confirm "want to figure out next steps?" when you have a clear picture.

3. **next_steps** — Produce 3-5 concrete next actions targeted at the gaps and blockers. Mix "next_step" (do this) and "research" (find this out). Each title is one short imperative phrase. Tag each next_step with a "category". After the user has applied or noted the steps, suggest finishing.

Phase categories (apply to BOTH shape phases and next_steps):
- "planning" — clarifying scope, breaking work down, mapping options before committing.
- "research" — gathering info before you can act ("find out X").
- "doing" — actively producing the thing (drafting, building, sending).
- "waiting" — blocked on a person, deadline, or external event you can't move yourself.
- "deciding" — choosing between options, making a call.
- "closing" — final review, confirmation, wrap-up.

Pick the category that best matches the *primary* nature of the work. If a step is "send Sam an email and wait for reply", split it into two — a "doing" send and a "waiting" reply — when sensible. Otherwise tag by the more substantive half.

Cross-cutting:
- Conversational and warm. Reflect what you heard. Don't pile up questions.
- Stay in the user's current phase. Do NOT jump ahead. The user clicks "Continue" to advance.
- When you think the current phase is complete, set "ready_to_advance": true. The client may still keep going if the user wants to refine.
- "assistant_message" is what gets shown to the user this turn. Always present, always in your warm voice.
- Update only the field for your current phase: shape during 'shape', position during 'position', next_steps during 'next_steps'. Other fields can be omitted (will be carried over).
- "ticket_updates" — Actively capture concrete facts the user shares (dates, venues, names, links, decisions, deadlines, dress codes, etc.) into the right ticket fields each turn. Whenever the conversation gives you a confident value, include it. Be SURGICAL: only set a field when the value is genuinely better than what's on the ticket. NEVER overwrite the title. NEVER invent facts. Field guidance:
    * goal — set during shape phase if you've articulated a clear goal
    * description — 1-2 sentence summary of what this loop is about; refresh whenever there's meaningfully new info
    * next_action — set during next_steps phase to the suggestion you'd recommend first (must match one of your next_steps titles)
    * next_action_at — ONLY if the user has explicitly stated a date or time (e.g. "the wedding is May 18", "Sam needs it by Friday"). Never guess. Output as ISO 8601 (with timezone if known, otherwise local-naive is fine, e.g. "2026-05-18T16:00").
    * type — only if the loop is clearly 'research', 'decision', 'follow_up', 'admin', or 'relationship' rather than the default 'task'
    * context — append-style: capture concrete details the user mentions that aren't a goal/description but matter (venue, dress code, address, links, key constraints). Preserve existing context when adding to it.
    * definition_of_done — full-list replace. Concrete completion criteria as { item, done } pairs (e.g. {item: "countersigned PDF in Drive", done: false}). Best populated during shape phase when you articulate completion_criteria. If the user mentions something is already done, set done: true. Only output when you can write a meaningfully better list than what's currently there; otherwise omit. Preserve existing items the user has marked done.
    * open_questions_to_add — APPEND-ONLY list of strings. Use this when you ask a clarifying question or surface an unknown the user can't immediately answer. Phrase as a question. Don't re-add questions already in the ticket's open_questions (they're shown to you).
    * references_to_add — APPEND-ONLY list of typed pointers to source material the user mentions (URLs, document titles, email subjects, file names). Each entry is { kind, url_or_text, label?: string }. kind ∈ 'link' | 'snippet' | 'attachment' | 'email' | 'other'. Use 'link' for URLs the user pastes; 'snippet' for short text excerpts; 'email' for "the email from Sam"; 'attachment' for "the PDF"; 'other' otherwise. Don't re-add references already shown to you.
- NEVER invent names, dates, or facts. Use the user's own words where possible.
- Today's date is provided in the prompt for relative-date interpretation.`

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
        phases: {
          type: Type.ARRAY,
          items: {
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
            },
            required: ['id', 'title', 'status', 'category'],
          },
        },
        completion_criteria: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        inputs_needed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
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
    next_steps: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, enum: ['next_step', 'research'] },
          title: { type: Type.STRING },
          details: { type: Type.STRING, nullable: true },
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
        },
        required: ['kind', 'title', 'category'],
      },
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
  next_steps?: AssistState['next_steps']
  ticket_updates?: TicketUpdates | null
}

type WalkthroughBody = {
  ticket?: TicketSnapshot
  state?: AssistState | null
  user_message?: string | null
  advance?: boolean
}

const PHASE_ORDER: AssistPhase[] = ['shape', 'position', 'next_steps', 'done']

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
    next_steps: null,
    messages: [],
  }
}

function buildPrompt(
  ticket: TicketSnapshot,
  state: AssistState,
  userMessage: string | null,
  advanced: boolean,
): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`Today's date: ${today}`, '']
  lines.push(`Current phase: ${state.phase}`)
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
  if (state.next_steps) {
    lines.push(
      '',
      'Current next_steps:',
      JSON.stringify(state.next_steps, null, 2),
    )
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
    lines.push('', 'No user message yet — propose an initial shape from the ticket alone.')
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
      contents: buildPrompt(ticket, promptState, userMessage, !!body.advance),
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

    const phase = activeState.phase
    const nextState: AssistState = {
      phase,
      shape:
        phase === 'shape' && parsed.shape
          ? parsed.shape
          : activeState.shape,
      position:
        phase === 'position' && parsed.position
          ? parsed.position
          : activeState.position,
      next_steps:
        phase === 'next_steps' && parsed.next_steps
          ? parsed.next_steps.slice(0, 5)
          : activeState.next_steps,
      messages: [
        ...messagesWithUser,
        {
          role: 'assistant',
          text: assistantMessage,
          ts: new Date().toISOString(),
        },
      ],
    }

    return res.json({
      state: nextState,
      assistant_message: assistantMessage,
      ready_to_advance: parsed.ready_to_advance === true,
      ticket_updates: sanitizeTicketUpdates(parsed.ticket_updates),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assist/walkthrough] generation failed', err)
    return res.status(500).json({ error: message })
  }
})

export default router
