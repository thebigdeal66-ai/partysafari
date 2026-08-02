-- Migration 019: RLS on venue-scoped content

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- INSERT
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.events;

DROP POLICY IF EXISTS "Venue owners can insert events for owned venues" ON public.events;
CREATE POLICY "Venue owners can insert events for owned venues"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venue_id IS NOT NULL
    AND created_by = auth.uid()
    AND public.is_venue_owner(auth.uid(), venue_id)
  );

DROP POLICY IF EXISTS "Creators can insert their own community events" ON public.events;
CREATE POLICY "Creators can insert their own community events"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venue_id IS NULL
    AND created_by = auth.uid()
  );

-- UPDATE
DROP POLICY IF EXISTS "Venue owners can update owned venue events" ON public.events;
CREATE POLICY "Venue owners can update owned venue events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    venue_id IS NOT NULL
    AND public.is_venue_owner(auth.uid(), venue_id)
  )
  WITH CHECK (
    venue_id IS NOT NULL
    AND public.is_venue_owner(auth.uid(), venue_id)
  );

DROP POLICY IF EXISTS "Creators can update their own community events" ON public.events;
CREATE POLICY "Creators can update their own community events"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    venue_id IS NULL
    AND created_by = auth.uid()
  )
  WITH CHECK (
    venue_id IS NULL
    AND created_by = auth.uid()
  );

-- DELETE
DROP POLICY IF EXISTS "Venue owners can delete owned venue events" ON public.events;
CREATE POLICY "Venue owners can delete owned venue events"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    venue_id IS NOT NULL
    AND public.is_venue_owner(auth.uid(), venue_id)
  );

DROP POLICY IF EXISTS "Creators can delete their own community events" ON public.events;
CREATE POLICY "Creators can delete their own community events"
  ON public.events
  FOR DELETE
  TO authenticated
  USING (
    venue_id IS NULL
    AND created_by = auth.uid()
  );

GRANT SELECT ON public.events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;
;
