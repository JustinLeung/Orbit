# Orbit — MVP Build Plan

## Product Summary

Orbit is a personal ticketing system for managing open loops: tasks, follow-ups, decisions, research, admin work, and relationships.

Core idea: every commitment is a ticket with a state, next action, history, and optional AI agent support.

Tagline: Keep every open loop in motion.

---

## Stack (decided)

- Vite + React + TypeScript (SPA)
- Tailwind CSS v4 + shadcn/ui (Nova preset — Geist + Lucide)
- React Router
- Node + Express server (serves the Vite build and `/api/*` routes)
- Supabase (local CLI for dev, hosted later) — ports remapped to 544xx (see supabase/config.toml)
- Auth: Email OTP (6-digit code, via Supabase Auth)
- AI: Gemini (Assist mode only for MVP, called from the Express server — `/api/assist/clarify` for ticket capture)
- Email: Resend, called from the Express server (`/api/send-email`)
- Hosting: Render (Web Service, Node runtime)

---

## MVP Goal

Build the smallest useful version of Orbit:

1. Manual personal ticketing
2. Clear ticket states
3. Next-action tracking
4. People/participants attached to tickets
5. Basic agent assist mode
6. Review workflow for agent outputs

Do not build full automation, external integrations, or autonomous agents yet.

---

## Core Data Models

### Ticket

Fields:

- `id`
- `title`
- `description`
- `type`
- `status`
- `goal`
- `next_action`
- `next_action_at`
- `human_owner`
- `waiting_on`
- `participants` (via `ticket_participants` junction)
- `related_tickets` / `blocked_by` (via `ticket_relations` junction)
- `urgency`
- `importance`
- `energy_required`
- `context`
- `agent_mode`
- `agent_status`
- `created_at`
- `updated_at`
- `closed_at`

### Ticket Types

Enum:

- `task`
- `research`
- `decision`
- `waiting`
- `follow_up`
- `admin`
- `relationship`

### Ticket Statuses

Enum:

- `inbox`
- `active`
- `waiting`
- `follow_up`
- `review`
- `closed`
- `dropped`

### Person

Fields:

- `id`
- `name`
- `organization`
- `email`
- `relationship_tags`
- `notes`
- `last_interaction_at`
- `created_at`
- `updated_at`

### TicketEvent

Append-only log for ticket history.

Fields:

- `id`
- `ticket_id`
- `event_type`
- `payload` (jsonb)
- `created_at`

Event types:

- `ticket_created`
- `status_changed`
- `note_added`
- `agent_ran`
- `agent_output_created`
- `user_feedback_given`
- `next_action_updated`
- `field_updated` — generic per-field edit; payload `{field, old, new}`
- `artifact_created`
- `participant_added`
- `ticket_closed`
- `ticket_dropped`

### AgentRun

Fields:

- `id`
- `ticket_id`
- `input_context` (jsonb)
- `output`
- `confidence`
- `suggested_state`
- `needs_feedback`
- `user_feedback`
- `created_at`

---

## Core Views

### Inbox

Tickets with `status = inbox`. Captured but not clarified.

### Now

Tickets requiring user action.
- `status = active` and `next_action_at <= today`
- `status = review`

### Waiting

Tickets with `status = waiting`. Group/filter by `waiting_on`.

### Follow-Up

Tickets with `status = follow_up`.

### Review Agent Work

Tickets with `status = review` or agent runs where `needs_feedback = true`.

### Stuck

Tickets matching one or more:

- no `next_action`
- active and not updated in 7+ days
- waiting and `next_action_at` is overdue
- review and not updated in 3+ days

### People

List people and show related open tickets.

---

## Agent System MVP

Only `Assist` mode for MVP.

### Agent Modes

Enum:

- `none`
- `assist`
- `semi_auto`
- `auto`

For MVP: `none`, `assist`.

### Assist Mode Can

- ask clarifying questions during ticket capture and draft the resulting ticket (shipped — `/api/assist/clarify`)
- summarize ticket
- suggest next action
- draft follow-up message
- audit current ticket state
- score next-action clarity
- ask for feedback

### Assist Mode Cannot

- send messages
- close tickets automatically
- contact people
- make irreversible changes
- execute external actions

---

## Agent Loop

Each manual agent run should follow:

```text
Understand → Plan → Act → Evaluate → Ask
```
