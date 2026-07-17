-- SQL for PartySafari follows
-- Table: follows
-- Required columns:
--   id, follower_id, following_id, created_at

CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id
  ON follows (follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_following_id
  ON follows (following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all follows"
  ON follows
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own follows"
  ON follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
  ON follows
  FOR DELETE
  USING (auth.uid() = follower_id);
