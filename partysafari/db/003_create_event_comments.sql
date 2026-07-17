-- SQL plan for PartySafari event comments
-- Table: event_comments
-- Required columns:
--   id, event_id, user_id, body, created_at, updated_at
-- Comments belong to events and are written by authenticated users.
-- Comments should be visible on event detail pages and display the commenter's username or display name when available.

CREATE TABLE IF NOT EXISTS event_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_comments_event_id
  ON event_comments (event_id);

CREATE INDEX IF NOT EXISTS idx_event_comments_user_id
  ON event_comments (user_id);

ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all users to read event comments"
  ON event_comments
  FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated users to add comments"
  ON event_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow comment owners to update their comments"
  ON event_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow comment owners to delete their comments"
  ON event_comments
  FOR DELETE
  USING (auth.uid() = user_id);
