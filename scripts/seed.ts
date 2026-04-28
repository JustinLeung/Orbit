// Seeds the local Orbit DB with a variety of tickets for the target user.
//
// Usage:
//   npm run seed                       # seeds for SEED_USER_EMAIL or justin@justinleung.net
//   npm run seed -- alice@example.com  # seeds for the given email
//
// The user must already exist in Supabase Auth (sign in once at /login first).
// All existing tickets + people for that user are wiped before inserting.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database.ts'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n' +
      'Run `supabase status -o env` and copy SERVICE_ROLE_KEY into .env as SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(1)
}

const targetEmail =
  process.argv[2] ?? process.env.SEED_USER_EMAIL ?? 'justin@justinleung.net'

const supabase = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: usersPage, error: listErr } =
  await supabase.auth.admin.listUsers({ perPage: 1000 })
if (listErr) throw listErr

const user = usersPage.users.find(
  (u) => u.email?.toLowerCase() === targetEmail.toLowerCase(),
)
if (!user) {
  console.error(
    `No Supabase user with email ${targetEmail}.\n` +
      'Sign in once at http://localhost:5173/login to create the account, then re-run.',
  )
  process.exit(1)
}

const userId = user.id
console.log(`Seeding for ${targetEmail} (${userId})`)

// Wipe — cascades through participants, events, agent_runs, relations.
const { error: wipeTicketsErr } = await supabase
  .from('tickets')
  .delete()
  .eq('user_id', userId)
if (wipeTicketsErr) throw wipeTicketsErr

const { error: wipePeopleErr } = await supabase
  .from('people')
  .delete()
  .eq('user_id', userId)
if (wipePeopleErr) throw wipePeopleErr

// People ----------------------------------------------------------------

const { data: people, error: peopleErr } = await supabase
  .from('people')
  .insert([
    {
      user_id: userId,
      name: 'Maya Chen',
      organization: 'Acme',
      email: 'maya@acme.example',
      relationship_tags: ['colleague', 'design'],
      notes: 'Lead designer on the platform redesign.',
    },
    {
      user_id: userId,
      name: 'Sam Patel',
      organization: 'Independent',
      email: 'sam@example.com',
      relationship_tags: ['mentor'],
    },
    {
      user_id: userId,
      name: 'Jordan Lee',
      email: 'jordan@example.com',
      relationship_tags: ['friend'],
    },
    {
      user_id: userId,
      name: 'Priya Shah',
      organization: 'Initech Legal',
      email: 'priya@initech.example',
      relationship_tags: ['vendor', 'legal'],
    },
  ])
  .select()
if (peopleErr) throw peopleErr

// Tickets ---------------------------------------------------------------

