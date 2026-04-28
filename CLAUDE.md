# Claude working notes for Orbit

## Always keep docs in sync with code

Whenever you make a change that affects how someone runs, configures, or
understands the project, update the docs in the **same commit** as the code.
This includes:

- New or changed env vars → update `README.md` ("Environment variables") and
  `.env.local.example`.
- New scripts, ports, or services → update `README.md` ("Quick start",
  "Local Supabase ports", or "Common workflows").
- New top-level directories or important files → update the "Project layout"
  section of `README.md`.
- Schema changes (new table, column, enum value) → update the "Data model
  summary" in `README.md` and ensure `PLAN.md` still reflects reality.
- Stack or tooling swaps (auth provider, AI provider, framework version) →
  update both `README.md` and the "Stack (decided)" section of `PLAN.md`.
- Roadmap items shipped → tick them off in `README.md`'s "Roadmap" and
  expand `PLAN.md` if a follow-up emerged.

If a change has no doc impact, say so explicitly when reporting the work
("no README update needed because…") so it's a deliberate decision rather
than an oversight.

The two source-of-truth docs are:

- `README.md` — how to run, configure, and contribute. Reader is a new
  developer cloning the repo.
- `PLAN.md` — product spec and MVP scope. Reader wants to know *what* Orbit
  is and what's intentionally out of scope.
