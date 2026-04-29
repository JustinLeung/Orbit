-- Per-user sequential ticket numbers.
--
-- Replaces the synthesised "ORB-{first 6 hex of uuid}" label the UI used to
-- render with a real numeric column. Each user's tickets number from 1; we
-- avoid a global sequence so users don't see (or care about) anyone else's
-- counter.

alter table tickets add column short_id integer;

-- Backfill existing rows in chronological order per user. created_at, id
-- as a tiebreaker keeps the result deterministic across re-runs.
with numbered as (
  select id,
         row_number() over (
           partition by user_id
           order by created_at, id
         ) as rn
    from tickets
)
update tickets t
   set short_id = numbered.rn
  from numbered
 where t.id = numbered.id;

alter table tickets alter column short_id set not null;

create unique index tickets_user_short_id_idx
  on tickets(user_id, short_id);

-- BEFORE INSERT trigger: allocate the next per-user short_id when one isn't
-- supplied. Transaction-scoped advisory lock keyed on user_id keeps
-- concurrent inserts from racing on max+1.
create or replace function public.assign_ticket_short_id()
returns trigger
language plpgsql
as $$
declare
  v_next int;
begin
  if new.short_id is not null then
    return new;
  end if;
  perform pg_advisory_xact_lock(
    hashtext('tickets_short_id:' || new.user_id::text)
  );
  select coalesce(max(short_id), 0) + 1
    into v_next
    from tickets
   where user_id = new.user_id;
  new.short_id := v_next;
  return new;
end;
$$;

create trigger tickets_assign_short_id
  before insert on tickets
  for each row execute function public.assign_ticket_short_id();
