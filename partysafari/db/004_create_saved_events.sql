-- SQL plan for PartySafari saved events
-- Table: saved_events
-- Required columns:
--   id, event_id, user_id, created_at
-- Users can save and unsave events from the event detail page.

CREATE TABLE IF NOT EXISTS saved_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_events_event_id
  ON saved_events (event_id);

CREATE INDEX IF NOT EXISTS idx_saved_events_user_id
  ON saved_events (user_id);

ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all users to read saved events"
  ON saved_events
  FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated users to save events"
  ON saved_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow users to unsave their own events"
  ON saved_events
  FOR DELETE
  USING (auth.uid() = user_id);
