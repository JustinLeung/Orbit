# Orbit docs

These are the deeper "how each part of the app works" guides. Top-level docs:

- [`../README.md`](../README.md) — how to run, configure, and contribute. Start here if you've just cloned the repo.
- [`../PLAN.md`](../PLAN.md) — product spec and MVP scope. Read this before doing UX work.

Per-area:

- [architecture.md](./architecture.md) — the SPA + Express + Supabase split, request flow, env split, refresh model.
- [auth.md](./auth.md) — sign-in flow (email OTP / magic link / Google), `AuthProvider`, server-side `requireUser` middleware.
- [tickets.md](./tickets.md) — the core ticket lifecycle, the detail dialog, status transitions, history, structured context fields.
- [assist.md](./assist.md) — the structured Shape → refine walkthrough, persistence, `ticket_updates` apply.
- [server-api.md](./server-api.md) — Express routes, libs, secret handling, adding a new route.
- [database.md](./database.md) — schema, RLS, migrations, the onboarding seed RPC, the dev seed script.
- [frontend.md](./frontend.md) — routing, layout, page-per-status, the query hooks pattern.

When code changes affect any of the above, update the relevant doc in the same commit (per `CLAUDE.md`'s "always keep docs in sync with code" rule).
