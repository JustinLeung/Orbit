# Auth

Auth lives across three places:

- **Supabase Auth** — owns the user record, sessions, JWTs, and Google OAuth.
- **`src/lib/auth.tsx`** — the `AuthProvider` component that exposes session state and sign-in/out helpers to the React tree (`useAuth` hook in `src/lib/useAuth.ts`).
- **`server/routes/send-otp.ts` + `server/lib/requireUser.ts`** — the privileged server-side bits: minting sign-in links and verifying access tokens on protected `/api/*` routes.

## Sign-in flow (email)

The login form supports two equivalent entry points in one email: a 6-digit code *and* a magic link. The user picks whichever is convenient.

```
Browser (LoginPage)                 Express                       Supabase Admin    Resend
        │                              │                                │              │
        │  POST /api/auth/send-otp     │                                │              │
        │     { email, redirectTo }    │                                │              │
        ├─────────────────────────────►│                                │              │
        │                              │  admin.generateLink(magiclink) │              │
        │                              ├───────────────────────────────►│              │
        │                              │  ◄── { action_link, email_otp }│              │
        │                              │  (if user_not_found, retry as  │              │
        │                              │   type:'signup' with random pw)│              │
        │                              │                                │              │
        │                              │  sendEmail(html with code+link)│              │
        │                              ├───────────────────────────────────────────────►│
        │  ◄── { ok: true }            │                                │              │
        │                              │                                │              │
        │   user enters 6-digit code   │                                │              │
        │   ─────────────────────────────► supabase.auth.verifyOtp(...) │              │
        │   OR clicks magic link  ───────► Supabase auth callback  ─────►              │
        │                                                                              │
        │   AuthProvider's onAuthStateChange fires → session set in React              │
```

Why we run our own send instead of letting Supabase send the email:

- Supabase's default email templates don't expose the OTP and the magic link in one message — we want both so the same email works on a phone, an inbox-on-laptop, or a copy-pasted code.
- The dev fallback is much friendlier: with `RESEND_API_KEY` unset, `send-otp.ts` logs the code + link to the Express terminal so you don't need to hook up email at all to develop locally (`server/routes/send-otp.ts:67-72`).

`auth.tsx`'s `sendOtp` just `fetch`es `/api/auth/send-otp` and surfaces the error string back to the form (`src/lib/auth.tsx:34-61`). `verifyOtp` calls `supabase.auth.verifyOtp` directly — no server hop needed because the OTP itself is the proof.

## Sign-in flow (Google)

Pure Supabase OAuth: `signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`. Supabase handles the redirect back, the session lands via `onAuthStateChange`, no Express involvement (`src/lib/auth.tsx:70-76`).

The Google client must be configured once in the Supabase dashboard and the production URL added to its "Authorized redirect URIs" — see README's "Deploying to Render" §5.

## Session in the React tree

`AuthProvider` (`src/lib/auth.tsx`) holds `{ session, user, loading }` in component state. It boots by calling `supabase.auth.getSession()` once and then subscribes to `onAuthStateChange` for the lifetime of the app.

Two side-effects worth noting:

- **`SIGNED_IN` in production** triggers the `seed_onboarding_tickets()` RPC. The function is `security definer`, idempotent (no-ops if the user already has tickets), and authoritative on the user from `auth.uid()` — so re-firing on every sign-in is safe (`src/lib/auth.tsx:18-25`). Dev keeps using `npm run seed`.
- The provider component file (`auth.tsx`) only exports the component; the context object + `useAuth` hook are co-located in a sibling file (`src/lib/useAuth.ts`). This split exists to keep the provider file react-fast-refresh friendly.

Route gating is one component: `RequireAuth` (`src/components/auth/RequireAuth.tsx`) wraps the authenticated tree and bounces to `/login` when there's no session. `App.tsx` mounts it once at the layout root, so every page inherits the guard.

## Authenticating server-side requests

The only protected `/api` route today is `/api/assist/walkthrough`. The contract is:

1. Browser includes `Authorization: Bearer <session.access_token>` (see `runAssistTurn` in `src/lib/queries.ts:362-381`).
2. `requireUser()` middleware (`server/lib/requireUser.ts`):
   - Pulls the bearer token off the header.
   - Calls `admin.auth.getUser(token)` against the service-role client. This validates the JWT signature and expiry server-side — we don't trust the client's claim about who they are.
   - On success, attaches `req.userId` (and `req.userEmail` if present) for the route handler.
   - On any failure, returns `401 { error: '...' }` with no leakage of why.

The middleware also returns `503` if `SUPABASE_SERVICE_ROLE_KEY` is missing — that's a deployment misconfiguration, not a user error.

`/api/send-email` and `/api/auth/send-otp` are **not** behind `requireUser`. They're rate-limit-shaped by their nature (anyone can already trigger Resend by claiming any email, and we want unauth'd users to be able to start sign-in). If you add a route that talks to user-owned data, gate it.

## Adding a new protected route

```ts
// server/index.ts
app.use('/api/my-thing', requireUser(), myThingRoute)
```

Then in your route handler use `req.userId` as the authoritative caller identity. Don't accept a `user_id` from the request body — clients can lie.
