import { Router } from 'express'
import { Type } from '@google/genai'
import { getGemini, GEMINI_MODEL } from '../lib/gemini.js'

const router = Router()

export const MAX_QUESTIONS = 3

const TICKET_TYPES = [
  'task',
  'research',
  'decision',
  'waiting',
  'follow_up',
  'admin',
  'relationship',
] as const

const TICKET_STATUSES = [
  'inbox',
  'active',
  'waiting',
  'follow_up',
  'review',
  'closed',
  'dropped',
] as const

const SYSTEM_INSTRUCTION = `You are Orbit's personal assistant — warm, thoughtful, and a little curious. Your user is opening a new "loop" (a task, follow-up, decision, research, admin item, or relationship to tend to) and you're helping them think it through, not just filling out a form.

Voice:
- Talk like a trusted human assistant. Reflect back what they said in your own words so they feel heard. It's fine to be brief, kind, and a touch human ("Got it.", "Makes sense.").
- Never robotic. Never list-y. No "Please specify". No "What is the…".
- You can have a small opinion or notice something useful ("This sounds like it might actually be two loops — want me to keep them together?") when it genuinely helps.

How you reason:
- Before each turn, think about: what does the user really want here? What's the underlying goal? What would make this easier for them tomorrow? What's the smallest piece of clarity that would unblock them right now?
- Ask up to ${MAX_QUESTIONS} clarifying questions, ONE AT A TIME, ONLY when the answer would meaningfully change how they'd act on this. If you have enough to draft something useful, just finalize.
- Question priorities (most useful first): What does "done" look like? What's the very next concrete step? Who else is involved? Is there a deadline or trigger? Why does it matter to them? — but only ask the one that actually moves the ticket forward.

Each non-finalizing turn should return:
- "question": { "prompt": ONE conversational sentence (max 24 words) ending in a single "?". May open with a brief acknowledgement like "Got it — " or "Makes sense — " when natural, but never stack multiple questions. "suggestions": 2-4 short, concrete starting answers tailored to THIS specific loop (never generic placeholders). The user can ignore them and type freely. }
- CRITICAL: stop after one question. Do NOT list multiple questions in the prompt. Do NOT repeat or rephrase. Close the JSON cleanly.

Finalizing:
- Pick the best ticket type. Default status to "inbox" unless the user clearly said otherwise.
- Use the user's own language for title and next_action where possible.
- Use null for anything you can't infer from what they said. NEVER invent names, dates, or facts.
- If the user tells you to stop asking or just create it, finalize immediately with whatever you have.
- Today's date (for interpreting "tomorrow", "next week", etc.) is provided in the prompt.`

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    done: { type: Type.BOOLEAN },
    question: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description:
            'ONE conversational sentence ending in a single "?", max 24 words. May start with a brief acknowledgement ("Got it — ", "Makes sense — ") when natural. Never multiple questions stitched together.',
        },
        suggestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['prompt', 'suggestions'],
    },
    draft: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING, nullable: true },
        type: { type: Type.STRING, enum: [...TICKET_TYPES] },
        status: { type: Type.STRING, enum: [...TICKET_STATUSES] },
        goal: { type: Type.STRING, nullable: true },
        next_action: { type: Type.STRING, nullable: true },
        next_action_at: {
          type: Type.STRING,
          nullable: true,
          description: 'ISO 8601 datetime, or null',
        },
        urgency: { type: Type.INTEGER, nullable: true },
        importance: { type: Type.INTEGER, nullable: true },
        energy_required: { type: Type.INTEGER, nullable: true },
        context: { type: Type.STRING, nullable: true },
      },
      required: ['title', 'type', 'status'],
    },
  },
  required: ['done'],
}

type Turn = { question: string; answer: string }

type ClarifyBody = {
  initial?: string
  turns?: Turn[]
  finalize?: boolean
}

type ClarifyResponse =
  | {
      done: false
      question: { prompt: string; suggestions: string[] }
    }
  | {
      done: true
      draft: {
        title: string
        description: string | null
        type: (typeof TICKET_TYPES)[number]
        status: (typeof TICKET_STATUSES)[number]
        goal: string | null
        next_action: string | null
        next_action_at: string | null
        urgency: number | null
        importance: number | null
        energy_required: number | null
        context: string | null
      }
    }

