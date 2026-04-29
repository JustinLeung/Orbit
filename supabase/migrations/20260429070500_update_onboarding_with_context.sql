-- Bring the onboarding seed up to date with ORB-21's structured context
-- fields. The original migration (20260428230000) created six helper
-- tickets but predated `definition_of_done`, `ticket_open_questions`,
-- and `ticket_references`. This redefinition seeds:
--
--   * a Definition of Done checklist on the "clarify a ticket" example
--   * two Open Questions on the Decision example
--   * a Reference snippet on the Research example
--
-- so a brand-new user sees what each section looks like populated. The
-- function stays idempotent: it no-ops if the user already has tickets.

create or replace function public.seed_onboarding_tickets()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_clarify_id uuid;
  v_decision_id uuid;
  v_research_id uuid;
begin
  if v_user_id is null then
    raise exception 'seed_onboarding_tickets requires an authenticated user';
  end if;

  if exists (select 1 from tickets where user_id = v_user_id) then
    return 0;
  end if;

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
     null, null, 2, 4);

  insert into tickets
    (user_id, title, type, status, goal, description, next_action,
     next_action_at, waiting_on, urgency, importance, definition_of_done)
  values
    (v_user_id,
     'Try clarifying a ticket — pick a next action',
     'task', 'active',
     'Learn how to turn a captured thought into actionable work.',
     'Inbox holds raw captures. To move something into Now, you decide ' ||
     'on a next action. The next-action field is the single most ' ||
     'important field in Orbit — it is what unblocks future-you.' ||
     E'\n\n' ||
     'This ticket also has a Definition of Done checklist below — a ' ||
     'small ordered list of what "done" actually means. Tick items ' ||
     'off as you go.',
     'Edit this ticket and rewrite the next action.',
     now(), null, 3, 3,
     jsonb_build_array(
       jsonb_build_object('item', 'Read this description', 'done', false),
       jsonb_build_object('item', 'Rewrite the next action below', 'done', false),
       jsonb_build_object('item', 'Tick the boxes as you finish each step', 'done', false)
     ))
  returning id into v_clarify_id;

  insert into tickets
    (user_id, title, type, status, goal, description, next_action,
     next_action_at, waiting_on, urgency, importance)
  values
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
     'An imaginary contact', 2, 3);

  insert into tickets
    (user_id, title, type, status, goal, description, next_action,
     next_action_at, waiting_on, urgency, importance)
  values
    (v_user_id,
     'Follow up next week — example',
     'follow_up', 'follow_up',
     'See how Follow-up tickets re-surface on their date.',
     'Follow-ups are commitments to circle back later — without ' ||
     'nailing down when until you have to. Set a next_action_at and ' ||
     'Orbit will quietly hold it until that day.',
     'Reach out and confirm timing.',
     now() + interval '7 days',
     null, 1, 2);

  insert into tickets
    (user_id, title, type, status, goal, description, next_action,
     next_action_at, waiting_on, urgency, importance)
  values
    (v_user_id,
     'Decide what to focus on this quarter',
     'decision', 'inbox',
     'An example of a Decision ticket — a question, not a task.',
     'Not every open loop is a task. Decisions are questions waiting ' ||
     'on a judgment call from you. They live in Inbox until you have ' ||
     'made up your mind. The Open Questions section below is where to ' ||
     'park the sub-questions you are still chewing on — and record the ' ||
     'answer once you have one.',
     null, null, null, 1, 4)
  returning id into v_decision_id;

  insert into ticket_open_questions (user_id, ticket_id, question)
  values
    (v_user_id, v_decision_id,
     'What is the single biggest lever I have this quarter?'),
    (v_user_id, v_decision_id,
     'What am I willing to drop to make room for it?');

  insert into tickets
    (user_id, title, type, status, goal, description, next_action,
     next_action_at, waiting_on, urgency, importance)
  values
    (v_user_id,
     'Research: explore something you''re curious about',
     'research', 'inbox',
     'An example of a Research ticket — open-ended exploration.',
     'Research tickets give you a place to capture things you want to ' ||
     'learn or investigate, without forcing them into a task shape. ' ||
     'The References section below is where to stash links, snippets, ' ||
     'or attachments that anchor the loop in source material.',
     null, null, null, 1, 2)
  returning id into v_research_id;

  insert into ticket_references (user_id, ticket_id, kind, url_or_text, label)
  values
    (v_user_id, v_research_id, 'snippet',
     'Add links to articles, paste in quotes from books, or attach ' ||
     'screenshots — references travel with the ticket so you do not ' ||
     'lose the trail when you come back to it weeks later.',
     'About references');

  insert into ticket_events (user_id, ticket_id, event_type, payload)
  select v_user_id, id, 'ticket_created',
         jsonb_build_object('source', 'onboarding')
  from tickets
  where user_id = v_user_id;

  return (select count(*)::int from tickets where user_id = v_user_id);
end;
$$;

grant execute on function public.seed_onboarding_tickets() to authenticated;
