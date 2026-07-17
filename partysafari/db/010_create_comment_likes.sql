- SQL for PartySafari comment likes
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES event_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id
  ON comment_likes (comment_id);

CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id
  ON comment_likes (user_id);

ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view comment likes"
  ON comment_likes
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert their own comment likes"
  ON comment_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete their own comment likes"
  ON comment_likes
  FOR DELETE
  USING (auth.uid() = user_id);
-