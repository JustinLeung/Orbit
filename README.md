# Orbit

A personal ticketing system for managing open loops — tasks, follow-ups, decisions, research, admin work, and relationships.

Every commitment becomes a ticket with a state, next action, history, and optional AI agent support.

> **Tagline:** Keep every open loop in motion.

See [`PLAN.md`](./PLAN.md) for the full MVP product and data-model spec.

---

## Stack

| Layer    | Choice                                                |
| -------- | ----------------------------------------------------- |
| Frontend | Vite + React + TypeScript                             |
| Styling  | Tailwind CSS v4 + shadcn/ui (Nova preset — Geist + Lucide) |
| Routing  | React Router                                          |
| Server   | Node + Express (serves the Vite build and `/api/*` routes) |
| Backend  | Supabase (Postgres + Auth + Edge Functions)           |
| Auth     | Email OTP via Supabase Auth (Google OAuth temporarily disabled — see ORB-5) |
| AI       | Gemini, called server-side via Supabase Edge Function (Assist mode only for MVP) |
| Email    | Resend, called from the Express server (`/api/send-email`) |
| Hosting  | Render (Web Service, Node runtime)                    |

---

## Prerequisites

- **Node.js** ≥ 20 (project tested on 25)
- **npm** ≥ 10
- **Docker Desktop** — required for the local Supabase stack
- **Supabase CLI** — `brew install supabase/tap/supabase`
- A Gemini API key for the Assist agent (optional until Assist mode is wired)

> Auth in dev: email OTP only — sign-in emails land in the local Mailpit
> mailbox at <http://127.0.0.1:54424>. The 6-digit code is also logged to the
> browser devtools console for convenience. Production also uses email OTP
> only for now; the Google sign-in button is hidden until ORB-5 (post-OAuth
> redirect lands on localhost instead of orbit-app.cc) is fixed.

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/JustinLeung/Orbit.git
cd Orbit

# 2. Install JS deps
npm install

# 3. Create env file
cp .env.example .env
# then edit .env — see "Environment variables" below

# 4. Boot the local Supabase stack (applies migrations automatically)
supabase start

# 5. Run the app (two processes — Vite + Express)
npm run dev          # Vite on :5173
npm run dev:server   # Express on :3000 (handles /api/*)
```

App: <http://localhost:5173>
API: <http://localhost:3000> (proxied from Vite at `/api`)
Studio: <http://127.0.0.1:54423>

### Stopping

```bash
supabase stop          # tears down the local Postgres + Auth containers
```

---

## Environment variables

Defined in `.env` (git-ignored). Template lives in `.env.example`.

| Variable                              | Used by              | Notes                                                                |
| ------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                   | Browser              | Local default: `http://127.0.0.1:54421`. Inlined at build time.      |
| `VITE_SUPABASE_ANON_KEY`              | Browser              | Printed by `supabase status -o env` after `supabase start`. Inlined at build time. |
| `SUPABASE_SERVICE_ROLE_KEY`           | Seed script          | Bypasses RLS — only used by `npm run seed` locally. Never expose to the browser.   |
| `GEMINI_API_KEY`                      | Edge Function (TBD)  | Stays server-side; never exposed to the browser                      |
| `PORT`                                | Express server       | Local dev default `3000`. Render injects this in production.         |
| `RESEND_API_KEY`                      | Express server       | Used by `/api/send-email`. Server-side only.                         |
| `RESEND_FROM`                         | Express server       | Verified Resend sender, e.g. `Orbit <noreply@yourdomain.com>`        |

### Signing in (dev)

1. Enter your email on the login page and click **Send code**.
2. Grab the 6-digit code from the browser devtools console, or read it from
   the latest message in Mailpit at <http://127.0.0.1:54424>.
3. Paste the code into the form and click **Verify code**.

---

## Local Supabase ports

To avoid conflicts with other Supabase projects, ports are remapped from the defaults:

| Service     | Default | Orbit  |
| ----------- | ------- | ------ |
| API         | 54321   | 54421  |
| DB          | 54322   | 54422  |
| Studio      | 54323   | 54423  |
| Mailpit    | 54324   | 54424  |
| Pooler      | 54329   | 54429  |
| Analytics   | 54327   | 54427  |
| Shadow DB   | 54320   | 54420  |

Port assignments live in `supabase/config.toml`.

---

## Project layout

