# Assist (the structured walkthrough)

The "Assist" flow on every ticket is Orbit's only AI surface. It's deliberately structured (not free-form chat): the model proposes a **shape** of the work, the user clicks the phase they're in, then a small set of category-specific questions refine *that phase's action* in place. The user can promote any phase's action to `ticket.next_action` with a single click.

Goal: turn "this open loop is fuzzy" into "here's the concrete next thing I'm doing" without making the user write a prompt.

## Pieces

| File | Role |
| --- | --- |
| `server/routes/assist-walkthrough.ts` | The Gemini call. Owns the system prompt, the JSON schema the model must emit, and the `ticket_updates` sanitizer. |
| `server/lib/gemini.ts` | Cached `@google/genai` client. Returns `null` if `GEMINI_API_KEY` isn't set, so the route can 503 cleanly. |
| `server/lib/assistTypes.ts` / `src/lib/assistTypes.ts` | Mirror of the wire types (`AssistPhase`, `Shape`, `ShapePhaseEntry`, `Position`, `AssistState`). Duplicated because client + server have separate tsconfigs. |
| `server/lib/phasePlaybooks.ts` | Per-`PhaseCategory` "playbook" — what completion looks like, which `ticket_updates` to prioritize, the shape the refined `action` should take, and an `interview?: boolean` opt-in that splices the shared `INTERVIEW_HINTS` (one-at-a-time + MC-preferred + no-re-ask) into the prompt. Spliced into the prompt during `refine`. |
| `server/routes/assist-pre-mortem.ts` | One-shot Gemini call returning 3-5 risks phrased as questions for the planning surface's "Run pre-mortem" button. Stateless — never mutates `AssistState`; each accepted risk hits `addOpenQuestion` separately. |
| `src/lib/contextConstraints.ts` / `server/lib/contextConstraints.ts` | Mirrored helpers (`extractConstraints`/`applyConstraints`) for the constraint pills. Pills persist into `ticket.context` inside a stable `<!-- orbit:constraints -->` marker block so the model can re-extract them. |
| `src/lib/lockInPlan.ts` / `server/lib/lockInPlan.ts` | Mirrored pure helpers — `checkLockInPreconditions` gates the button; `computeLockInUpdates` decides which phase actions to add to the ticket DoD and which phase becomes `in_progress` after the lock-in. No model call. |
| `src/components/tickets/ConstraintPills.tsx` | Pill row used by `PlanningSurface` (Budget / Deadline / People / Effort). Persists into `ticket.context`. |
| `src/components/tickets/PreMortemConfirmList.tsx` | One row per risk, each with "Capture" / "Skip". Capture goes through `addOpenQuestion`; skipping is local-only (the next pre-mortem run gets a fresh list). |
| `src/components/tickets/surfaces/` | Per-`PhaseCategory` "surface" components. `index.ts` holds the `PHASE_SURFACES` registry + `resolveSurface` dispatcher. `types.ts` defines the `SurfaceProps` contract. `PlanningSurface.tsx` owns the planning body (pills + pre-mortem + interview + lock-in). `DefaultSurface.tsx` is the fallback for every category without a bespoke entry — it dispatches to the per-category `agent` for its refine slot. |
| `src/components/tickets/agents/` | Per-`PhaseCategory` agent components — one level *inside* the surface registry. The agent owns the refine sub-form for its category. `index.ts` holds the `PHASE_AGENTS` registry + `resolveAgent` dispatcher. `PlanningAgent.tsx` owns the interview flow; `DefaultAgent.tsx` is the static-form fallback. |
| `src/components/tickets/TicketAssistPanel.tsx` | Thin shell. Owns shape bootstrap, error display, follow-up affordance, optimistic ticket mirror. Body is delegated to the resolved phase surface. |
| `src/components/tickets/assistQuestions.ts` | Static catalog: per `PhaseCategory` → which structured questions to ask. Plus `formatStructuredAnswers()` which turns the user's answers into the `user_message` we send to the model. Used for non-planning categories. |
| `src/components/tickets/DynamicQuestionForm.tsx` / `dynamicQuestionAnswer.ts` | UI for ONE model-asked question (multiple choice / multi-select / short text / long text). Used for planning-category phases where the model interviews the user instead of refining straight away. |
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
      // 2-4 verifiable completion checks for THIS phase. Required at
      // shape time so every phase has its own DoD bar; refine turns
      // flip items to done as the user reports progress.
      definition_of_done: Array<{ item: string; done: boolean }>
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

## Two-tier definition of done

After the initial shape turn, every ticket carries DoD at **two levels**:

