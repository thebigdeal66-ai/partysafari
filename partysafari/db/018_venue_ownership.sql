-- Migration 018: Venue ownership
-- Purpose: give public.venues a real ownership column, make is_venue_owner() compare against it,
--          and enforce owner-only updates on the venues table at the database level.
-- Scope: venues table only. RLS on venue-scoped content tables (events, stories, performers,
--        promotions) is deliberately left unchanged and tracked as a separate follow-up.

-- ---------------------------------------------------------------------------
-- Ownership column
-- ---------------------------------------------------------------------------
-- VERIFIED AGAINST LIVE (2026-07-31): `public.venues.owner_id` ALREADY EXISTS in the production
-- Supabase project — `uuid`, nullable, indexed by `venues_owner_idx`, with foreign key
-- `venues_owner_id_fkey` targeting **public.profiles.id**, NOT `auth.users(id)`. The statement
-- below is therefore a complete no-op against production: `ADD COLUMN IF NOT EXISTS` skips the
-- whole clause, so the `auth.users(id)` reference and the `ON DELETE SET NULL` rule written here
-- are never applied there. It is retained only so a fresh database built from db/ ends up with an
-- equivalent column. (`profiles.id` itself references `auth.users.id`, so the chain is 1:1, but the
-- literal FK target differs.)
--
-- Consequence for owner assignment: values written to `owner_id` must be an existing
-- `public.profiles.id`. Assigning a raw `auth.users.id` for an account that has no `profiles` row
-- raises a foreign-key violation against production.
--
-- Nullable on purpose: no reliable user-to-venue mapping exists, so every existing row stays
-- unowned until a human assigns an owner.
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- No index is created here. Live already has `venues_owner_idx` on `venues (owner_id)`. An earlier
-- revision of this migration created `idx_venues_owner_id`; because `IF NOT EXISTS` matches on
-- index *name* only, that would have added a second, fully redundant B-tree index on the same
-- column rather than no-opping. Dropped from the migration instead.

-- ---------------------------------------------------------------------------
-- is_venue_owner()
-- ---------------------------------------------------------------------------
-- Replaces the 012 implementation, which probed five column names through
-- `COALESCE(to_jsonb(v) ->> '<col>', '')`. None of those columns existed, so the probe compared a
-- UUID against '' and returned FALSE for every user and every venue without ever raising.
--
-- VERIFIED AGAINST LIVE (2026-07-31): no function matching `%venue_owner%` exists in the live
-- `public` schema — db/012 was never applied to production, so this `CREATE OR REPLACE` creates the
-- function fresh with no live dependents to break. The signature is kept identical to 012's anyway
-- so that any environment where 012 *was* applied keeps resolving.
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

-- ---------------------------------------------------------------------------
-- venues RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;  -- already enabled live; no-op there.

-- Venue listings are public data.
--
-- VERIFIED AGAINST LIVE (2026-07-31): live already has two permissive public-SELECT policies on
-- this table — `venues_public_read` (roles=public, qual=true) and `venues_select_public`
-- (roles=anon,authenticated, qual=true). The policy below is a third with identical effect. It is
-- kept so a database built from db/ alone still has a public read path, and live's two are left in
-- place deliberately: dropping them changes nothing about who can read and is outside the scope of
-- this security fix. Consolidating all three into one is an accepted follow-up item.
DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues"
  ON public.venues
  FOR SELECT
  USING (TRUE);

-- Reconciling the write policies with live.
--
-- VERIFIED AGAINST LIVE (2026-07-31): production already carries three owner-scoped write policies
-- that predate this migration and are named nothing like the repo's — `venues_owner_insert`
-- (WITH CHECK COALESCE(owner_id, created_by) = auth.uid()), `venues_owner_update` (USING and
-- WITH CHECK the same predicate) and `venues_owner_delete` (USING the same predicate), all for role
-- `authenticated`. None of them appears anywhere in db/.
--
-- They are dropped here, intentionally, for two reasons:
--
--   1. Permissive policies of the same command are OR'd. `owner_id IS NOT NULL AND
--      owner_id = auth.uid()` is a strict logical subset of `COALESCE(owner_id, created_by) =
--      auth.uid()`, so leaving `venues_owner_update` standing would make the policy below
--      completely inert — the effective UPDATE rule would remain live's looser one, and the
--      owner_id-only model this migration exists to establish would never take effect.
--   2. `venues_owner_insert` / `venues_owner_delete` let any authenticated user create a venue with
--      `created_by = self` and later delete it. Removing them is what makes the "service-role only"
--      posture stated below literally true rather than aspirational.
--
-- This is a deliberate tightening, not a no-op: after this migration, ownership is `owner_id` and
-- nothing else. The `created_by` fallback is gone. No live row is affected today (all 4 live venues
-- have both `owner_id` and `created_by` NULL, so the COALESCE predicate already evaluates to NULL
-- for everyone), but future rows can no longer be claimed by whoever inserted them.
--
-- Rollback note: these three policies cannot be recovered from db/ — restore them from a
-- `pg_policies` snapshot taken before this migration runs.
DROP POLICY IF EXISTS venues_owner_update ON public.venues;
DROP POLICY IF EXISTS venues_owner_insert ON public.venues;
DROP POLICY IF EXISTS venues_owner_delete ON public.venues;

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

-- No INSERT or DELETE policy is (re)created: venue creation and removal are service-role only.
-- True as of this migration only because the DROPs above remove live's `venues_owner_insert` and
-- `venues_owner_delete`.
GRANT UPDATE ON public.venues TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Intentionally none. There is no venue_owners table, no venue_claims table, and no seed data
-- linking a user to a venue, so any assignment here would be a guess that silently grants write
-- access. Confirmed live: 4 venues, 0 with `owner_id`, 0 with `created_by`.
--
-- Assign owners explicitly after review, one venue at a time. The value must be an existing
-- `public.profiles.id` — the live foreign key is `venues.owner_id -> public.profiles.id`, so a raw
-- `auth.users.id` for an account with no profiles row raises a foreign-key violation:
--
--   UPDATE public.venues
--      SET owner_id = '00000000-0000-0000-0000-000000000000'  -- an existing public.profiles.id
--    WHERE slug = 'replace-with-venue-slug';
--
-- This must be run with service_role / the SQL editor. The UPDATE policy above requires
-- `owner_id = auth.uid()`, which no unowned row satisfies, so the first assignment cannot be made
-- through the API.
