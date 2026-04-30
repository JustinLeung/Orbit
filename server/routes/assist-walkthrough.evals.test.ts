// Live behavioral evals for the per-category playbook.
//
// These tests hit Gemini for real and assert structural properties on the
// model's output for each PhaseCategory. They're gated by RUN_LIVE_EVALS=1
// so CI skips them by default — running every PR would burn quota and the
// model's output is non-deterministic enough to flake.
//
// To run locally:
//   GEMINI_API_KEY=… RUN_LIVE_EVALS=1 npx vitest run server/routes/assist-walkthrough.evals.test.ts
//
// Each fixture sets up a ticket + an in-progress phase of a specific
// category and a user_message that should trigger the playbook's
// "specific helps". Assertions check that the model produced the kind of
// output the playbook asks for, not exact strings.

import { describe, it, expect, beforeAll } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { AssistState, PhaseCategory } from '../lib/assistTypes.js'
import { computeLockInUpdates } from '../lib/lockInPlan.js'

const LIVE = process.env.RUN_LIVE_EVALS === '1' && !!process.env.GEMINI_API_KEY
const d = LIVE ? describe : describe.skip

async function makeApp() {
  const { default: route } = await import('./assist-walkthrough.js')
  const { __resetGeminiForTests } = await import('../lib/gemini.js')
  __resetGeminiForTests()
  const app = express()
  app.use(express.json())
  app.use('/api/assist/walkthrough', route)
  return app
}

function refineState(category: PhaseCategory, action = 'placeholder'): AssistState {
  return {
    phase: 'refine',
    shape: {
      goal: null,
      phases: [
        {
          id: 'p1',
          title: 'Current phase',
          description: null,
          status: 'in_progress',
          category,
          action,
          action_details: null,
        },
      ],
      completion_criteria: [],
      inputs_needed: [],
    },
    position: { current_phase_id: 'p1', blockers: [], notes: null },
    messages: [],
    next_question: null,
  }
}

