# Architecture

Orbit is one Render Web Service that wraps three logical pieces:

1. A Vite-built React SPA (the UI).
2. A Node + Express server (`server/`) that serves that build *and* hosts every `/api/*` route.
3. A Supabase project (Postgres + Auth) that owns persistence, RLS, and email/Google sign-in.

The browser talks directly to Supabase for everything that's RLS-safe (reads, writes, auth state). The Express server is only on the path when the browser needs a privileged capability — sending mail through Resend, generating Supabase admin links for sign-in, or calling Gemini.

```
                 ┌───────────────────────────────┐
                 │ Browser (Vite SPA)            │
                 │                               │
                 │   supabase-js  ──────────────────────► Supabase Postgres + Auth
                 │   fetch /api/*                │              ▲
                 └─────────────┬─────────────────┘              │
                               │                                │
                               ▼                                │
                 ┌───────────────────────────────┐              │
                 │ Express server (server/)      │              │
                 │                               │              │
                 │   /api/send-email   → Resend  │              │
                 │   /api/auth/send-otp → Resend │              │
                 │                       + admin────────────────┘
                 │   /api/assist/walkthrough ──► Gemini
                 │       (gated by requireUser, which verifies
                 │        the caller's Supabase JWT)
                 │                               │
                 │   GET /healthz                │
                 │   GET /*  → dist/index.html   │
                 └───────────────────────────────┘
```

## One process, two dev processes

In production it's a single `node dist-server/index.js` — Express serves the built SPA from `dist/` and mounts `/api/*` on the same port (`server/index.ts:18-26`).

In development you run two:

- `npm run dev` — Vite on `:5173`, proxies `/api/*` to `:3000`.
- `npm run dev:server` — Express on `:3000`, restarts on changes via `tsx watch`.

This split is purely a dev-loop ergonomics choice; nothing in the code assumes two processes.

## What the browser does directly vs. via the server

**Direct to Supabase from the browser (RLS does the gatekeeping):**

- All ticket CRUD (`src/lib/queries.ts`).
- `ticket_events`, `ticket_open_questions`, `ticket_references`, `agent_runs` reads + writes.
- Auth state subscription, OTP verification, Google OAuth redirect, sign-out.
- The `seed_onboarding_tickets()` RPC on first prod sign-in.

**Through the Express server:**

- `POST /api/auth/send-otp` — uses the **service-role** key to call `admin.generateLink`, then sends the email through Resend. Service-role secrets must never reach the browser, hence the round-trip.
- `POST /api/send-email` — generic Resend send.
- `POST /api/assist/walkthrough` — calls Gemini with a `GEMINI_API_KEY`. Gated by `requireUser` (the caller forwards their Supabase access token; the middleware verifies it server-side via the admin client and attaches `req.userId`).

Concretely: anywhere we need a secret the browser must not see (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `GEMINI_API_KEY`), there is an Express route in front.

## Environment split

| Variable | Browser? | Server? |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | ✅ inlined at Vite build | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ never | ✅ `/api/auth/send-otp`, `requireUser` |
| `RESEND_API_KEY`, `RESEND_FROM` | ❌ never | ✅ `/api/send-email`, `/api/auth/send-otp` |
| `GEMINI_API_KEY` | ❌ never | ✅ `/api/assist/walkthrough` |

Anything `VITE_*` is baked into the JS bundle at build time — changing those values requires a rebuild/redeploy.

## State and refresh model

There's no centralized client store. Hooks in `src/lib/queries.ts` each own a `useReducer`-backed fetch lifecycle (`fetchReducer`) and listen on **window CustomEvents** for refresh:

- `orbit:tickets-changed` — fires after `createTicket`/`updateTicket`. List hooks (`useTicketsByStatus`, `useNowTickets`, `useStuckTickets`, `useAllTickets`, `useTicketByShortId`) re-fetch.
- `orbit:assist-changed` — fires after `runAssistTurn`/`persistAssistState`. The non-modal detail view's `useLatestAssistState` re-reads.
- `orbit:open-questions-changed`, `orbit:references-changed`, `orbit:ticket-events-changed` — per-section refreshes inside the detail view.
- `useTicketEvents` listens on **all three** of `tickets-changed`, `assist-changed`, `ticket-events-changed`, because each writes into `ticket_events`.

This keeps every page/section as an independent fetcher without a global cache, but the trade-off is that any mutation must remember to fire the right event. Search for `notifyTicketsChanged`/`notifyAssistChanged`/etc. when adding new write paths.

## Per-area deep dives

- [auth.md](./auth.md) — sign-in flow (OTP / magic link / Google) and request authentication.
- [tickets.md](./tickets.md) — the core ticket model, the non-modal detail view, status transitions, history.
- [assist.md](./assist.md) — the structured Shape → refine walkthrough.
- [server-api.md](./server-api.md) — Express routes, middleware, secret handling.
- [database.md](./database.md) — schema, RLS, migrations, the onboarding RPC.
- [frontend.md](./frontend.md) — routing, layout, page-per-status, query hooks.
