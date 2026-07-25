-- Migration 014: Backfill activity feed entries for existing events
--
-- Problem: Events created before activity feed logging was implemented
--   do not have corresponding activity_feed entries.
--
-- Solution: For each published event, create an "event_created" activity
--   feed entry using the event's creator (created_by) as the actor.
--   Only create entries where none already exist for that event.

INSERT INTO activity_feed (
  actor_id,
  action_type,
  event_id,
  profile_id,
  metadata,
  created_at
)
SELECT
  e.created_by AS actor_id,
  'event_created' AS action_type,
  e.id AS event_id,
  e.created_by AS profile_id,
  jsonb_build_object(
    'event_title', e.title,
    'venue_name', v.name,
    'venue_slug', v.slug,
    'start_time', e.start_time
  ) AS metadata,
  e.created_at
FROM events e
LEFT JOIN venues v ON e.venue_id = v.id
LEFT JOIN activity_feed af ON af.event_id = e.id AND af.action_type = 'event_created'
WHERE af.id IS NULL
  AND e.created_by IS NOT NULL
  AND e.status IN ('published', 'active', 'live', 'scheduled');
