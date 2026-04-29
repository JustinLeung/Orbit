# Tickets

A ticket is the only first-class object in Orbit: every commitment lives in `tickets`. This doc covers the ticket lifecycle, the detail dialog, status transitions, the append-only history, and the structured context fields that hang off every ticket.

> See [`PLAN.md`](../PLAN.md) for the canonical field list and the rationale behind each ticket type/status.

## Lifecycle at a glance

```
   ┌──────────┐  user clarifies      ┌──────────┐
   │  inbox   │ ───────────────────► │  active  │ ──┐
   └──────────┘                      └──────────┘   │
        │                                  │        │ next_action_at <= today
        │ user delegates / waits           │        │ surfaces it on /now
        │   ▼                              │
   ┌──────────┐  reply lands         ┌─────────────┐
   │ waiting  │ ───────────────────► │  follow_up  │
   └──────────┘                      └─────────────┘
        │                                  │
        ▼                                  ▼
                        ┌──────────┐  agent submits
                        │  review  │  output for human approval
                        └──────────┘
                            │
                            ▼
                       ┌──────────┐  ┌──────────┐
                       │  closed  │  │ dropped  │
                       └──────────┘  └──────────┘
```

Each transition writes a `status_changed` event into `ticket_events` (`{from, to}`) so history is reconstructible.

## Quick-add vs. detail dialog

Two creation surfaces:

- **`TicketCreateInline`** (sidebar `n` shortcut, Inbox quick-add) — captures **title only**, then routes the user straight into the detail dialog so the rest gets filled in there. The intent is: never let "shape this thing properly" block "get it written down."
- **`TicketDetailDialog`** — the full editor. Click any field to edit in place; saves are optimistic; every save writes a `field_updated` (or `next_action_updated` / `status_changed`) event.

`createTicket()` (`src/lib/queries.ts:196-223`) does the insert and writes a `ticket_created` event back-to-back, non-transactionally — the event insert failing is logged but doesn't fail the ticket. The Supabase REST API doesn't expose transactions; we accept the small risk because the ticket is the user-visible artifact.

## The detail dialog

`TicketDetailDialog` (`src/components/tickets/TicketDetailDialog.tsx`) is the central UI for an existing ticket. The header (status pill, short id, close) spans the full modal width; below it the body splits into two columns at `lg` and above:

