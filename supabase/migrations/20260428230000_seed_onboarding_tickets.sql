-- Onboarding seed for new users (ORB-17).
--
-- Creates a small set of helper tickets that demonstrate Orbit's core
-- concepts to a brand-new user. Called as an RPC from the client on
-- sign-in (gated to production there). The function itself is idempotent
-- and safe to call repeatedly: it no-ops if the user already has any
-- tickets.
--
-- security definer so it can write rows on behalf of the calling user
-- without depending on the RLS policy at insert time. We still derive
-- user_id from auth.uid() and reject anonymous calls.

create or replace function public.seed_onboarding_tickets()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_inserted int := 0;
begin
  if v_user_id is null then
    raise exception 'seed_onboarding_tickets requires an authenticated user';
  end if;

  if exists (select 1 from tickets where user_id = v_user_id) then
    return 0;
  end if;

  with inserted as (
    insert into tickets
      (user_id, title, type, status, goal, description, next_action,
       next_action_at, waiting_on, urgency, importance)
    values
      (v_user_id,
       '👋 Welcome to Orbit — start here',
       'task', 'inbox',
       'Read this to learn what Orbit is for.',
       'Orbit is a personal ticketing system for managing open loops. ' ||
       'Every commitment becomes a ticket with a state, a next action, ' ||
       'and a history.' || E'\n\n' ||
       'The sidebar groups tickets by where they sit in your life: ' ||
       'Inbox (captured but not yet clarified), Now (what to do today), ' ||
       'Waiting (parked on someone else), Follow-up (re-surface later), ' ||
       'Review (agent output to confirm), and Stuck (loops that have ' ||
       'gone quiet).' || E'\n\n' ||
       'These onboarding tickets are yours to play with. Drop them by ' ||
       'changing their status to Dropped once you feel oriented.',
       'Open this ticket, read the description, then move on to the next.',
       null, null, 2, 4),
      (v_user_id,
       'Try clarifying a ticket — pick a next action',
       'task', 'active',
       'Learn how to turn a captured thought into actionable work.',
       'Inbox holds raw captures. To move something into Now, you decide ' ||
       'on a next action. The next-action field is the single most ' ||
       'important field in Orbit — it is what unblocks future-you.' ||
       E'\n\n' ||
       'Try editing this ticket: rewrite the next action below to ' ||
       'something concrete you would actually do.',
       'Edit this ticket and rewrite the next action.',
       now(), null, 3, 3),
      (v_user_id,
       'Example: a ticket waiting on someone else',
       'waiting', 'waiting',
       'See how Waiting tickets work.',
       'When a commitment is blocked on another person or process, set ' ||
       'its status to Waiting and fill in waiting_on. Orbit will surface ' ||
       'it again when its next_action_at date arrives, so you do not ' ||
       'silently forget.',
       null,
       now() + interval '5 days',
       'An imaginary contact', 2, 3),
      (v_user_id,
       'Follow up next week — example',
       'follow_up', 'follow_up',
       'See how Follow-up tickets re-surface on their date.',
       'Follow-ups are commitments to circle back later — without ' ||
       'nailing down when until you have to. Set a next_action_at and ' ||
       'Orbit will quietly hold it until that day.',
       'Reach out and confirm timing.',
       now() + interval '7 days',
       null, 1, 2),
      (v_user_id,
       'Decide what to focus on this quarter',
       'decision', 'inbox',
       'An example of a Decision ticket — a question, not a task.',
       'Not every open loop is a task. Decisions are questions waiting ' ||
       'on a judgment call from you. They live in Inbox until you have ' ||
       'made up your mind.',
       null, null, null, 1, 4),
      (v_user_id,
       'Research: explore something you''re curious about',
       'research', 'inbox',
       'An example of a Research ticket — open-ended exploration.',
       'Research tickets give you a place to capture things you want to ' ||
       'learn or investigate, without forcing them into a task shape.',
       null, null, null, 1, 2)
    returning id
  ),
  events as (
    insert into ticket_events (user_id, ticket_id, event_type, payload)
    select v_user_id, id, 'ticket_created',
           jsonb_build_object('source', 'onboarding')
    from inserted
    returning 1
  )
  select count(*) into v_inserted from events;

  return v_inserted;
end;
$$;

grant execute on function public.seed_onboarding_tickets() to authenticated;
