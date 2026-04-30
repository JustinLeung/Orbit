import { Router } from 'express'
import { Type } from '@google/genai'
import { getGemini, GEMINI_MODEL } from '../lib/gemini.js'
import type { TicketSnapshot } from '../lib/assistTypes.js'

// Unblockers helper — a one-shot Gemini call that surfaces 3-5
// open questions which, if answered, would let the user TAKE THE NEXT
// CONCRETE STEP on this loop. Distinct from the /walkthrough route
// because it's NOT part of the rolling shape→refine state machine: it
// never mutates AssistState, and the user accepts proposals
// individually (each becomes an `addOpenQuestion` call on the
// client). Gating: the panel only fires this when the user explicitly
// clicks "Suggest unblockers" — never auto-runs.
//
// Framing note: we deliberately DON'T frame this as risk / failure-
// mode / "what could go wrong" / "what people forget." Those are all
// backward-looking (catch the mistake before it bites). This is
// FORWARD-looking: identify the unknowns whose resolution unlocks
// movement, so the user can act. The endpoint name is legacy
// (/assist/pre-mortem) but the prompt and UI both speak in
// "what'll unblock the next move" language.

const router = Router()

const SYSTEM_INSTRUCTION = `You are Orbit's "unblockers" helper. The user has just sketched a plan for an open loop and is about to start executing it. Your job is to surface 3-5 questions that, if the user answered them today, would unblock the very next concrete move on this loop. Forward-looking, action-oriented — NOT risk analysis or "what could go wrong."

Each item should pass this test: "If the user answered this right now, what concrete action could they take that they CAN'T take yet?" If the answer is "nothing actionable," cut it.

Output rules:
- Each item MUST be phrased AS A QUESTION the user could realistically answer (or know who to ask) today. Examples that PASS the unblocker test: "Which of the three venues fits the budget?" → unlocks "book it." / "Is Sam free on the 16th or do we need a different date?" → unlocks "send invites." / "Per-person or total budget?" → unlocks "decide on catering tier." Examples that FAIL: "What if it rains?" (risk, not action), "Have you considered guest comfort?" (vague, no resulting move), "What if the venue cancels?" (catastrophizing).
- 3-5 items. Quality over quantity. Each should map to a different next-move. NEVER repeat a question already in the ticket's open_questions list (it's shown to you).
- Be SPECIFIC to the ticket — use details from the title, description, context, and the current plan. Reference specific phases by name when the unblocker is for a particular phase.
- Prefer questions that surface MISSING DECISIONS or MISSING INFORMATION over questions that surface preferences. Decisions/info unblock action; preferences usually don't.
- Tone: warm, direct, momentum-oriented — like a colleague who's helping you figure out what to do next, not what to worry about. The user picks which to capture as open questions.
- NEVER invent facts (names, dates, dollar amounts not in the ticket). Use the user's own words where possible.`

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    risks: {
      type: Type.ARRAY,
      description:
        '3-5 risks phrased as questions. Specific to the ticket. No duplicates of existing open_questions.',
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          rationale: { type: Type.STRING, nullable: true },
        },
        required: ['question'],
      },
    },
  },
  required: ['risks'],
}

type RawRisk = { question?: unknown; rationale?: unknown }
type ModelResponse = { risks?: RawRisk[] }

type PlanPhaseSummary = {
  title: string
  category: string
  action: string | null
}

type PreMortemBody = {
  ticket?: TicketSnapshot
  plan?: { goal: string | null; phases: PlanPhaseSummary[] }
}

// Normalize-then-dedupe the same way the walkthrough does for asked
// questions: lowercase, strip non-alphanumerics, collapse whitespace.
function normalizePrompt(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPrompt(
  ticket: TicketSnapshot,
  plan: PreMortemBody['plan'] | null,
): string {
  const lines: string[] = [`Today's date: ${new Date().toISOString().slice(0, 10)}`, '']
  lines.push('Ticket:')
  const fields: Array<[string, unknown]> = [
    ['title', ticket.title],
    ['type', ticket.type],
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
    lines.push('', 'Open questions already on the ticket (do not re-emit any of these):')
    for (const q of ticket.open_questions) {
      lines.push(
        `- ${q.resolved ? '[resolved] ' : ''}${q.question}${q.resolution ? ` → ${q.resolution}` : ''}`,
      )
    }
  }
  if (plan && plan.phases.length > 0) {
    lines.push('', 'The plan the user just sketched:')
    if (plan.goal) lines.push(`Goal: ${plan.goal}`)
    plan.phases.forEach((p, i) => {
      const action = p.action ? ` — ${p.action}` : ''
      lines.push(`${i + 1}. ${p.title} (${p.category})${action}`)
    })
  }
  lines.push(
    '',
    "Now produce 3-5 questions whose answers would UNBLOCK the next concrete move on this loop. Specific to this ticket and plan. Each question must pass the test: 'If the user answers this today, can they take an action they can't take yet?' If you can't name the action, cut the question. Forward-looking momentum, not risk analysis.",
  )
  return lines.join('\n')
}

router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as PreMortemBody
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

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(ticket, body.plan ?? null),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.6,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const text = result.text
    if (!text) {
      return res.status(502).json({ error: 'Empty response from Gemini' })
    }
    let parsed: ModelResponse
    try {
      parsed = JSON.parse(text) as ModelResponse
    } catch {
      return res.status(502).json({ error: 'Malformed JSON from Gemini' })
    }
    const askedNorms = new Set(
      (ticket.open_questions ?? []).map((q) => normalizePrompt(q.question)),
    )
    const risks: Array<{ question: string; rationale: string | null }> = []
    if (Array.isArray(parsed.risks)) {
      const seen = new Set<string>()
      for (const r of parsed.risks) {
        if (!r || typeof r !== 'object') continue
        const q = typeof r.question === 'string' ? r.question.trim() : ''
        if (q === '') continue
        const norm = normalizePrompt(q)
        if (norm === '' || seen.has(norm) || askedNorms.has(norm)) continue
        seen.add(norm)
        risks.push({
          question: q,
          rationale:
            typeof r.rationale === 'string' && r.rationale.trim() !== ''
              ? r.rationale.trim()
              : null,
        })
        if (risks.length >= 5) break
      }
    }
    return res.json({ risks })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assist/pre-mortem] generation failed', err)
    return res.status(500).json({ error: message })
  }
})

export default router