- **Left rail** — `TicketPlanRail` (`src/components/tickets/TicketPlanRail.tsx`): the vertical step rail driven by assist's `shape.phases` (numbered timeline, drag-handle reorder, click to mark a phase current). The properties stack (Status / Type / Importance / Energy, Schedule, Created / Updated / Closed stamps) lives below the plan so every field stays reachable. Reorder + pick mutate assist state via `persistAssistState`; property edits route through the dialog's `saveField` (passed in as a prop).
- **Centre** — title, description, Goal / Next action / Waiting on field rows, `CurrentStepCard` (echoes the rail's pick with category pill + action + "Set as next action"), `TicketAssistPanel` in rail mode (`hideActions` — refine flow + follow-up; plan is suppressed because the left rail owns it), `TicketContextSections` (definition-of-done / open questions / references), free-form `Context` note, and `TicketActivity` + `TicketNoteComposer`.

Inline-editable fields (title, description, goal, next_action, next_action_at, urgency/importance/energy, type, status, agent_mode) all run through `saveField()` which:

- Updates the local `editing` state optimistically.
- Calls `updateTicket()` with a `changedFields` array describing the prior + new value (the caller knows the prior value; the server doesn't need to).
- On error, rolls back by restoring `prev`.

`TicketAssistPanel` can also mutate the underlying ticket (`Set as next action`, AI-applied `ticket_updates`); it pipes those mutations back up via `onTicketChange` so the dialog's other fields don't show stale values until refetch. The plan rail and the current-step card both call `useLatestAssistState` directly — they share state through the `orbit:assist-changed` window event rather than prop drilling.

## `updateTicket` and the audit log

`updateTicket(id, patch, { changedFields })` (`src/lib/queries.ts:593-652`) is the single mutator. It:

- Applies `patch` to the row.
- Special-cases status:
  - Moving **into** `closed`/`dropped` sets `closed_at = now()` (unless the patch already set it).
  - Moving **out** of those clears `closed_at`.
- Writes one `ticket_events` row per `changedFields` entry. The event_type is picked by field:
  - `status` → `status_changed` with `{from, to}` payload.
  - `next_action` → `next_action_updated`.
  - everything else → `field_updated` with `{field, old, new}` payload.

Event insert failures are logged but non-fatal — same convention as `createTicket`. Treat `ticket_events` as a best-effort audit log, not a transactional ledger.

## Deleting a ticket

`deleteTicket(id)` (`src/lib/queries.ts`) hard-deletes the row. The detail dialog exposes this via a trash icon in the header (next to close), gated by a `window.confirm`. On success the dialog closes and `notifyTicketsChanged()` fires so lists drop the row.

All ticket-scoped child rows cascade via `ON DELETE CASCADE` FKs (set in migration `20260428205127_init_schema.sql`): `ticket_events`, `ticket_open_questions`, `ticket_references`, `agent_runs`, sub-issues, and any future `ticket_*` table that follows the same pattern. There is **no** soft-delete tombstone — once you delete, the audit log is gone with the ticket. If we need a soft-delete in future, add a `deleted_at` column instead of repurposing this path.

## Reading history

`useTicketEvents(ticketId)` (`src/lib/queries.ts:901-952`) returns events in chronological order. `TicketActivity` reverses it for newest-first display.

The hook listens on **three** window CustomEvents because three different code paths write into `ticket_events`:

| Event | Source |
| --- | --- |
| `orbit:tickets-changed` | `createTicket` / `updateTicket` |
| `orbit:assist-changed` | `runAssistTurn` / `persistAssistState` |
| `orbit:ticket-events-changed` | `addTicketNote` |

Adding a new write path to `ticket_events`? Fire one of these (or add a new event) so the dialog refreshes immediately without a manual reload.

## Notes (`note_added`)

`addTicketNote(ticketId, body)` (`src/lib/queries.ts:867-892`) inserts a `note_added` event with `{body}` payload. It deliberately fires `orbit:ticket-events-changed` instead of `orbit:tickets-changed` because notes don't change the ticket row — re-fetching ticket lists for nothing would be wasted work.

The note composer (`TicketNoteComposer`) lives at the bottom of the activity timeline.

## Structured context fields

Three places store "extra" knowledge beyond the scalar fields. All three are user-scoped + ticket-scoped via RLS, and are read by the assist flow alongside the parent ticket (see `ticketSnapshot()` in `src/lib/queries.ts:230-268`):

### `definition_of_done` (jsonb on `tickets`)

A `[{ item, done }]` checklist on the ticket row itself. Distinct from `goal`: the goal is one-sentence intent; DoD is the concrete completion criteria.

`runAssistTurn` treats it as a **full-list replace** — equality is by `JSON.stringify`. Non-empty proposed lists overwrite the whole array.

### `ticket_open_questions`

Per-ticket child rows for unresolved unknowns. Resolving a question writes a non-null `resolution` (a free-text answer) — so the table doubles as a per-ticket "decisions log."

API (in `src/lib/queries.ts`):
- `useTicketOpenQuestions(ticketId)` — list, ordered by `asked_at`.
- `addOpenQuestion`, `resolveOpenQuestion`, `reopenOpenQuestion`, `deleteOpenQuestion`.

The assist flow can **only append** (`open_questions_to_add`). Full-list replace would clobber user-resolved entries — the model never sees row IDs, so it has nothing reasonable to merge against.

### `ticket_references`

Typed pointers to source material: `kind ∈ link | snippet | attachment | email | other`. Same append-only contract from assist (`references_to_add`); same dedupe-on-snapshot logic in `runAssistTurn` (`src/lib/queries.ts:469-494`).

## Why no realtime subscriptions?

Lists and the detail dialog refresh via the window-event pattern in [architecture.md](./architecture.md#state-and-refresh-model), not Supabase realtime. It's deliberate — single user, single tab is the only multi-tab story we care about for MVP, and the event pattern is debug-friendly (you can grep for `notify*Changed` to see every write path).

If you ever want true cross-tab sync, the natural upgrade is to swap each `notifyXChanged` for a Supabase realtime channel on the same table.
