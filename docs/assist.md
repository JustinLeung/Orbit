# Assist (the structured walkthrough)

The "Assist" flow on every ticket is Orbit's only AI surface. It's deliberately structured (not free-form chat): the model proposes a **shape** of the work, the user clicks the phase they're in, then a small set of category-specific questions refine *that phase's action* in place. The user can promote any phase's action to `ticket.next_action` with a single click.

Goal: turn "this open loop is fuzzy" into "here's the concrete next thing I'm doing" without making the user write a prompt.

## Pieces

| File | Role |
| --- | --- |
| `server/routes/assist-walkthrough.ts` | The Gemini call. Owns the system prompt, the JSON schema the model must emit, and the `ticket_updates` sanitizer. |
| `server/lib/gemini.ts` | Cached `@google/genai` client. Returns `null` if `GEMINI_API_KEY` isn't set, so the route can 503 cleanly. |
| `server/lib/assistTypes.ts` / `src/lib/assistTypes.ts` | Mirror of the wire types (`AssistPhase`, `Shape`, `ShapePhaseEntry`, `Position`, `AssistState`). Duplicated because client + server have separate tsconfigs. |
| `src/components/tickets/TicketAssistPanel.tsx` | The inline UI inside `TicketDetailDialog`. Drives shape generation, phase selection, structured-question rendering, refines, "set as next action", and follow-up chat. |
| `src/components/tickets/assistQuestions.ts` | Static catalog: per `PhaseCategory` → which structured questions to ask. Plus `formatStructuredAnswers()` which turns the user's answers into the `user_message` we send to the model. |
| `src/components/tickets/PhaseCategoryPill.tsx` | Small label component for the six phase categories. |
| `src/lib/queries.ts` (`runAssistTurn`, `persistAssistState`, `useLatestAssistState`) | Orchestrates a turn: snapshot the ticket, call the route, apply `ticket_updates`, persist state, write events. |

## Phases of the walkthrough

```
        ┌─────────┐
        │  shape  │  AI proposes goal + 3-5 phases, each with its own
        └────┬────┘  concrete `action`. User clicks the phase they're in.
             │
        ┌────▼────┐  Structured questions for that phase's category get
        │ refine  │  shown. User answers; submit refines the phase's
        └────┬────┘  action in place. Other phases stay stable.
             │
        ┌────▼────┐  Wrap-up. Client stops calling the model.
        │  done   │
        └─────────┘
```

Phases ARE the action plan — there is **no** separate "next steps" list. The model is told this explicitly in the system prompt. When the user clicks "Set as next action" on a phase row, `ticket.next_action` is set to that phase's `action` text exactly.

## Wire shape (`AssistState`)

The state passed back and forth on every turn:

```ts
type AssistState = {
  phase: 'shape' | 'refine' | 'done'
  shape: {
    goal: string | null
    phases: Array<{
      id: string
      title: string
      description: string | null
      status: 'not_started' | 'in_progress' | 'done' | 'blocked'
      category: 'planning' | 'research' | 'doing' | 'waiting' | 'deciding' | 'closing'
      action: string | null         // REQUIRED in practice — the imperative for this phase
      action_details: string | null
    }>
    completion_criteria: string[]
    inputs_needed: string[]
  } | null
  position: {
    current_phase_id: string | null
    blockers: string[]
    notes: string | null
  } | null
  messages: Array<{ role: 'user' | 'assistant'; text: string; ts: string }>
}
```

## A turn end-to-end

