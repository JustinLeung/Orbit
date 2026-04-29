# Database (Supabase + Postgres)

Schema lives entirely in `supabase/migrations/`, versioned and applied by `supabase db reset` (rebuilds from scratch) or `supabase start` (applies new ones to a running stack). All eight user-facing tables are scoped by `user_id` with RLS so the same schema works single-user (Justin) or multi-user later, with no fork.

For the canonical field list per table, see `PLAN.md` § Core Data Models. This doc covers operational concerns: what's in each migration, how RLS is shaped, the onboarding seed RPC, and the dev seed script.

## Tables

| Table | Purpose |
| --- | --- |
| `tickets` | The core entity. `definition_of_done` (jsonb) lives here. |
| `people` | Anyone tied to a ticket. |
| `ticket_participants` | M:N between `tickets` and `people`. |
| `ticket_relations` | `relates_to` and `blocked_by` links between tickets. |
| `ticket_events` | Append-only history. Drives the activity timeline + audit. |
| `ticket_open_questions` | Per-ticket unresolved unknowns; resolution turns it into a decisions log. |
| `ticket_references` | Typed pointers to source material (`link`/`snippet`/`attachment`/`email`/`other`). |
| `agent_runs` | Assist outputs. Currently doubles as the assist state log (see [assist.md](./assist.md#why-agent_runs-holds-the-state)). |

Plus the enums: `ticket_type`, `ticket_status`, `agent_mode`, `agent_status`, `ticket_event_type`, `ticket_relation_type`, `ticket_reference_kind`.

## RLS shape

Every owner-data table has the same shape of policy:

```sql
create policy "<table>: owner all"
  on <table>
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Single policy per table, both read and write, key off `auth.uid()`. The browser uses the anon key + RLS for everything except the few admin operations gated through Express.

Indexes are minimal but deliberate (`supabase/migrations/20260428205127_init_schema.sql`):
- `(user_id, status)` for the per-status pages.
- `(user_id, next_action_at)` for the Now query.
- `(ticket_id, created_at desc)` on `ticket_events` and `agent_runs` for newest-first reads.

## Migration history

Migrations are timestamped; each adds a focused chunk:

| File | What it does |
| --- | --- |
| `20260428205127_init_schema.sql` | Initial 6 tables, enums, RLS policies, indexes. |
| `20260428230000_seed_onboarding_tickets.sql` | The `seed_onboarding_tickets()` RPC. |
| `20260428232204_add_field_updated_event.sql` | Adds `field_updated` to `ticket_event_type` so generic field edits get audited. |
| `20260429064856_add_ticket_context_fields.sql` | Adds `tickets.definition_of_done` (jsonb), `ticket_open_questions`, `ticket_references`. |
| `20260429070500_update_onboarding_with_context.sql` | Re-creates the onboarding seed so it demonstrates the new context fields. |

Always create a new migration file rather than editing an old one once it's merged — `supabase db reset` runs them in order, and editing a deployed migration breaks any environment that's already past it.

## Two ways to seed

### Production: `seed_onboarding_tickets()` RPC

A `security definer` Postgres function (`supabase/migrations/2026...230000_...sql`) that:

1. Pulls `auth.uid()` and rejects anonymous callers.
2. No-ops if the user already has any tickets (`exists (select 1 from tickets where user_id = v_user_id)`).
3. Inserts ~6 helper tickets that demonstrate Inbox / Now / Waiting / Follow-up plus a Decision and a Research example, each with relevant context fields populated (DoD, open questions, a reference snippet).

Why `security definer`: we need to insert without depending on the RLS policy at insert time, and we still derive `user_id` from `auth.uid()` so it's safe — anonymous calls error out.

The browser calls it with `supabase.rpc('seed_onboarding_tickets')` on every `SIGNED_IN` event in **production only** (`src/lib/auth.tsx:18-25`). Idempotency makes the re-fire-on-every-sign-in safe.

### Dev: `npm run seed`

`scripts/seed.ts` populates the local DB with a much richer fixture set for development. It:

1. Reads `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env` and creates a service-role client.
2. Looks up the target user by email (default: `justin@justinleung.net`, override with `npm run seed -- alice@example.com`).
3. **Wipes** all existing tickets + people for that user, then inserts a spread across every status (`inbox`, `active`, `waiting`, `follow_up`, `review`, `closed`, `dropped`) plus a few people, participants, and history events.

Pre-req: the target user must already exist in Supabase Auth — sign in once at `/login` to create them.

Use cases:
- Reset to a known-good fixture set when iterating on UI.
- Demonstrate states the production onboarding RPC doesn't cover (Stuck, agent runs, ticket relations).

Don't run this against the hosted DB — it wipes user data.

## Regenerating types

After any schema change, regenerate the TypeScript types so the client + server stay in sync:

```bash
supabase gen types typescript --local > src/types/database.ts
```

Ergonomic aliases (`Ticket`, `Person`, `AgentRun`, etc.) live in `src/types/orbit.ts` and re-export the generated `Row`/`Insert`/`Update` shapes under friendlier names.

## Common workflows

```bash
# New migration
supabase migration new <name>          # writes a timestamped SQL file
supabase db reset                      # rebuild local DB from migrations

# Push to hosted Supabase (one-time link first)
supabase link --project-ref <ref>
supabase db push

# Inspect locally
supabase status                        # ports + keys for the running stack
supabase status -o env                 # dump as env-var lines
open http://127.0.0.1:54423            # Supabase Studio
```

Local Postgres is on `:54422` (see README "Local Supabase ports"). Connect with any Postgres client using the credentials from `supabase status`.
