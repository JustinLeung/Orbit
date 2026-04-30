# Claude working notes for Orbit

## Where to find things

Before changing code, skim the doc for the area you're touching — they
explain *why* the code is shaped the way it is, not just what's in it.

- [`README.md`](./README.md) — how to run, configure, deploy, and contribute.
  Source of truth for env vars, ports, scripts, project layout, roadmap.
  Read this if you've just cloned the repo.
- [`docs/`](./docs) — per-area "how it works" guides. See
  [`docs/README.md`](./docs/README.md) for the index. Specifically:
  - [architecture](./docs/architecture.md) — SPA + Express + Supabase split,
    env split, refresh model.
  - [auth](./docs/auth.md) — sign-in flow, `RequireAuth`, `requireUser`.
  - [tickets](./docs/tickets.md) — lifecycle, detail dialog, audit log,
    context fields.
  - [assist](./docs/assist.md) — the Shape → refine walkthrough.
  - [server-api](./docs/server-api.md) — every `/api/*` route + how to add
    a new one.
  - [database](./docs/database.md) — schema, RLS, migrations, seed paths.
  - [frontend](./docs/frontend.md) — routing, layout, query hooks pattern.

## Always keep docs in sync with code

When a change affects how someone runs, configures, or understands the
project, update the relevant doc(s) in the **same commit**. Pick the doc
by audience:

| Change | Update |
| --- | --- |
| Env vars, scripts, ports, deploy steps, project layout | `README.md` |
| Stack or tooling swap (auth provider, AI provider, framework version) | `README.md` ("Stack") |
| Schema change (new table/column/enum value) | `README.md` ("Data model summary") + [`docs/database.md`](./docs/database.md) |
| Roadmap item shipped or new follow-up | `README.md` ("Roadmap") |
| Behavior change inside an area with a `docs/` guide | the matching `docs/<area>.md` |

If a change has no doc impact, say so explicitly when reporting the work
("no README update needed because…") so it's a deliberate decision rather
than an oversight.

## Before reporting work as done

Run all three of these and confirm they pass before saying a task is
complete (this is what CI runs on every push, see
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):

```bash
npm run lint
npx tsc -b              # client typecheck
npm test                # vitest, includes server routes via supertest
```

Server tsconfig is separate; if you've touched anything under `server/`
also run `npx tsc -p server/tsconfig.json --noEmit`.

UI changes need a real-browser smoke test — type-check + tests verify
correctness, not feature behavior. If you can't run the UI in this
session, say so explicitly rather than claiming success.

## Common pitfalls

These bite us repeatedly — check before committing.

- **`assistTypes.ts` is duplicated** between `src/lib/assistTypes.ts` and
  `server/lib/assistTypes.ts`. Client + server have separate tsconfigs;
  cross-tree imports are messy, so the types are mirrored. Change one,
  change the other in the same commit. (See [docs/assist.md](./docs/assist.md).)
- **`contextConstraints.ts` and `lockInPlan.ts` are mirrored the same way**
  — `src/lib/contextConstraints.ts` ↔ `server/lib/contextConstraints.ts`,
  `src/lib/lockInPlan.ts` ↔ `server/lib/lockInPlan.ts`. Keep them in sync
  in the same commit. The mirroring lets the server-side live evals
  import the pure helpers without crossing the src/server tsconfig
  boundary. (See
  [docs/assist.md § Planning surface affordances](./docs/assist.md#planning-surface-affordances).)
- **Every mutator must fire its `notify*Changed` event.** Lists and
  detail sections refresh via window CustomEvents, not Supabase realtime.
  If you add a new `update`/`insert`/`delete` path in `src/lib/queries.ts`
  and forget to call `notifyTicketsChanged` / `notifyAssistChanged` /
  `notifyOpenQuestionsChanged` / `notifyReferencesChanged` /
  `notifyTicketEventsChanged`, the UI silently goes stale until reload.
  (See [docs/architecture.md § state and refresh model](./docs/architecture.md#state-and-refresh-model).)
- **Never edit a shipped migration.** `supabase/migrations/*.sql` are
  applied in timestamped order; editing a merged file breaks any
  environment past it. Always create a new migration with
  `supabase migration new <name>`.
- **Regenerate `src/types/database.ts` after any schema change** with
  `supabase gen types typescript --local > src/types/database.ts`.
  Forgetting this leaves the client typed against an outdated schema.
- **`updateTicket` callers must pass `changedFields`.** That's how the
  audit log knows the prior values — `ticket_events` rows are written
  from this list, not from a server-side diff. Skip it and you skip the
  audit. (See [docs/tickets.md § updateTicket and the audit log](./docs/tickets.md#updateticket-and-the-audit-log).)
- **`req.userId` is the only trusted user identity in server routes.**
  Never accept `user_id` from the request body.
- **`assist`'s `open_questions_to_add` / `references_to_add` are
  append-only.** The model never sees row IDs; a full-list replace would
  clobber user-resolved entries. The dedupe in `runAssistTurn`
  (`src/lib/queries.ts`) is what protects this — keep it.