d('assist-walkthrough live behavioral evals', () => {
  beforeAll(() => {
    if (!LIVE) return
    // The vitest mock for @google/genai in the sibling test file is module-
    // scoped, so it doesn't leak here. Nothing else to set up.
  })

  it('research: emits references_to_add OR open_questions_to_add when fixture mentions sources/unknowns', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Find a wedding venue near Pelican Hill for May 18' },
        state: refineState('research', 'Look into venues'),
        user_message:
          "I've checked WeddingWire and The Knot already. Still need to compare three Pelican Hill candidates — links: https://venueA.example, https://venueB.example. What size capacity should I be targeting?",
      })
    expect(res.status).toBe(200)
    const updates = res.body.ticket_updates ?? {}
    const hasRefs = Array.isArray(updates.references_to_add) && updates.references_to_add.length > 0
    const hasQs = Array.isArray(updates.open_questions_to_add) && updates.open_questions_to_add.length > 0
    expect(hasRefs || hasQs).toBe(true)
  }, 30_000)

  it('waiting: sets next_action_at when fixture mentions a deadline; action contains a nudge verb', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Sam to send the venue contract' },
        state: refineState('waiting', 'Wait for Sam'),
        user_message:
          "I emailed Sam Tuesday asking for the signed contract. If I don't hear back by Friday May 8 2026 I'll call her directly.",
      })
    expect(res.status).toBe(200)
    const updates = res.body.ticket_updates ?? {}
    expect(typeof updates.next_action_at === 'string').toBe(true)
    const action = res.body.state?.shape?.phases?.[0]?.action ?? ''
    expect(action.toLowerCase()).toMatch(/nudge|follow up|email|call|ping|check in/)
  }, 30_000)

  it('deciding: refined action contains a decision verb and emits DoD criteria', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Pick a wedding theme: woodland vs beach' },
        state: refineState('deciding', 'Think about theme'),
        user_message:
          "I'm weighing woodland vs beach. Optimizing for guest comfort and photographer availability. Leaning woodland because the venue is inland.",
      })
    expect(res.status).toBe(200)
    const action = res.body.state?.shape?.phases?.[0]?.action ?? ''
    expect(action.toLowerCase()).toMatch(/pick|choose|decide|commit/)
    const updates = res.body.ticket_updates ?? {}
    const hasDoD = Array.isArray(updates.definition_of_done) && updates.definition_of_done.length > 0
    expect(hasDoD).toBe(true)
  }, 30_000)

  it('closing: flips DoD items the user says are done; suggests review/closed', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: {
          title: 'Wrap up Q3 budget review',
          definition_of_done: [
            { item: 'Send draft to Sam', done: false },
            { item: 'Sam approves the numbers', done: false },
            { item: 'File the recap with finance', done: false },
          ],
        },
        state: refineState('closing', 'Wrap up'),
        user_message:
          "Sam approved the numbers yesterday. I've already sent her the draft. Just need to file the recap.",
      })
    expect(res.status).toBe(200)
    const updates = res.body.ticket_updates ?? {}
    const dod = Array.isArray(updates.definition_of_done) ? updates.definition_of_done : []
    const sentDone = dod.find((it: { item: string; done: boolean }) =>
      /draft|sent|send/i.test(it.item),
    )
    const approvedDone = dod.find((it: { item: string; done: boolean }) =>
      /approve/i.test(it.item),
    )
    expect(sentDone?.done).toBe(true)
    expect(approvedDone?.done).toBe(true)
  }, 30_000)

  it('doing: refined action is a produce-verb with a concrete object; sets next_action_at when deadline mentioned', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Draft Q3 budget numbers' },
        state: refineState('doing', 'Work on numbers'),
        user_message:
          "I have last year's actuals open. Need top-line by end of day Friday May 8 2026.",
      })
    expect(res.status).toBe(200)
    const action = res.body.state?.shape?.phases?.[0]?.action ?? ''
    expect(action.toLowerCase()).toMatch(/draft|write|build|produce|put together|fill in/)
    const updates = res.body.ticket_updates ?? {}
    expect(typeof updates.next_action_at === 'string').toBe(true)
  }, 30_000)

  it('planning: emits a definition_of_done checklist that captures scope', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Plan my brother’s 30th birthday' },
        state: refineState('planning', 'Plan it'),
        user_message:
          "Scope: dinner + after-party for ~20 people. Constraints: $1000 budget, must be in SF, must be on Saturday May 16 2026.",
      })
    expect(res.status).toBe(200)
    const updates = res.body.ticket_updates ?? {}
    const dod = Array.isArray(updates.definition_of_done) ? updates.definition_of_done : []
    expect(dod.length).toBeGreaterThan(0)
  }, 30_000)

  // The system prompt biases the model toward fewer phases — single-step
  // tasks (call X, take out trash, book a flight) should produce exactly 1
  // phase, while multi-step tasks should produce 3+. This eval is the
  // structural contract the rail's "Add a step" tone variant relies on.
  it('classification: single-step ticket → exactly 1 phase', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: { title: 'Call mom' }, state: null })
    expect(res.status).toBe(200)
    const phases = res.body.state?.shape?.phases ?? []
    expect(phases.length).toBe(1)
  }, 30_000)

  it('classification: another single-step task → 1 phase', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: 'Take out the trash before bed' },
        state: null,
      })
    expect(res.status).toBe(200)
    const phases = res.body.state?.shape?.phases ?? []
    expect(phases.length).toBe(1)
  }, 30_000)

  // Single-step tickets should still produce optional adjacent steps as
  // suggestions (not phases) — that's the contract the rail's
  // SuggestedSteps chips rely on. "Change lightbulb" is the canonical
  // example: 1 phase, with a "Buy lightbulb" suggestion positioned BEFORE
  // the change phase.
  it('suggested_steps: change lightbulb → "Buy lightbulb" suggestion before the change phase', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({ ticket: { title: 'Change lightbulb in hallway' }, state: null })
    expect(res.status).toBe(200)
    const phases = res.body.state?.shape?.phases ?? []
    const suggestions = res.body.state?.shape?.suggested_steps ?? []
    expect(phases.length).toBe(1)
    expect(suggestions.length).toBeGreaterThanOrEqual(1)
    const buy = suggestions.find((s: { title: string }) =>
      /buy.*(bulb|light)/i.test(s.title),
    )
    expect(buy).toBeDefined()
    expect(buy.position).toBe('before')
    // The anchor should resolve to the (only) phase.
    expect(buy.anchor_phase_id).toBe(phases[0].id)
  }, 30_000)

  it('classification: multi-step ticket → 3+ phases', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: { title: "Plan my brother's 30th birthday party" },
        state: null,
      })
    expect(res.status).toBe(200)
    const phases = res.body.state?.shape?.phases ?? []
    expect(phases.length).toBeGreaterThanOrEqual(3)
  }, 30_000)

  // The lock-in-the-plan flow is deterministic on the client (no
  // model call), but it depends on the model producing action-bearing
  // phases during shape. This eval threads both pieces: shape a
  // multi-step ticket → call computeLockInUpdates against the resulting
  // state → assert that the merged DoD has at least 2 added items
  // (mirroring the ticket's "≥2 DoD items" acceptance criterion).
  it('lock-in: vague-scope multi-step ticket → ≥2 DoD items after compile', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        ticket: {
          title: "Plan my brother's 30th birthday party",
          description: 'I want to put something together but I do not know where to start.',
        },
        state: null,
      })
    expect(res.status).toBe(200)
    const state = res.body.state as AssistState
    expect(state.shape).toBeTruthy()
    const result = computeLockInUpdates(
      { goal: state.shape!.goal ?? 'Plan it', definition_of_done: [] },
      state,
    )
    expect(result).not.toBeNull()
    expect(result!.added_dod_items.length).toBeGreaterThanOrEqual(2)
  }, 30_000)

  // When planning has missing info, the playbook tells the model to
  // INTERVIEW the user one question at a time, MC preferred, free-form
  // (long_text) only as a last resort. This eval is the structural
  // contract the panel relies on.
  it('planning interview: vague scope → emits ONE next_question, kind choice/short_text, not long_text', async () => {
    const app = await makeApp()
    const res = await request(app)
      .post('/api/assist/walkthrough')
      .send({
        // Deliberately under-specified so the model needs to ask.
        ticket: { title: 'Plan a birthday for my brother' },
        state: refineState('planning', 'Plan it'),
        user_message: null,
      })
    expect(res.status).toBe(200)
    const q = res.body.next_question
    expect(q).toBeTruthy()
    expect(q.id).toBeTruthy()
    expect(q.prompt).toBeTruthy()
    expect(['choice', 'multi_select', 'short_text']).toContain(q.kind)
    if (q.kind === 'choice' || q.kind === 'multi_select') {
      expect(Array.isArray(q.options)).toBe(true)
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.options.length).toBeLessThanOrEqual(5)
    }
    // shape might or might not be returned this turn; what matters is that
    // the model chose to ask first rather than refining blindly.
  }, 30_000)
})
