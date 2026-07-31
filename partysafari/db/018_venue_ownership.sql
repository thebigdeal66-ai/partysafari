-- Migration 018: Venue ownership
-- Purpose: give public.venues a real ownership column, make is_venue_owner() compare against it,
--          and enforce owner-only updates on the venues table at the database level.
-- Scope: venues table only. RLS on venue-scoped content tables (events, stories, performers,
--        promotions) is deliberately left unchanged and tracked as a separate follow-up.

-- ---------------------------------------------------------------------------
-- Ownership column
-- ---------------------------------------------------------------------------
-- Nullable on purpose: no reliable user-to-venue mapping exists in the repo, so every existing
-- row stays unowned until a human assigns an owner. ON DELETE SET NULL keeps the venue when the
-- owning auth user is removed.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venues_owner_id ON public.venues (owner_id);

-- ---------------------------------------------------------------------------
-- is_venue_owner()
-- ---------------------------------------------------------------------------
-- Replaces the 012 implementation, which probed five column names through
-- `COALESCE(to_jsonb(v) ->> '<col>', '')`. None of those columns existed, so the probe compared a
-- UUID against '' and returned FALSE for every user and every venue without ever raising.
-- Signature is unchanged so the existing events policies keep resolving.
CREATE OR REPLACE FUNCTION is_venue_owner(p_user_id UUID, p_venue_id UUID)
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

-- ---------------------------------------------------------------------------
-- venues RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Unchanged from 017: venue listings are public data.
DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues"
  ON public.venues
  FOR SELECT
  USING (TRUE);

-- The only write path on venues. `owner_id IS NOT NULL` is redundant against a non-null auth.uid()
-- but keeps the intent explicit: an unowned venue is not claimable through UPDATE. WITH CHECK
-- repeats the predicate so an owner cannot transfer or orphan the row.
DROP POLICY IF EXISTS "Owners can update their venue" ON public.venues;
CREATE POLICY "Owners can update their venue"
  ON public.venues
  FOR UPDATE
  TO authenticated
  USING (owner_id IS NOT NULL AND owner_id = auth.uid())
  WITH CHECK (owner_id IS NOT NULL AND owner_id = auth.uid());

-- No INSERT or DELETE policy: venue creation and removal stay service-role only.
GRANT UPDATE ON public.venues TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Intentionally none. There is no venue_owners table, no venue_claims table, and no seed data
-- linking an auth user to a venue, so any assignment here would be a guess that silently grants
-- write access. Assign owners explicitly after review, one venue at a time:
--
--   UPDATE public.venues
--      SET owner_id = '00000000-0000-0000-0000-000000000000'  -- replace with a real auth.users.id
--    WHERE slug = 'replace-with-venue-slug';