const today = new Date()
const day = (offset: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

const ticketSeed: Array<
  Database['public']['Tables']['tickets']['Insert'] & { _key: string }
> = [
  {
    _key: 'inbox-onboarding',
    title: 'Reply to onboarding email from new hire',
    type: 'admin',
    status: 'inbox',
    urgency: 2,
    importance: 2,
  },
  {
    _key: 'inbox-q3',
    title: 'Decide on Q3 hiring plan',
    type: 'decision',
    status: 'inbox',
    goal: 'Pick which two roles to prioritize for Q3.',
    urgency: 3,
    importance: 4,
  },
  {
    _key: 'now-invoice',
    title: 'Ship invoice CSV export',
    type: 'task',
    status: 'active',
    next_action: 'Wire up the download button to /api/invoices.csv',
    next_action_at: day(0),
    urgency: 4,
    importance: 4,
    energy_required: 3,
  },
  {
    _key: 'now-paper',
    title: 'Read "End-to-End Arguments" paper',
    type: 'research',
    status: 'active',
    next_action: 'Read sections 3–5 and take notes',
    next_action_at: day(2),
    urgency: 1,
    importance: 3,
    energy_required: 2,
  },
  {
    _key: 'now-overdue',
    title: 'Renew domain registrations',
    type: 'admin',
    status: 'active',
    next_action: 'Renew orbit.app and two spare domains',
    next_action_at: day(-2),
    urgency: 4,
    importance: 2,
  },
  {
    _key: 'waiting-legal',
    title: 'Sales contract — legal review',
    type: 'waiting',
    status: 'waiting',
    waiting_on: 'Priya (legal)',
    next_action_at: day(5),
    urgency: 3,
    importance: 4,
  },
  {
    _key: 'waiting-overdue',
    title: 'Vendor SOC2 report request',
    type: 'waiting',
    status: 'waiting',
    waiting_on: 'Acme security team',
    next_action_at: day(-4),
    urgency: 3,
    importance: 3,
  },
  {
    _key: 'follow-maya',
    title: 'Follow up on intro to Maya',
    type: 'follow_up',
    status: 'follow_up',
    next_action: 'Send recap + intro to Jordan',
    next_action_at: day(1),
    urgency: 2,
    importance: 3,
  },
  {
    _key: 'follow-coffee',
    title: 'Coffee with Sam this quarter',
    type: 'relationship',
    status: 'follow_up',
    next_action: 'Book a 30-min slot',
    urgency: 1,
    importance: 2,
  },
  {
    _key: 'review-auth',
    title: 'Migrate auth provider',
    type: 'task',
    status: 'review',
    agent_mode: 'assist',
    agent_status: 'awaiting_review',
    urgency: 3,
    importance: 5,
    context:
      'Assist agent drafted a migration plan; awaiting human review before execution.',
  },
  {
    _key: 'stuck-audit',
    title: 'Audit invoice approval flow',
    type: 'task',
    status: 'active',
    // No next_action / next_action_at on purpose — should surface in Stuck.
    urgency: 3,
    importance: 4,
  },
  {
    _key: 'closed-retro',
    title: 'Year-end retrospective',
    type: 'task',
    status: 'closed',
    urgency: 1,
    importance: 2,
    closed_at: day(-7),
  },
  {
    _key: 'dropped-voice',
    title: 'Old idea: voice-memo capture',
    type: 'task',
    status: 'dropped',
    urgency: 1,
    importance: 1,
    closed_at: day(-30),
  },
]

// Defaults must be explicit on every row — supabase-js builds the column list
// from the union of keys across the batch, so any column set on one row that
// is undefined elsewhere gets sent as NULL (violating NOT NULL defaults).
const { data: tickets, error: ticketsErr } = await supabase
  .from('tickets')
  .insert(
    ticketSeed.map(({ _key, ...row }) => ({
      user_id: userId,
      agent_mode: 'none' as const,
      agent_status: 'idle' as const,
      ...row,
    })),
  )
  .select()
if (ticketsErr) throw ticketsErr

const ticketByTitle = new Map(tickets.map((t) => [t.title, t]))
const personByName = new Map(people.map((p) => [p.name, p]))

// Participants ---------------------------------------------------------

const { error: participantsErr } = await supabase
  .from('ticket_participants')
  .insert([
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Follow up on intro to Maya')!.id,
      person_id: personByName.get('Maya Chen')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Follow up on intro to Maya')!.id,
      person_id: personByName.get('Jordan Lee')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Coffee with Sam this quarter')!.id,
      person_id: personByName.get('Sam Patel')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Sales contract — legal review')!.id,
      person_id: personByName.get('Priya Shah')!.id,
    },
  ])
if (participantsErr) throw participantsErr

// History --------------------------------------------------------------

const { error: eventsErr } = await supabase.from('ticket_events').insert(
  tickets.map((t) => ({
    user_id: userId,
    ticket_id: t.id,
    event_type: 'ticket_created' as const,
    payload: { source: 'seed' },
  })),
)
if (eventsErr) throw eventsErr

console.log(
  `Seeded ${people.length} people, ${tickets.length} tickets, ${tickets.length} events.`,
)