function buildUserPrompt(body: ClarifyBody): string {
  const today = new Date().toISOString().slice(0, 10)
  const turnsText = (body.turns ?? [])
    .map(
      (t, i) =>
        `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`,
    )
    .join('\n\n')
  const turnCount = body.turns?.length ?? 0
  const remaining = Math.max(0, MAX_QUESTIONS - turnCount)
  const mustFinalize = body.finalize === true || remaining === 0

  return [
    `Today's date: ${today}`,
    `User's initial description: ${body.initial ?? ''}`,
    turnsText ? `Conversation so far:\n${turnsText}` : 'No clarifying turns yet.',
    mustFinalize
      ? 'You MUST finalize now. Set done=true and return a draft. Do not ask another question.'
      : `You may ask up to ${remaining} more question(s). Ask one if it would meaningfully improve the ticket; otherwise finalize with done=true.`,
  ].join('\n\n')
}

router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as ClarifyBody
  if (!body.initial || typeof body.initial !== 'string' || body.initial.trim() === '') {
    return res.status(400).json({ error: 'initial is required' })
  }

  const ai = getGemini()
  if (!ai) {
    return res.status(503).json({ error: 'GEMINI_API_KEY is not configured' })
  }

  try {
    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: buildUserPrompt(body),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.5,
        maxOutputTokens: 1024,
        // Thinking with budget=-1 caused token-loop degeneration on this
        // schema (reflection field repeated until truncation). Reasoning is
        // handled in the prompt instead.
        thinkingConfig: { thinkingBudget: 0 },
      },
    })

    const text = result.text
    if (!text) {
      console.error('[assist/clarify] empty response', {
        finishReason: result.candidates?.[0]?.finishReason,
        promptFeedback: result.promptFeedback,
      })
      return res.status(502).json({ error: 'Empty response from Gemini' })
    }

    let parsed: {
      done?: unknown
      question?: { prompt?: unknown; suggestions?: unknown }
      draft?: { title?: unknown } & Record<string, unknown>
    }
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error('[assist/clarify] malformed JSON from Gemini', { text })
      return res.status(502).json({ error: 'Malformed JSON from Gemini' })
    }

    const turnCount = body.turns?.length ?? 0
    const mustFinalize = body.finalize === true || turnCount >= MAX_QUESTIONS

    const draftCandidate = parsed.draft
    const hasUsableDraft =
      !!draftCandidate &&
      typeof draftCandidate.title === 'string' &&
      (draftCandidate.title as string).trim() !== ''

    const questionCandidate = parsed.question
    const hasUsableQuestion =
      !!questionCandidate &&
      typeof questionCandidate.prompt === 'string' &&
      (questionCandidate.prompt as string).trim() !== ''

    // Treat the response as "done" if the discriminator says so, OR when we
    // forced finalization, OR when the model only produced a draft.
    const treatAsDone =
      parsed.done === true ||
      (mustFinalize && hasUsableDraft) ||
      (hasUsableDraft && !hasUsableQuestion)

    if (treatAsDone) {
      if (!hasUsableDraft) {
        console.error('[assist/clarify] missing draft on done response', {
          text,
        })
        return res
          .status(502)
          .json({ error: 'Missing or invalid draft in response' })
      }
      return res.json({ done: true, draft: draftCandidate })
    }

    if (mustFinalize) {
      console.error('[assist/clarify] model failed to finalize at cap', {
        turnCount,
        finalize: body.finalize,
        text,
      })
      return res
        .status(502)
        .json({ error: 'Model failed to finalize at question cap' })
    }

    if (hasUsableQuestion) {
      const q = questionCandidate as { prompt: string; suggestions?: unknown }
      const suggestions = Array.isArray(q.suggestions)
        ? (q.suggestions as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .slice(0, 4)
        : []
      return res.json({
        done: false,
        question: { prompt: q.prompt, suggestions },
      })
    }

    console.error('[assist/clarify] invalid response shape', { text })
    return res.status(502).json({ error: 'Invalid response shape' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[assist/clarify] generation failed', err)
    return res.status(500).json({ error: message })
  }
})

export default router
