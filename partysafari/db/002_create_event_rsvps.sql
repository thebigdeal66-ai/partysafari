-- SQL plan for PartySafari event RSVPs
-- Table: event_rsvps
-- Required columns:
--   id, event_id, user_id, status, created_at
-- status values supported: 'going' and 'interested'

CREATE TABLE IF NOT EXISTS event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('going', 'interested', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id
  ON event_rsvps (event_id);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id
  ON event_rsvps (user_id);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all RSVPs"
  ON event_rsvps
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own RSVP"
  ON event_rsvps
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own RSVP"
  ON event_rsvps
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own RSVP"
  ON event_rsvps
  FOR DELETE
  USING (auth.uid() = user_id);
