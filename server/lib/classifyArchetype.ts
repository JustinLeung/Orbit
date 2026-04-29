import { Type } from '@google/genai'
import { getGemini } from './gemini.js'

// The archetypes the classifier can route to. 'other' is the explicit
// escape hatch for anything that doesn't fit cleanly — used both when
// the input is genuinely ambiguous and when it's a kind of loop we
// don't yet have a template for.
export const ARCHETYPES = [
  'event_planning',
  'gift_purchase',
  'trip_planning',
  'decision',
  'hiring',
  'research',
  'bug_fix',
  'waiting_followup',
  'writing',
  'admin_paperwork',
  'relationship',
  'other',
] as const

export type Archetype = (typeof ARCHETYPES)[number]

export type ClassifyResult = {
  archetype: Archetype
  confidence: number
  signals: string[]
}

// Lite is enough for this — the decision boundary is simple and the output
// is tiny. Keeps latency under ~300ms and cost negligible.
export const CLASSIFIER_MODEL = 'gemini-2.5-flash-lite'

const SYSTEM_INSTRUCTION = `You classify short user-supplied descriptions of "open loops" (things they want to track or get done) into one of these archetypes:

- event_planning — throwing a party / hosting a gathering / planning a wedding, birthday, dinner, baby shower, holiday meal. Anything where the deliverable is "the event happens."
- gift_purchase — finding/buying a gift or specific item for a particular person or occasion.
- trip_planning — planning a trip, vacation, or visit somewhere. Includes booking travel and itinerary.
- decision — choosing between options, making a call (which apartment, which job offer, which school). The work is mostly in deciding, not in doing.
- hiring — filling a role: writing a job description, sourcing, interviewing, deciding on candidates.
- research — learning about a SPECIFIC named topic, gathering information without a specific purchase or decision attached. Must have a concrete subject ("learn about retirement accounts", "understand Postgres replication", "read up on the EU AI Act"). Generic self-improvement intentions like "read more this year", "fitness goals for Q2", or "side project ideas" are NOT research — they have no specific subject and belong in "other".
- bug_fix — diagnosing and repairing something broken (software bug, leaky faucet, car won't start). The deliverable is "the thing works again."
- waiting_followup — waiting on someone else's response or action. The user's job is to track and nudge, not to produce.
- writing — producing a written/creative deliverable: essay, blog post, talk, slide deck, application.
- admin_paperwork — renewing, filing, registering, submitting forms — bureaucratic process work.
- relationship — reconnecting with or maintaining contact with a specific person (not a transaction).
- other — none of the above fit cleanly, OR the input is too vague to commit to a category. Includes vague aspirations ("get my life together"), routine chores ("clean out the garage", "buy groceries"), generic intentions ("read more", "fitness goals", "side project ideas"), and one-word inputs ("stuff", "errands").

Output a single JSON object:
- "archetype": one of the values above.
- "confidence": float 0.0–1.0. Be calibrated. Use >0.85 only when the match is near-certain. Use 0.5–0.7 for plausible but ambiguous cases. Use <0.5 only with "other".
- "signals": 1–3 short phrases (verbatim or close paraphrase) FROM the input that drove your classification. Empty array if the input is too vague.

Rules:
- When in doubt between two archetypes, prefer "other" over guessing.
- Don't be swayed by single keywords if the overall meaning points elsewhere ("birthday gift" is gift_purchase, not event_planning).
- Be quiet about your reasoning — return only the JSON.`

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    archetype: {
      type: Type.STRING,
      enum: [...ARCHETYPES],
    },
    confidence: { type: Type.NUMBER },
    signals: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['archetype', 'confidence', 'signals'],
}

// Maps an archetype to the Orbit ticket `type` that best fits it.
// Kept here (not in the model output) so the classifier stays focused on
// one decision and we control the type mapping in code.
export const ARCHETYPE_TICKET_TYPE: Record<Archetype, string> = {
  event_planning: 'task',
  gift_purchase: 'research',
  trip_planning: 'task',
  decision: 'decision',
  hiring: 'decision',
  research: 'research',
  bug_fix: 'task',
  waiting_followup: 'waiting',
  writing: 'task',
  admin_paperwork: 'admin',
  relationship: 'relationship',
  other: 'task',
}

export class ClassifierUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClassifierUnavailableError'
  }
}

// Returns the classifier verdict, or throws ClassifierUnavailableError if
// the Gemini client isn't configured. Other failures (network, malformed
// JSON) propagate as regular Errors so callers can decide whether to
// retry or fall through. The route layer should treat ANY failure as a
// silent fallthrough to the full model — never surface to the user.
export async function classifyArchetype(
  title: string,
  description?: string | null,
): Promise<ClassifyResult> {
  const ai = getGemini()
  if (!ai) {
    throw new ClassifierUnavailableError('GEMINI_API_KEY is not configured')
  }

  const trimmedTitle = title.trim()
  if (!trimmedTitle) {
    return { archetype: 'other', confidence: 0, signals: [] }
  }

  const userContent = description?.trim()
    ? `Title: ${trimmedTitle}\nDescription: ${description.trim()}`
    : `Title: ${trimmedTitle}`

  const result = await ai.models.generateContent({
    model: CLASSIFIER_MODEL,
    contents: userContent,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
      maxOutputTokens: 256,
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  const text = result.text
  if (!text) {
    throw new Error('Empty response from classifier')
  }

  const parsed = JSON.parse(text) as {
    archetype: string
    confidence: number
    signals: string[]
  }

  if (!ARCHETYPES.includes(parsed.archetype as Archetype)) {
    throw new Error(`Classifier returned unknown archetype: ${parsed.archetype}`)
  }

  // Defensive clamp — the model is told 0–1 but we don't trust it blindly.
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
  const signals = Array.isArray(parsed.signals)
    ? parsed.signals.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : []

  return {
    archetype: parsed.archetype as Archetype,
    confidence,
    signals,
  }
}
