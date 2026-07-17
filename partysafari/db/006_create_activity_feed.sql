-- SQL for PartySafari activity feed
-- Table: activity_feed
-- Required columns:
--   id, actor_id, action_type, event_id, profile_id, metadata, created_at

CREATE TABLE IF NOT EXISTS activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'created_event',
    'rsvp_event',
    'commented_event',
    'saved_event',
    'followed_profile'
  )),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at
  ON activity_feed (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_feed_actor_id
  ON activity_feed (actor_id);

CREATE INDEX IF NOT EXISTS idx_activity_feed_event_id
  ON activity_feed (event_id);

CREATE INDEX IF NOT EXISTS idx_activity_feed_profile_id
  ON activity_feed (profile_id);

ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view activity feed"
  ON activity_feed
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own activity"
  ON activity_feed
  FOR INSERT
  WITH CHECK (auth.uid() = actor_id);