1. `runAssistTurn({ ticket, state, userMessage, advance })` snapshots the ticket via `ticketSnapshot()` — pulling DoD, open questions, and references in the same call so the model sees them and won't propose duplicates (`src/lib/queries.ts:230-268`).
2. POSTs to `/api/assist/walkthrough` with `Authorization: Bearer <session.access_token>`. `requireUser` middleware verifies and attaches `req.userId`.
3. The route builds a prompt (`buildPrompt` in `server/routes/assist-walkthrough.ts:349-419`) that includes today's date, the ticket fields, the existing DoD/open questions/references (with explicit "do not re-add" hints), the current shape/position if any, and the conversation log.
4. Gemini returns structured JSON conforming to `responseSchema`. The route:
   - Validates `assistant_message` exists.
   - Sanitizes `ticket_updates` — drops empty strings, drops invalid `next_action_at` strings, dedupes empty arrays. Lives in `sanitizeTicketUpdates()` (`server/routes/assist-walkthrough.ts:245-338`).
   - Returns `{ state, assistant_message, ready_to_advance, ticket_updates }`.
5. `runAssistTurn` then applies the proposed updates back onto the ticket itself:
   - **Scalar fields + DoD** → one `updateTicket` call with a `changedFields` array, only including fields where the proposed value differs from current. Each diff becomes a `field_updated` (or specialized) event.
   - **Open questions** → append-only via `addOpenQuestion` per item, with snapshot-based dedupe. Skipped entirely if the scalar/DoD update failed (otherwise we'd report "applied" while the actual ticket didn't move).
   - **References** → same pattern via `addReference`, dedupe key `kind::url_or_text`.
6. Writes a fresh `agent_runs` row containing the new `AssistState` (JSON-stringified into `output`). Latest row = current state. See "Why agent_runs holds state" below.
7. Writes an `agent_ran` event into `ticket_events` with `{ agent: 'walkthrough', phase, applied_field_count }`.
8. Fires `orbit:assist-changed` so the panel + activity timeline refresh.

## Why `agent_runs` holds the state

Persistence semantics are a stretch on this table — `agent_runs` was designed for one-model-call-with-an-output, not "rolling state log." We use it anyway because the alternative was a migration to add `tickets.assist_state JSONB`, and we wanted the structured assist flow shipped first.

The cost of this choice:
- Every turn writes a new row instead of updating one. Cheap, but `agent_runs` grows linearly with assist usage.
- `useLatestAssistState` always reads the newest row by `created_at desc`. There's no row-id concept of "the current state."

The follow-up to migrate this to a dedicated `tickets.assist_state` JSONB column is tracked in `PLAN.md` § Assist Mode Can.

## "Set as next action" without a model call

When the user just wants to grab a phase's `action` as the ticket's next_action, the panel calls `updateTicket` directly + `persistAssistState` (`src/lib/queries.ts:536-564`) — no Gemini round-trip. `persistAssistState` writes the same `agent_runs` + `ticket_events` rows so history stays consistent.

This is also how `setRefiningOpen` keeps state in sync after the user picks a phase but before answering questions — a deterministic UI gesture that updates `position.current_phase_id`.

## Structured questions vs. free chat

Each `PhaseCategory` has a 2-4 question prompt set in `src/components/tickets/assistQuestions.ts`. When the user submits answers, `formatStructuredAnswers()` collapses them into a single `user_message` shaped like:

```
Q: What outcome would tell you this phase is done?
A: ...

Q: What's the one concrete thing you can do today?
A: ...
```

…and that's what's POSTed as `user_message`. From the model's perspective there's no special "structured input" channel — it's just a labelled message. This is intentional: it lets the user freely type extra context too via the "Ask a follow-up" affordance using the same code path.

## Failure modes the panel handles

- **No `GEMINI_API_KEY`** → route returns `503`. The panel surfaces an inline error and lets the user keep editing the ticket by hand.
- **Bad JSON from Gemini** → `502` with `'Malformed JSON from Gemini'`. Same UI handling.
- **`runAssistTurn` ticket_updates apply fails** → ticket is left at its prior state, applied count is 0, but the assistant message + new state still persist. The user sees the message; the next turn will re-propose the same updates if they're still valid.
- **Network blip mid-flight** → the panel keeps `busy` true until the fetch resolves; the user can retry.
