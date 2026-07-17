-- SQL for PartySafari activity feed likes
CREATE TABLE IF NOT EXISTS activity_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_likes_activity_id
  ON activity_likes (activity_id);

CREATE INDEX IF NOT EXISTS idx_activity_likes_user_id
  ON activity_likes (user_id);

ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view activity likes"
  ON activity_likes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert their own activity likes"
  ON activity_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete their own activity likes"
  ON activity_likes
  FOR DELETE
  USING (auth.uid() = user_id);
