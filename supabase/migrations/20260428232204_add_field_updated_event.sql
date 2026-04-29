-- Add `field_updated` event type for inline edits in TicketDetailDialog.
-- Per-field saves emit one ticket_events row with payload {field, old, new}.
-- The existing `next_action_updated` value stays in use for that one field.
alter type ticket_event_type add value if not exists 'field_updated';