- **Ticket-level DoD** (`tickets.definition_of_done` jsonb) — the
  overall completion bar for the loop. The model is required to emit
  this via `ticket_updates.definition_of_done` during the shape turn,
  mirroring the shape's `completion_criteria`. Editable inline from the
  ticket detail dialog (`TicketContextSections`).
- **Per-phase DoD** (`shape.phases[*].definition_of_done`) — 2-4
  verifiable checks specific to that phase. Required on every phase at
  shape time. The user can tick items off without going through the
  model via `togglePhaseDodItem` in `src/lib/queries.ts`, which writes
  a fresh `agent_runs` row + `agent_ran` event so history stays
  consistent. Refine turns can also flip items by re-emitting the
  phase's DoD with `done: true`.

Rendering:
- The plan rail (`TicketPlanRail`) shows a small `done/total` badge
  next to each phase's category pill so progress is visible at a
  glance.
- Inline mode (`TicketAssistPanel.PhaseRow`) shows a compact checklist
  under each phase's action.
- Rail mode (the panel itself) renders the full checklist for the
  current phase in the assist section, since `ActionsSection` isn't
  the place phases are listed.

## Why `agent_runs` holds the state

Persistence semantics are a stretch on this table — `agent_runs` was designed for one-model-call-with-an-output, not "rolling state log." We use it anyway because the alternative was a migration to add `tickets.assist_state JSONB`, and we wanted the structured assist flow shipped first.

The cost of this choice:
- Every turn writes a new row instead of updating one. Cheap, but `agent_runs` grows linearly with assist usage.
- `useLatestAssistState` always reads the newest row by `created_at desc`. There's no row-id concept of "the current state."

A planned follow-up is to migrate this to a dedicated `tickets.assist_state` JSONB column instead of the latest `agent_runs` row.

## "Set as next action" without a model call

When the user just wants to grab a phase's `action` as the ticket's next_action, the panel calls `updateTicket` directly + `persistAssistState` (`src/lib/queries.ts:536-564`) — no Gemini round-trip. `persistAssistState` writes the same `agent_runs` + `ticket_events` rows so history stays consistent.

This is also how `setRefiningOpen` keeps state in sync after the user picks a phase but before answering questions — a deterministic UI gesture that updates `position.current_phase_id`.

## Per-category playbooks

Each `PhaseCategory` has a "playbook" in `server/lib/phasePlaybooks.ts` that
tells the model three things specific to that category:

- **completion** — what "this phase is done" looks like (drives
  `ready_to_advance`).
- **specific_helps** — which `ticket_updates` fields to prioritize this turn
  (e.g. research → `references_to_add` + `open_questions_to_add`; waiting →
  `next_action_at`; closing → flipping DoD items to `done`).
