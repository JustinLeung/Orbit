# Server / `/api/*`

The Express server (`server/index.ts`) does two things in production:

1. Mounts every `/api/*` route.
2. Serves the Vite SPA out of `../dist` (and SPA-falls-back unknown paths to `index.html`).

In development, only #1 runs — Vite serves the SPA on `:5173` and proxies `/api/*` to the Express process on `:3000`.

## Boot sequence

```ts
// server/index.ts
app.use(express.json())

app.get('/healthz', (_req, res) => res.send('ok'))      // Render health check

app.use('/api/send-email',         sendEmailRoute)
app.use('/api/auth/send-otp',      sendOtpRoute)
app.use('/api/assist/walkthrough', requireUser(), assistWalkthroughRoute)

app.use(express.static(distPath))
app.get('*', (_req, res) => res.sendFile(`${distPath}/index.html`))
```

`/healthz` is wired in `render.yaml` as the health endpoint. It must stay cheap and dependency-free — don't add a DB ping here.

The SPA fallback lives **after** `/api/*` so unknown API paths surface as JSON 404s from `app.get('*', ...)` would otherwise return `index.html` and confuse callers. (Actually with the current ordering an unmatched `/api/foo` GET *will* hit the catch-all and serve HTML — fine for now since no routes return HTML, but worth knowing.)

## Routes

### `POST /api/send-email`

Generic Resend send. Body: `{ to, subject, html }`. Returns `{ id }` on success.

- `400` — missing fields.
- `503` — `RESEND_API_KEY` not set (deployment misconfig).
- `500` — anything else from Resend.

`server/routes/send-email.ts`. Tests in `send-email.test.ts`.

This route isn't protected because it's not currently used from the client app (the OTP route is the only Resend caller in practice). If you start exposing it to the SPA, gate it with `requireUser()` and validate `to` against the caller — otherwise it's an open relay.

### `POST /api/auth/send-otp`

Mints a magic-link + 6-digit code via Supabase admin and sends them in a single email through Resend. See [auth.md](./auth.md#sign-in-flow-email) for the user-facing sequence.

Request body: `{ email, redirectTo? }`.

Behaviour:
1. Validates email shape with a small regex.
2. Calls `admin.auth.admin.generateLink({ type: 'magiclink', email })`. If Supabase returns `user_not_found` (`status === 404` or matching message), retries with `{ type: 'signup', password: randomUUID() }` so brand-new users can sign in.
3. Renders a single email containing both `email_otp` and `action_link` (`renderEmail` / `renderText`).
4. **Dev fallback**: with `RESEND_API_KEY` unset and `NODE_ENV !== 'production'`, prints the code + link to the server terminal and returns `{ ok: true, dev: true }`. Lets local dev work end-to-end with no email infra.
5. Otherwise sends via Resend.

Status codes:
- `400` — invalid email.
- `503` — `SUPABASE_SERVICE_ROLE_KEY` missing, or Resend says "RESEND_API_KEY not configured."
- `500` — Supabase admin error or any other Resend failure.

The route is **unauthenticated by design** — anyone needs to be able to start sign-in. Rate-limiting is left to the upstream (Supabase admin + Resend will both push back if abused).

`server/routes/send-otp.ts`. Tests in `send-otp.test.ts`.

### `POST /api/assist/walkthrough`

The Gemini-backed structured assist endpoint. Gated by `requireUser()`. See [assist.md](./assist.md) for the full state machine; this section just covers the wire contract.

Request:
```ts
{
  ticket: TicketSnapshot,        // { title, type, status, goal, description, ...DoD/OQs/refs }
  state?: AssistState | null,    // null on the first turn
  user_message?: string | null,
  advance?: boolean              // user clicked "Continue" — bump phase before running
}
```

Response:
```ts
{
  state: AssistState,            // updated state (always written back by the client into agent_runs)
  assistant_message: string,
  ready_to_advance: boolean,
  ticket_updates?: TicketUpdates // sanitized; client decides whether to apply
}
```

Status codes:
- `400` — `ticket.title` missing.
- `401` — bad/missing bearer.
- `503` — `GEMINI_API_KEY` not configured.
- `502` — Gemini returned empty text or malformed JSON, or omitted `assistant_message`.
- `500` — generic Gemini failure.

Special case: if `advance: true` would push the phase to `'done'`, the route short-circuits with a canned wrap-up message and skips the model call entirely (`server/routes/assist-walkthrough.ts:444-462`).

`ticket_updates` is **sanitized** before returning (drops empty strings, drops invalid `next_action_at`, drops empty arrays). The client still re-checks every value against the current ticket before applying, so it's defense in depth.

## Server libs

### `server/lib/supabaseAdmin.ts`

Lazy-loads a service-role Supabase client. Server-only — this key bypasses RLS.

### `server/lib/requireUser.ts`

Auth middleware for protected `/api` routes. See [auth.md § "Authenticating server-side requests"](./auth.md#authenticating-server-side-requests). Augments the Express `Request` type to add `userId` / `userEmail`.

### `server/lib/resend.ts`

Singleton Resend client + `sendEmail()` helper. Returns a structured `{ error: { message } }` shape (instead of throwing) so routes can map specific errors to specific HTTP codes. `__resetResendForTests` exists so tests can flip env vars between cases.

### `server/lib/gemini.ts`

Singleton `@google/genai` client and the model id (`gemini-2.5-flash`). Returns `null` if `GEMINI_API_KEY` isn't set so the route can return `503` cleanly.

### `server/lib/assistTypes.ts`

Mirror of `src/lib/assistTypes.ts` (`AssistState`, `Shape`, `Position`, etc.). Keep them in sync — there's a comment at the top of each file pointing at the other.

## Tests

Server-side tests use `supertest` against the Express app. Coverage today:

- `send-email.test.ts` — error paths.
- `send-otp.test.ts` — happy + dev fallback paths.
- `requireUser.test.ts` — 401 on missing/bad bearer, success attaches `req.userId`.
- `assist-walkthrough.test.ts` — happy turn + 503 when `GEMINI_API_KEY` is unset.

Tests use `__resetResendForTests()` / `__resetGeminiForTests()` between cases since the singletons cache an env-keyed client. If you cache another env-keyed singleton, add a similar reset helper.

## Adding a new route

1. Create `server/routes/<name>.ts` exporting a `Router`.
2. Mount it in `server/index.ts`. Decide: gated by `requireUser()`?
3. Decide: does it need a secret? If yes, read the env var lazily inside a singleton getter (like `getGemini`/`getResend`) so tests can flip env vars between cases.
4. Write a sibling `<name>.test.ts` with `supertest`.
5. If the route reads or writes user-owned data, **always** prefer `req.userId` to anything in the request body.
