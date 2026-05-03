# Frontend (routing, layout, hooks)

The SPA is a thin React app: React Router for navigation, a single `AppLayout`, one page per ticket status, and a set of fetch hooks in `src/lib/queries.ts`. There is no global state library — every page is its own fetcher, refreshed via window CustomEvents (see [architecture.md § state and refresh model](./architecture.md#state-and-refresh-model)).

## Routes

```tsx
// src/App.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route
    path="/"
    element={<RequireAuth><AppLayout /></RequireAuth>}
  >
    <Route index            element={<Navigate to="/now" replace />} />
    <Route path="inbox"     element={<InboxPage />} />
    <Route path="now"       element={<NowPage />} />
    <Route path="waiting"   element={<WaitingPage />} />
    <Route path="follow-up" element={<FollowUpPage />} />
    <Route path="review"    element={<ReviewPage />} />
    <Route path="stuck"     element={<StuckPage />} />
    <Route element={<ScrollLayout />}>
      <Route path="inbox"     element={<InboxPage />} />
      <Route path="now"       element={<NowPage />} />
      <Route path="waiting"   element={<WaitingPage />} />
      <Route path="follow-up" element={<FollowUpPage />} />
      <Route path="review"    element={<ReviewPage />} />
      <Route path="stuck"     element={<StuckPage />} />
      <Route path="people"    element={<PeoplePage />} />
    </Route>
    <Route path="loop/:shortId" element={<LoopPage />} />
  </Route>
</Routes>
```

- `/` redirects to `/now` so the user lands on what they have to do today, not on the marketing-style "inbox".
- `RequireAuth` is the only auth gate — every authenticated route inherits it via the layout wrapper.
- `/loop/:shortId` is the non-modal ticket detail surface. The route param is the per-user `short_id` so URLs are stable and shareable. Tab state lives in `TicketTabsProvider` (mounted at `AppLayout`) so the same loop opens in tab form when reached from a list row — and the tabs survive navigation away and back.
- The list routes are wrapped in a `ScrollLayout` (a single `flex-1 overflow-y-auto` outlet) because list pages assume the parent scrolls. The loop route opts out so it can run its own internal scroll regions (tab strip + body + right rail).

## Layout

`AppLayout` (`src/components/layout/AppLayout.tsx`) is a two-column shell:

- **Sidebar** — Orbit branding, "New ticket" button (with `n` keybind hint), nav list, signed-in email, sign-out.
- **Main** — `<Outlet />` for the page.

The sidebar nav order matches the lifecycle ordering: `Inbox → Now → Waiting → Follow-Up → Review → Stuck → People`. The icon column reuses the same Lucide icons throughout the app for status meta (`status-meta.tsx`).

`PageHeader` (`src/components/layout/PageHeader.tsx`) is the shared title + description block that each page mounts at the top of `<main>`.

## Page-per-status

Each `pages/*.tsx` file is the same shape:

1. Use a queries hook (`useTicketsByStatus('inbox')`, `useNowTickets()`, `useStuckTickets()`).
2. Render `<PageHeader />` and a `<TicketList>` (or empty state).
3. Inbox additionally hoists a `QuickAddInput` for one-line capture.

Because hooks listen to `orbit:tickets-changed`, mutating from anywhere — sidebar create, detail view inline edit, assist panel — reflows the visible list automatically.

`StuckPage` is the one page with a non-trivial query: it pulls `active`/`waiting`/`review` rows and filters in JS for the three "stuck" cases (`useStuckTickets` in `src/lib/queries.ts:144-176`). The filter is intentionally JS-side so the rules read top-to-bottom.

## Ticket capture, hoisted globally

`CreateTicketProvider` (`src/lib/createTicket.tsx`) wraps the `AppLayout` outlet and owns:

- `captureOpen` state for the title-only quick-capture modal.
- A global `n` keyboard shortcut (`useEffect` in `createTicket.tsx`) that opens capture *unless* the user is typing in an input/textarea/select/contenteditable.

`useCreateTicket()` (in `src/lib/useCreateTicket.ts`) exposes a single `openCreate(status?)` callable. The sidebar button uses it; pages can too if they want a status-pinned quick-add (e.g. an Inbox quick-add).

The flow:
```
user presses n / clicks New ticket
   ↓
TicketCreateInline (title-only modal) opens
   ↓ user types title + submits
createTicket() inserts row + ticket_created event
   ↓ onCreated callback opens the new ticket as a tab and
     navigates to /loop/:shortId
   ↓ assist panel auto-runs first turn (shape)
```

## Ticket tabs

`TicketTabsProvider` (`src/lib/ticketTabsProvider.tsx`) sits inside `AppLayout` and tracks open tabs by `short_id`:

- `openTab(shortId)` — adds a tab if not already open.
- `closeTab(shortId)` — removes a tab and returns the `short_id` of the next tab the caller should land on (or `null`).

`useTicketTabs()` (in `src/lib/ticketTabs.ts`) exposes the value. Two callers consume it:

- `TicketList` rows — clicking opens the ticket as a tab and navigates to `/loop/:shortId`.
- `TicketTabsStrip` — renders the open tabs above the detail view, plus a **⌘O** "Jump to loop" popover that searches across all tickets via `useAllTickets`. Owns a global `keydown` listener for the shortcut, ignored while typing.

State lives in memory only (no persistence yet) — refreshing the page resets to the URL's loop only. If durable tabs become a need, persist `openIds` to `localStorage` in the provider.

## The query hooks

All in `src/lib/queries.ts`. Common shape:

```ts
function useTicketAsync<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  initial: T,
  { listen }: { listen: boolean } = { listen: false },
): { data: T; loading: boolean; error: Error | null; refresh: () => void }
```

It's a small `useReducer` lifecycle (`fetchReducer`) plus a `version` counter that the listener bumps. The reducer indirection exists to satisfy `react-hooks/set-state-in-effect` — the lint rule flags raw `setState` from inside an effect, but `dispatch` from `useReducer` is fine.

Public hooks:

| Hook | What it returns |
| --- | --- |
| `useTicketsByStatus(status)` | tickets in that status, newest first. Listens. |
| `useNowTickets()` | active + `next_action_at <= today`. Listens. |
| `useStuckTickets()` | active/waiting/review filtered by the three Stuck rules. Listens. |
| `useAllTickets()` | every ticket, most-recently-updated first. Used by the jump-to-loop popover. Listens. |
| `useTicketByShortId(shortId)` | a single ticket by per-user `short_id`. Used by `LoopPage`. Listens. |
| `usePeople()` | all people, alpha. (Doesn't listen yet — there's no "people changed" event because no people-mutating UI exists.) |
| `useLatestAssistState(ticketId)` | parses the latest `agent_runs.output`. Listens to `orbit:assist-changed`. |
| `useTicketEvents(ticketId)` | full append-only history. Listens to `orbit:tickets-changed`, `orbit:assist-changed`, `orbit:ticket-events-changed`. |
| `useTicketOpenQuestions(ticketId)` | listens to `orbit:open-questions-changed`. |
| `useTicketReferences(ticketId)` | listens to `orbit:references-changed`. |

Mutators always pair with a `notify*Changed()` helper inside the same file. Search for `notifyTicketsChanged` etc. when adding a new write path.

## Components

`src/components/` is split four ways:

- `auth/` — just `RequireAuth`.
- `layout/` — `AppLayout`, `PageHeader`.
- `tickets/` — every ticket-shaped surface: list, non-modal detail view, tab strip + jump popover, assist panel, context sections, the form helpers and constants, status/category meta. See [tickets.md](./tickets.md) and [assist.md](./assist.md).
- `ui/` — generated shadcn/ui primitives (button, input, …). Tweaks live here; do not edit these to add Orbit-specific behavior — wrap them in something in `tickets/` or `layout/` instead.

## Type aliases

`src/types/database.ts` is generated by `supabase gen types`. Don't edit it.

`src/types/orbit.ts` re-exports ergonomic aliases (`Ticket`, `Person`, `AgentRun`, `TicketEvent`, `*Insert`, `*Update`, plus the enum unions). Always import from `@/types/orbit` rather than from the generated file — keeps refactors contained if the generator ever changes its conventions.

## Adding a new page

1. Add a file under `src/pages/`.
2. Add the route in `src/App.tsx` *inside* the `RequireAuth` layout route.
3. Add a nav entry in `AppLayout`'s `navItems`.
4. Use an existing queries hook, or add a new one (and a `notify*Changed` paired with the relevant mutators).