```
src/
  components/
    auth/            # RequireAuth route guard
    layout/          # AppLayout (sidebar) + PageHeader
    ui/              # shadcn/ui primitives (button, ...)
  lib/
    auth.tsx         # AuthProvider + useAuth hook
    supabase.ts      # typed Supabase client
    utils.ts         # cn() + small helpers
  pages/             # one file per view: Inbox, Now, Waiting, Follow-Up, Review, Stuck, People, Login
  types/
    database.ts      # generated by `supabase gen types`
    orbit.ts         # ergonomic aliases (Ticket, Person, AgentRun, …)
server/
  index.ts           # Express app — serves dist/ and mounts /api/*
  routes/
    send-email.ts    # POST /api/send-email — Resend
  tsconfig.json      # builds to dist-server/ for `npm start`
scripts/
  seed.ts            # `npm run seed` — populates the local DB with sample tickets
supabase/
  config.toml        # local stack config (ports, auth providers)
  migrations/        # SQL migrations applied on `supabase start`
render.yaml          # Render Blueprint — Web Service config
```

---

## Data model summary

Six tables, all scoped by `user_id` with RLS so the same schema works single- or multi-user:

- `tickets` — the core entity
- `people` — anyone tied to a ticket
- `ticket_participants` — many-to-many between tickets and people
- `ticket_relations` — `relates_to` and `blocked_by` links between tickets
- `ticket_events` — append-only history (status changes, notes, agent runs, …)
- `agent_runs` — Assist-mode outputs awaiting your review

Full schema: [`supabase/migrations/`](./supabase/migrations).

---

## Common workflows

### Regenerate TypeScript types after a schema change

```bash
supabase gen types typescript --local > src/types/database.ts
```

### Create a new migration

```bash
supabase migration new <name>          # writes a timestamped SQL file
# edit it, then:
supabase db reset                      # rebuilds the local DB from migrations
```

### Seed the local DB with sample tickets

```bash
# Sign in once at http://localhost:5173/login so a Supabase user exists,
# then put SERVICE_ROLE_KEY (from `supabase status -o env`) into .env as
# SUPABASE_SERVICE_ROLE_KEY, and run:
npm run seed                          # seeds for justin@justinleung.net by default
npm run seed -- alice@example.com     # seeds for a different user
```

Wipes existing tickets + people for the target user, then inserts a spread
across every status (inbox, active, waiting, follow_up, review, closed,
dropped) plus a few people, participants, and history events.

### Type-check the frontend

```bash
npx tsc -b
```

### Build for production

```bash
npm run build         # Vite build (dist/) + tsc on server/ (dist-server/)
npm start             # node dist-server/index.js — serves dist/ and /api/*
```

---

## Deploying to Render

Orbit deploys as a single **Web Service** on Render — Express serves both the
React build and `/api/*` routes, so there's one URL and one process.

1. Push to GitHub and create a new Web Service from the repo. Render reads
   [`render.yaml`](./render.yaml) and configures itself.
2. In the Render dashboard → **Environment**, set:
   - `VITE_SUPABASE_URL` (hosted Supabase project URL)
   - `VITE_SUPABASE_ANON_KEY` (hosted anon key)
   - `RESEND_API_KEY`
   - `RESEND_FROM` (e.g. `Orbit <noreply@yourdomain.com>`)

   `VITE_*` vars are inlined at build time, so changing them requires a redeploy.
3. Health check is wired to `/healthz`. Build runs `npm ci && npm run build`;
   start runs `npm start`.
4. **Supabase migration** (one-time): `supabase link --project-ref <ref>` then
   `supabase db push`. Add the Render URL to **Auth → URL Configuration** in
   the Supabase dashboard so the Google OAuth redirect is accepted.
5. **Google OAuth** (one-time): in the Supabase dashboard enable the Google
   provider with a client ID/secret from Google Cloud, and add the Render URL
   to the OAuth client's "Authorized redirect URIs" alongside
   `https://<your-supabase-ref>.supabase.co/auth/v1/callback`.
6. **Resend**: verify your sending domain in the Resend dashboard before
   production traffic.

---

## Roadmap (post-scaffold)

- Ticket creation form + Inbox list
- Ticket detail view with history (`ticket_events`)
- Status transitions + computed views (Now, Waiting, Stuck)
- People CRUD + per-person ticket list
- Edge Function: Assist mode → Gemini, writing into `agent_runs`
- Review queue UI for agent output

See [`PLAN.md`](./PLAN.md) for what's *intentionally* out of scope for MVP.
