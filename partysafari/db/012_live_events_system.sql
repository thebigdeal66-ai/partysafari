-- PartySafari Live Events production schema + RLS

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  performer_name TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  cover_charge NUMERIC(10,2),
  age_requirement TEXT,
  drink_specials TEXT,
  image_url TEXT,
  ticket_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS performer_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_charge NUMERIC(10,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS age_requirement TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS drink_specials TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events (venue_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_featured ON events (featured);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events (created_by);
CREATE INDEX IF NOT EXISTS idx_events_status_start_time ON events (status, start_time);

CREATE OR REPLACE FUNCTION is_venue_owner(p_user_id UUID, p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM venues v
    WHERE v.id = p_venue_id
      AND p_user_id IS NOT NULL
      AND p_user_id::TEXT = ANY (
        ARRAY[
          COALESCE(to_jsonb(v) ->> 'owner_id', ''),
          COALESCE(to_jsonb(v) ->> 'created_by', ''),
          COALESCE(to_jsonb(v) ->> 'profile_id', ''),
          COALESCE(to_jsonb(v) ->> 'manager_id', ''),
          COALESCE(to_jsonb(v) ->> 'user_id', '')
        ]
      )
  );
$$;

CREATE OR REPLACE FUNCTION set_events_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION set_events_updated_at();

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view active events" ON events;
CREATE POLICY "Everyone can view active events"
  ON events
  FOR SELECT
  USING (
    LOWER(COALESCE(status, 'active')) IN ('active', 'published', 'live', 'scheduled')
    OR is_venue_owner(auth.uid(), venue_id)
    OR auth.uid() = created_by
  );

DROP POLICY IF EXISTS "Venue owners can insert events for owned venues" ON events;
CREATE POLICY "Venue owners can insert events for owned venues"
  ON events
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND is_venue_owner(auth.uid(), venue_id)
  );

DROP POLICY IF EXISTS "Venue owners can update owned venue events" ON events;
CREATE POLICY "Venue owners can update owned venue events"
  ON events
  FOR UPDATE
  USING (
    is_venue_owner(auth.uid(), venue_id)
    OR auth.uid() = created_by
  )
  WITH CHECK (
    is_venue_owner(auth.uid(), venue_id)
    OR auth.uid() = created_by
  );

DROP POLICY IF EXISTS "Venue owners can delete owned venue events" ON events;
CREATE POLICY "Venue owners can delete owned venue events"
  ON events
  FOR DELETE
  USING (
    is_venue_owner(auth.uid(), venue_id)
    OR auth.uid() = created_by
  );

DO $$
BEGIN
  BEGIN
    ALTER TABLE event_rsvps DROP CONSTRAINT IF EXISTS event_rsvps_status_check;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    ALTER TABLE event_rsvps
      ADD CONSTRAINT event_rsvps_status_check
      CHECK (status IN ('going', 'interested', 'not_going'));
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
  END;
END $$;
