-- Orbit MVP initial schema
-- All tables are user-scoped via user_id + RLS so a single Supabase project
-- could later host multiple users without schema changes.

create extension if not exists "pgcrypto";

-- enums --------------------------------------------------------------------

create type ticket_type as enum (
  'task',
  'research',
  'decision',
  'waiting',
  'follow_up',
  'admin',
  'relationship'
);

create type ticket_status as enum (
  'inbox',
  'active',
  'waiting',
  'follow_up',
  'review',
  'closed',
  'dropped'
);

create type agent_mode as enum (
  'none',
  'assist',
  'semi_auto',
  'auto'
);

create type agent_status as enum (
  'idle',
  'running',
  'awaiting_review',
  'error'
);

create type ticket_event_type as enum (
  'ticket_created',
  'status_changed',
  'note_added',
  'agent_ran',
  'agent_output_created',
  'user_feedback_given',
  'next_action_updated',
  'artifact_created',
  'participant_added',
  'ticket_closed',
  'ticket_dropped'
);

create type ticket_relation_type as enum (
  'relates_to',
  'blocked_by'
);

-- updated_at helper --------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- people -------------------------------------------------------------------

create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  organization text,
  email text,
  relationship_tags text[] not null default '{}',
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index people_user_id_idx on people(user_id);
create index people_email_idx on people(user_id, email) where email is not null;

create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

-- tickets ------------------------------------------------------------------

create table tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  type ticket_type not null default 'task',
  status ticket_status not null default 'inbox',
  goal text,
  next_action text,
  next_action_at timestamptz,
  human_owner text,
  waiting_on text,
  urgency smallint check (urgency between 1 and 5),
  importance smallint check (importance between 1 and 5),
  energy_required smallint check (energy_required between 1 and 5),
  context text,
  agent_mode agent_mode not null default 'none',
  agent_status agent_status not null default 'idle',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index tickets_user_id_idx on tickets(user_id);
create index tickets_user_status_idx on tickets(user_id, status);
create index tickets_user_next_action_idx on tickets(user_id, next_action_at)
  where status = 'active';

create trigger tickets_set_updated_at
  before update on tickets
  for each row execute function set_updated_at();

-- ticket participants (many-to-many tickets <-> people) --------------------

create table ticket_participants (
  ticket_id uuid not null references tickets(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, person_id)
);

create index ticket_participants_user_id_idx on ticket_participants(user_id);
create index ticket_participants_person_id_idx on ticket_participants(person_id);

-- ticket relations (related_tickets + blocked_by) --------------------------

create table ticket_relations (
  ticket_id uuid not null references tickets(id) on delete cascade,
  related_ticket_id uuid not null references tickets(id) on delete cascade,
  relation_type ticket_relation_type not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, related_ticket_id, relation_type),
  check (ticket_id <> related_ticket_id)
);

create index ticket_relations_user_id_idx on ticket_relations(user_id);
create index ticket_relations_related_idx on ticket_relations(related_ticket_id);

-- ticket_events (append-only history) --------------------------------------

create table ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type ticket_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index ticket_events_ticket_id_idx on ticket_events(ticket_id, created_at desc);
create index ticket_events_user_id_idx on ticket_events(user_id);

-- agent_runs ---------------------------------------------------------------

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input_context jsonb not null default '{}'::jsonb,
  output text,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  suggested_state ticket_status,
  needs_feedback boolean not null default false,
  user_feedback text,
  created_at timestamptz not null default now()
);

create index agent_runs_ticket_id_idx on agent_runs(ticket_id, created_at desc);
create index agent_runs_user_id_idx on agent_runs(user_id);
create index agent_runs_needs_feedback_idx on agent_runs(user_id)
  where needs_feedback;

-- RLS ----------------------------------------------------------------------

alter table people enable row level security;
alter table tickets enable row level security;
alter table ticket_participants enable row level security;
alter table ticket_relations enable row level security;
alter table ticket_events enable row level security;
alter table agent_runs enable row level security;

create policy "people: owner all"
  on people for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "tickets: owner all"
  on tickets for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ticket_participants: owner all"
  on ticket_participants for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ticket_relations: owner all"
  on ticket_relations for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "ticket_events: owner all"
  on ticket_events for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "agent_runs: owner all"
  on agent_runs for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
