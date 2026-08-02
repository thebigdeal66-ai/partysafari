-- Migration 018: Venue ownership
-- Purpose: give public.venues a real ownership column, make is_venue_owner() compare against it,
--          and enforce owner-only updates on the venues table at the database level.
-- Scope: venues table only. RLS on venue-scoped content tables (events, stories, performers,
--        promotions) is deliberately left unchanged and tracked as a separate follow-up.

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_venue_owner(p_user_id UUID, p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.venues v
    WHERE auth.uid() IS NOT NULL
      AND p_user_id IS NOT NULL
      AND p_venue_id IS NOT NULL
      AND v.id = p_venue_id
      AND v.owner_id = p_user_id
  );
$$;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues"
  ON public.venues
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS venues_owner_update ON public.venues;
DROP POLICY IF EXISTS venues_owner_insert ON public.venues;
DROP POLICY IF EXISTS venues_owner_delete ON public.venues;

DROP POLICY IF EXISTS "Owners can update their venue" ON public.venues;
CREATE POLICY "Owners can update their venue"
  ON public.venues
  FOR UPDATE
  TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

GRANT UPDATE ON public.venues TO authenticated;
;
