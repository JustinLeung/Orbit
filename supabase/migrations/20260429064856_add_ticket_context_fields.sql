-- Structured context fields for ORB-21:
--   tickets.definition_of_done — jsonb checklist of {item, done}[]
--   ticket_open_questions      — explicit unresolved unknowns
--   ticket_references          — typed pointers to source material
--
-- The DoD lives on tickets because it is a small ordered list owned 1:1
-- by the ticket; the others are first-class child tables so each entry
-- has its own timestamps and can be resolved/edited independently.

-- definition_of_done -------------------------------------------------------

alter table tickets
  add column definition_of_done jsonb not null default '[]'::jsonb;

-- ticket_open_questions ----------------------------------------------------

create table ticket_open_questions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  asked_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_open_questions_ticket_id_idx
  on ticket_open_questions(ticket_id, asked_at desc);
create index ticket_open_questions_unresolved_idx
  on ticket_open_questions(ticket_id) where resolved_at is null;
create index ticket_open_questions_user_id_idx on ticket_open_questions(user_id);

create trigger ticket_open_questions_set_updated_at
  before update on ticket_open_questions
  for each row execute function set_updated_at();

-- ticket_references --------------------------------------------------------

create type ticket_reference_kind as enum (
  'link',
  'snippet',
  'attachment',
  'email',
  'other'
);

create table ticket_references (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind ticket_reference_kind not null default 'link',
  url_or_text text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_references_ticket_id_idx
  on ticket_references(ticket_id, created_at);
create index ticket_references_user_id_idx on ticket_references(user_id);

create trigger ticket_references_set_updated_at
  before update on ticket_references
  for each row execute function set_updated_at();

-- RLS ----------------------------------------------------------------------

alter table ticket_open_questions enable row level security;
alter table ticket_references enable row level security;

create policy "ticket_open_questions: owner all"
  on ticket_open_questions for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ticket_references: owner all"
  on ticket_references for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
