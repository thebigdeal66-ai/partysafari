-- SQL for PartySafari notifications
-- Table: notifications
-- Required columns:
--   id, user_id, actor_id, notification_type, event_id, activity_id, comment_id, metadata, is_read, created_at

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activity_feed(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES event_comments(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_is_read
  ON notifications (is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON notifications (created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users may insert notifications for valid actions"
  ON notifications
  FOR INSERT
  WITH CHECK (
    auth.role() IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND user_id IS NOT NULL
    AND notification_type IS NOT NULL
    AND (
      event_id IS NOT NULL
      OR activity_id IS NOT NULL
      OR comment_id IS NOT NULL
      OR notification_type IS NOT NULL
    )
  );

CREATE POLICY "Users can delete their own notifications"
  ON notifications
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION create_notification(
  recipient_id uuid,
  actor uuid,
  notification_type text,
  event uuid DEFAULT NULL,
  activity uuid DEFAULT NULL,
  comment uuid DEFAULT NULL,
  metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS notifications AS $$
BEGIN
  RETURNING QUERY
  INSERT INTO notifications (
    user_id,
    actor_id,
    notification_type,
    event_id,
    activity_id,
    comment_id,
    metadata
  ) VALUES (
    recipient_id,
    actor,
    notification_type,
    event,
    activity,
    comment,
    metadata
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
