-- Migration 013: Fix malformed event dates and normalise status values
--
-- Problem 1: The "birthday party" event was stored with year 0226 instead of
--   2026.  This happened because the Date constructor received a datetime-local
--   string whose year was already corrupted and silently produced a date in the
--   third century AD.  Adding exactly 1800 years restores the intended 2026
--   date while preserving the original month, day, and time-of-day.
--
-- Problem 2: The venue-owner dashboard was writing status = 'active' for new
--   public events.  The public pages filter for status IN
--   ('published','active','live','scheduled'), so 'active' events were visible
--   but the convention was inconsistent.  All future events are now created as
--   'published'.  This migration brings existing 'active' rows in line.

-- Step 1 – correct the birthday party event year (0226 → 2026) and mark it published
UPDATE events
SET
  status     = 'published',
  start_time = (start_time + INTERVAL '1800 years')
WHERE title = 'birthday party'
  AND EXTRACT(YEAR FROM start_time AT TIME ZONE 'UTC') < 1000;

-- Step 2 – promote all remaining 'active' events to 'published'
UPDATE events
SET status = 'published'
WHERE status = 'active';
