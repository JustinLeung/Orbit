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
      name: 'Mom',
      email: 'linda@example.com',
      relationship_tags: ['family', 'parent'],
      notes: 'Loves gardening and chai. Birthday in October.',
    },
    {
      user_id: userId,
      name: 'Emma',
      email: 'emma@example.com',
      relationship_tags: ['family', 'sibling'],
      notes: 'Younger sister, lives in Brooklyn.',
    },
    {
      user_id: userId,
      name: 'Chris',
      email: 'chris@example.com',
      relationship_tags: ['friend'],
    },
    {
      user_id: userId,
      name: 'Marco',
      organization: 'Bayside Plumbing',
      email: 'marco@baysideplumbing.example',
      relationship_tags: ['vendor', 'home'],
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
    _key: 'inbox-mothers-day',
    title: "Buy Mother's Day gift",
    type: 'decision',
    status: 'inbox',
    goal: 'Pick something thoughtful — Mom mentioned wanting a new herb planter.',
    urgency: 3,
    importance: 4,
  },
  {
    _key: 'inbox-thanksgiving',
    title: 'Decide where to host Thanksgiving',
    type: 'decision',
    status: 'inbox',
    urgency: 1,
    importance: 3,
  },
  {
    _key: 'now-asics',
    title: 'Return Asics shoes to Zappos',
    type: 'task',
    status: 'active',
    next_action: 'Print return label and drop at UPS',
    next_action_at: day(0),
    urgency: 4,
    importance: 2,
    energy_required: 1,
  },
  {
    _key: 'now-book',
    title: 'Read "Atomic Habits"',
    type: 'research',
    status: 'active',
    next_action: 'Finish chapters 4–6 before book club',
    next_action_at: day(3),
    urgency: 2,
    importance: 3,
    energy_required: 2,
  },
  {
    _key: 'now-overdue',
    title: 'Renew car registration',
    type: 'admin',
    status: 'active',
    next_action: 'Submit DMV renewal online',
    next_action_at: day(-2),
    urgency: 4,
    importance: 4,
  },
  {
    _key: 'waiting-plumber',
    title: 'Kitchen sink leak — plumber estimate',
    type: 'waiting',
    status: 'waiting',
    waiting_on: 'Marco (Bayside Plumbing)',
    next_action_at: day(4),
    urgency: 3,
    importance: 3,
  },
  {
    _key: 'waiting-insurance',
    title: 'Dental insurance reimbursement',
    type: 'waiting',
    status: 'waiting',
    waiting_on: 'Delta Dental claims team',
    next_action_at: day(-5),
    urgency: 2,
    importance: 3,
  },
  {
    _key: 'follow-chris',
    title: 'Follow up on dinner plans with Chris',
    type: 'follow_up',
    status: 'follow_up',
    next_action: 'Suggest two Saturday options',
    next_action_at: day(1),
    urgency: 2,
    importance: 2,
  },
  {
    _key: 'follow-emma',
    title: 'Lunch with Emma this month',
    type: 'relationship',
    status: 'follow_up',
    next_action: 'Text her some weekend dates',
    urgency: 1,
    importance: 3,
  },
  {
    _key: 'review-trip',
    title: 'Plan summer family trip',
    type: 'task',
    status: 'review',
    agent_mode: 'assist',
    agent_status: 'awaiting_review',
    urgency: 2,
    importance: 4,
    context:
      'Assist agent drafted a 5-day itinerary for the Oregon coast; awaiting review before booking.',
  },
  {
    _key: 'stuck-garage',
    title: 'Organize the garage',
    type: 'task',
    status: 'active',
    // No next_action / next_action_at on purpose — should surface in Stuck.
    urgency: 1,
    importance: 2,
  },
  {
    _key: 'closed-taxes',
    title: 'File 2025 taxes',
    type: 'task',
    status: 'closed',
    urgency: 1,
    importance: 4,
    closed_at: day(-14),
  },
  {
    _key: 'dropped-podcast',
    title: 'Old idea: start a hobby podcast',
    type: 'task',
    status: 'dropped',
    urgency: 1,
    importance: 1,
    closed_at: day(-60),
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
      ticket_id: ticketByTitle.get("Buy Mother's Day gift")!.id,
      person_id: personByName.get('Mom')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Follow up on dinner plans with Chris')!.id,
      person_id: personByName.get('Chris')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Lunch with Emma this month')!.id,
      person_id: personByName.get('Emma')!.id,
    },
    {
      user_id: userId,
      ticket_id: ticketByTitle.get('Kitchen sink leak — plumber estimate')!.id,
      person_id: personByName.get('Marco')!.id,
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