- **action_shape** — the verb-and-object shape the refined `action` should
  take (e.g. waiting → "Nudge P via channel by date"; deciding → "Pick
  between A and B by date").

`buildPrompt` injects the playbook for the user's currently selected phase
during `refine` only. `shape` prompts stay lean — the cosmetic per-category
descriptions were trimmed from the system prompt because the playbook now
carries the meaningful steer. The structured questions in
`src/components/tickets/assistQuestions.ts` are aligned to these playbooks
(e.g. research's `good_enough` question maps to research's completion bar).

Behavioral evals against live Gemini live in
`server/routes/assist-walkthrough.evals.test.ts` and are gated by
`RUN_LIVE_EVALS=1`. Run with:

```bash
GEMINI_API_KEY=… RUN_LIVE_EVALS=1 npx vitest run server/routes/assist-walkthrough.evals.test.ts
```

## Single-step vs multi-step classification

On bootstrap (no user message yet, no prior shape) the system prompt asks
the model to **first classify** the ticket as single-step or multi-step
and bias toward fewer phases:

- **Single-step** ("Call mom", "Take out the trash", "Book a flight",
  "Reply to Sam") → exactly **1** phase. No decomposition.
- **Multi-step** ("Plan a party", "Buy a Mother's Day gift", "Organize the
  team offsite") → 3-5 phases.

The classification *is* `phases.length` — there's no separate wire field.
The `TicketPlanRail` reads `phases.length === 1` to render the
`AddStepInline` affordance with `tone: 'primary'` ("Got more steps? Add
them here") so the user can grow the ticket into a multi-step plan
without going back through the model. Multi-step rails get the same
component in `tone: 'secondary'` (a quiet "+ Add a step" link at the
bottom).

Adding a step goes through `addPhaseToShape` in `src/lib/queries.ts`,
which is a thin wrapper around `persistAssistState` (no model call). The
new phase gets a stable `user-N` id, the user-typed title as both `title`
and `action`, the user-selected category (defaulting to `doing`), and
status `not_started`. Picking it as the current phase later kicks in the
normal refine flow.

### Suggested adjacent steps

To complement the bias toward fewer phases, the model also emits 1-3
`suggested_steps` on the `Shape`: optional adjacent actions a thoughtful
user might want to add but that aren't strictly required (e.g. for
"Change lightbulb" → "Buy lightbulb" before the change phase; for "Buy a
Mother's Day gift" → "Wrap the gift" after it). Each suggestion carries
its own `position` ('before' | 'after' | 'end') and `anchor_phase_id`.

The route's `sanitizeSuggestedSteps` validates each entry, drops any that
duplicate an existing phase title (case-insensitive), falls back to
`position: 'end'` when an `anchor_phase_id` doesn't resolve, and caps the
list at 5.

`SuggestedSteps` (`src/components/tickets/SuggestedSteps.tsx`) renders
the list as one-click chips above `AddStepInline` in the rail. Click →
`acceptSuggestedStep` → `insertPhaseAtPosition` inserts at the declared
position via `persistAssistState` (no model call). The chip filters
client-side on title-match against existing phases, so accepted
suggestions disappear naturally without a separate dismissed-ids store.

## Per-phase agents

Each `PhaseCategory` gets its own agent component that owns the refine
surface for that phase. `TicketAssistPanel` dispatches through the
`PHASE_AGENTS` registry in `src/components/tickets/agents/index.ts`:

```ts
PHASE_AGENTS: Partial<Record<PhaseCategory, AgentComponent>> = {
  planning: PlanningAgent,
  // research / doing / waiting / deciding / closing → DEFAULT_AGENT
}
```

Categories without a bespoke entry fall back to `DEFAULT_AGENT` (the
static structured-questions form). Adding a per-phase agent is two
files: a new component in `agents/`, and a one-line registry entry.

### `AgentProps` contract

Every agent receives the same props (`src/components/tickets/agents/types.ts`):

- `ticket`, `state`, `phase` — the current ticket, assist state, and
  resolved current phase entry.
- `busy`, `loadingState`, `refiningOpen` — UI state owned by the panel.
- `onCancel` — closes the refine surface.
- `runTurn({userMessage, advance})` — emits a turn through the model;
  resolves to the new `AssistState` (or `null` on failure).

The agent owns its own kickoff effects (e.g. `PlanningAgent` fires a
no-message turn when the panel wants to refine but the model hasn't
asked anything yet). State (override, busy, lastApplied, error) is
owned by `TicketAssistPanel` — agents are pure render + emit.

### Generalized interview pattern

The one-question-at-a-time interview is no longer planning-only. Any
playbook can opt in by setting `interview: true`; the shared
`INTERVIEW_HINTS` block (one-at-a-time, MC-preferred, no-re-ask, dedupe
rules) gets spliced into the prompt's playbook block by
`formatPlaybookBlock`. `PlanningAgent` consumes `state.next_question`
and renders `DynamicQuestionForm`; future agents (doing's "I'm stuck"
mini-interview, deciding's tiebreaker, closing's DoD walk) reuse the
same wire/UI primitives by opting their playbooks in.

## Per-phase surfaces

The assist panel's body is dispatched by the current phase's
`PhaseCategory`. The dispatcher (`src/components/tickets/surfaces/`)
mirrors the per-phase agents pattern one level up: where an *agent*
owns the refine sub-form, a *surface* owns the entire panel body —
header, body, and any phase-shaped affordances.

```
TicketAssistPanel  (shell — bootstrap, error, follow-up)
└── <PhaseSurface category={current.category} … />
    ├── PlanningSurface   ← bespoke (pills + pre-mortem + interview + lock-in)
    └── DefaultSurface    ← fallback (Help-with header + DoD + agent refine slot)
```

Categories without a bespoke surface fall back to `DefaultSurface`,
which itself dispatches to the per-category *agent* for its refine
slot — preserving the pre-surface behavior 1:1 for
research/doing/waiting/deciding/closing. Adding a bespoke surface is
two files: a new component in `surfaces/`, and a one-line registry
entry in `surfaces/index.ts`.

### `SurfaceProps` contract

Every surface receives the same props (`surfaces/types.ts`):

- `ticket`, `state`, `phase` — the current ticket, assist state, and
  resolved current phase entry.
- `busy`, `loadingState`, `refiningOpen`, `isShapePhase`,
  `lastAppliedFields` — UI state owned by the panel.
- `onSetNextAction`, `onOpenRefine`, `onCancelRefine` — caller hooks
  the panel exposes so the surface never needs to import
  `updateTicket` / mutate panel state directly.
- `onTicketChange?` — propagation callback when the surface mutates
  the ticket itself (e.g. `PlanningSurface` does this for constraint
  pill saves).
- `runTurn({userMessage, advance})` — emits a turn through the model.

The panel resets `refiningOpen` to false after a successful refine
turn, mirroring the prior agent dispatcher's behavior.

### `PlanningSurface` body

The reading order encodes the flow we want users in: scope → risks →
answer → commit. A single bordered surface inside the panel:

1. **Header** — "Planning · <phase title>" + a one-line subhead.
2. **Constraint pills** (`ConstraintPills`) — Budget / Deadline /
   People / Effort. Click-to-open popovers, kind-appropriate inputs
   (free text / date / scale). Values compile into `ticket.context`
   inside a stable `<!-- orbit:constraints -->` marker block:

   ```
   …whatever else is in context…

   <!-- orbit:constraints -->
   Budget: $500
   Deadline: 2026-05-20
   People: 8
   Effort: M
   <!-- /orbit:constraints -->
   ```

   Mirrored helpers `extractConstraints`/`applyConstraints` in
   `src/lib/contextConstraints.ts` ↔ `server/lib/contextConstraints.ts`
   own the parse/replace. The block is always pinned to the END of
   `context` so the model's append-style narrative isn't disturbed.

3. **Pre-mortem** — gated behind a button (never auto-runs). Clicking
   it hits `/api/assist/pre-mortem`, a stateless one-shot Gemini call
   that returns 3-5 risks phrased as questions. The
   `PreMortemConfirmList` renders one row per risk with **Capture** /
   **Skip**. Capture goes through `addOpenQuestion`; skipping is
   local-only (the next pre-mortem run gets a fresh list). Server-side
   dedupe against the ticket's existing open questions means you can
   run it multiple times without piling up duplicates.

4. **Interview** — delegates to `PlanningAgent`, which renders the
   model's `next_question` (one at a time) using
   `DynamicQuestionForm`. The agent kicks off a turn on mount when
   `wantInterview` is true (refining open or initial shape phase).

5. **"Lock in the plan"** — a primary deterministic transition (no
   model call). Disabled until the precondition triple holds:
   - ticket has a non-empty `goal`
   - shape has at least 1 phase
   - ticket-level `definition_of_done` has at least 1 item

   Click → `lockInPlan` (`src/lib/queries.ts`) calls
   `computeLockInUpdates` (mirrored client/server) which:
   1. Promotes each phase's `action` into the ticket-level
      `definition_of_done`, skipping items already present
      (case-insensitive). The diff is written through `updateTicket`
      with a `field_updated` audit row.
   2. Flips the current planning phase to `done`, advances
      `position.current_phase_id` to the first non-done phase.
      Persists via `persistAssistState` with reason `lock_in_plan` so
      the activity timeline records it.

The pure helper is in its own file (mirrored to server) so the live
eval can import it without crossing the src/server tsconfig boundary.

## Planning is an interview, not a form

The `planning` category is special: instead of showing the static 3-question
form, the model drives a **one-question-at-a-time interview** via the
`next_question` field on `AssistState`. The playbook tells the model to:

- Emit `next_question` (kind: `choice` | `multi_select` | `short_text` |
  `long_text`) when scope, constraints, or options are unclear, **before**
  refining the action.
- Prefer `choice` with 2-5 plausible options drawn from the ticket's
  specifics. Use `short_text` for names/dates/numbers. Use `long_text`
  only when the answer truly cannot fit a list.
- Ask **one** question per turn — never stack.
- Stop interviewing once it has enough info to write a concrete plan.

`TicketAssistPanel` auto-kicks off a turn when a planning phase is opened
with no pending question, then renders `DynamicQuestionForm` (radio /
checkboxes / input / textarea per kind). The user's answer becomes a
labelled `Q: …\nA: …` `user_message` for the next turn — same wire format
as the static questions.

Other categories continue using the static 2-4 question form. The
`next_question` field is wire-supported for all categories, but only the
planning playbook actively tells the model to use it.

## Structured questions vs. free chat

Each non-planning `PhaseCategory` has a 2-4 question prompt set in `src/components/tickets/assistQuestions.ts`. When the user submits answers, `formatStructuredAnswers()` collapses them into a single `user_message` shaped like:

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
