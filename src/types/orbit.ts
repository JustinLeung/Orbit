import type { Database } from '@/types/database'

export type Ticket = Database['public']['Tables']['tickets']['Row']
export type TicketInsert = Database['public']['Tables']['tickets']['Insert']
export type TicketUpdate = Database['public']['Tables']['tickets']['Update']

export type Person = Database['public']['Tables']['people']['Row']
export type PersonInsert = Database['public']['Tables']['people']['Insert']
export type PersonUpdate = Database['public']['Tables']['people']['Update']

export type TicketEvent =
  Database['public']['Tables']['ticket_events']['Row']
export type TicketEventInsert =
  Database['public']['Tables']['ticket_events']['Insert']

export type AgentRun = Database['public']['Tables']['agent_runs']['Row']
export type AgentRunInsert =
  Database['public']['Tables']['agent_runs']['Insert']

export type TicketOpenQuestion =
  Database['public']['Tables']['ticket_open_questions']['Row']
export type TicketOpenQuestionInsert =
  Database['public']['Tables']['ticket_open_questions']['Insert']
export type TicketOpenQuestionUpdate =
  Database['public']['Tables']['ticket_open_questions']['Update']

export type TicketReference =
  Database['public']['Tables']['ticket_references']['Row']
export type TicketReferenceInsert =
  Database['public']['Tables']['ticket_references']['Insert']
export type TicketReferenceUpdate =
  Database['public']['Tables']['ticket_references']['Update']

export type TicketStatus = Database['public']['Enums']['ticket_status']
export type TicketType = Database['public']['Enums']['ticket_type']
export type AgentMode = Database['public']['Enums']['agent_mode']
export type AgentStatus = Database['public']['Enums']['agent_status']
export type TicketEventType =
  Database['public']['Enums']['ticket_event_type']
export type TicketRelationType =
  Database['public']['Enums']['ticket_relation_type']
export type TicketReferenceKind =
  Database['public']['Enums']['ticket_reference_kind']

// jsonb shape for tickets.definition_of_done. Generated types just say
// `Json`; narrow it here so callers get autocomplete.
export type DefinitionOfDoneItem = { item: string; done: boolean }
