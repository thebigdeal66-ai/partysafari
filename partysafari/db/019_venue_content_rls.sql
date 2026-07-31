-- Migration 019: RLS on venue-scoped content
-- Purpose: make venue ownership — not event authorship — govern writes to content that hangs off a
--          venue, without breaking the separate community-event model or any public read path.
-- Scope: the `events` table. `venues` itself was handled by 018. See the notes at the bottom of
--        this file for the venue-scoped tables that were examined and deliberately left alone.
--
-- Reconciled against a read-only snapshot of the live schema and pg_policies taken 2026-07-31.
-- The repo's db/001–017 were never applied to production, so live carries differently-named,
-- looser policies. Statements below marked VERIFIED AGAINST LIVE were checked against that
-- snapshot. See SECURITY_NOTES.md, "db/001–017 were never applied to production".
--
-- Depends on 018: `venues.owner_id` and the corrected `public.is_venue_owner(p_user_id,
-- p_venue_id)`. 018 must run first — the function does not exist live, so running this file alone
-- fails with 42883 on every policy that references it.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
-- `events.venue_id` is nullable and the app writes two distinct kinds of row:
--
--   venue event      venue_id IS NOT NULL  — created from /venue-owner (EventsManager, Tonight tab)
--   community event  venue_id IS NULL      — created from /events/create by any signed-in user,
--                                            which records the location as free-text `venue_name`
--
-- VERIFIED AGAINST LIVE (2026-07-31), the baseline this file actually starts from: `events` has one
-- INSERT policy (`"Authenticated users can create events"`, WITH CHECK auth.uid() = created_by, no
-- venue_id constraint — see the INSERT section) and **no UPDATE or DELETE policy at all**, so both
-- are denied by default for everyone today. The UPDATE/DELETE policies below are therefore purely
-- additive: they unblock paths that are currently broken and cannot narrow anything.
--
-- db/012, which was never applied to production, collapsed both models into
-- `is_venue_owner(auth.uid(), venue_id) OR auth.uid() = created_by`. Two problems with that `OR`
-- branch, which this file is shaped to avoid in any environment where 012 *was* applied:
--
--   1. Authorship outlived ownership. Whoever inserted a venue's event kept UPDATE and DELETE on it
--      forever, including after the venue changed hands.
--   2. It made `venue_id` spoofable. The UPDATE policy repeated the same `OR` in WITH CHECK, so the
--      creator of a community event could re-point it at any venue in the database — the new row
--      still satisfied `auth.uid() = created_by`. The row then rendered on that venue's page.
--
-- The two models are split into two policies per command instead. Postgres ORs permissive policies
-- of the same command together, and for UPDATE it evaluates USING against the old row and WITH
-- CHECK against the new one, so each branch is self-contained: the venue branch never matches a
-- NULL `venue_id` and the community branch never matches a non-NULL one. Crossing between them
-- requires satisfying the target branch on its own terms.

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;  -- already enabled live; no-op there.

-- SELECT is deliberately untouched.
--
-- VERIFIED AGAINST LIVE (2026-07-31): the live read path is two policies, neither of which is the
-- one db/012 describes (`"Everyone can view active events"` was never applied and does not exist
-- live):
--
--   "Anyone can view events"   SELECT  roles=public             qual = true
--   events_select_published    SELECT  roles=anon,authenticated qual = (status = 'published')
--
-- Because permissive policies are OR'd, `qual = true` subsumes the second one and every event is
-- already publicly readable regardless of `status`. That is what Discover Tonight, venue pages and
-- the events listing read as `anon`. Issuing any SELECT DDL here could only narrow it, and
-- tightening public event visibility is a separate product decision with its own blast radius —
-- so this migration adds, drops and rewrites nothing on the read path. The redundancy between the
-- two live SELECT policies (and whether draft events should be public at all) is a follow-up.

-- INSERT ---------------------------------------------------------------------
-- Blocking fix. Live carries an INSERT policy this repo never knew about:
--
--   "Authenticated users can create events"  INSERT  roles=authenticated
--                                            WITH CHECK (auth.uid() = created_by)
--
-- It places no constraint on `venue_id` whatsoever, and it is the live, currently-exploitable
-- venue_id-spoofing gap: any authenticated user can insert an event pointed at a venue they do not
-- own. Since permissive policies of the same command are OR'd, leaving it standing would collapse
-- the effective INSERT rule back to `created_by = auth.uid()` and make both policies below
-- unreachable — this migration would claim to close the hole while changing nothing. Dropping it is
-- what makes the venue-scoped check real.
--
-- Rollback note: once this DROP runs, `events` has no INSERT policy other than the two below. A
-- rollback that removes them without restoring this one breaks event creation for everyone. Restore
-- with:
--   CREATE POLICY "Authenticated users can create events" ON public.events
--     FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
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

-- UPDATE ---------------------------------------------------------------------
-- WITH CHECK repeats USING rather than being omitted: without it Postgres would apply USING to the
-- new row too, and an owner could move their event onto a venue they do not own.
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

-- DELETE ---------------------------------------------------------------------
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

-- Grants. Supabase grants these by default on tables in `public`; restating them keeps the
-- migration self-contained and matches 018. RLS still decides which rows each grant reaches.
GRANT SELECT ON public.events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.events TO authenticated;

-- ---------------------------------------------------------------------------
-- Examined and intentionally unchanged
-- ---------------------------------------------------------------------------
-- public.stories (venue_id, nullable)
--   `venue_id` is an optional *tag* chosen by the story's author, not venue-managed content:
--   StoryComposer offers a "Tag Venue" dropdown to every signed-in user, and venue pages,
--   event pages and the feed all seed it. Requiring `is_venue_owner()` on INSERT would delete that
--   feature for everyone except the handful of assigned venue owners. The existing policies
--   (`auth.uid() = author_id` on INSERT and on the soft-delete UPDATE, both USING and WITH CHECK)
--   already prevent posting or editing as another user, and there is no DELETE policy, so rows
--   cannot be hard-deleted. What remains is a moderation question — a venue owner cannot remove a
--   story tagged to their venue — not a privilege-escalation one. Left for a product decision.
--
-- public.venue_checkins (venue_id, NOT NULL)
--   Self-service check-ins. INSERT and DELETE are already scoped to `auth.uid() = profile_id` and
--   there is no UPDATE policy. A venue owner has no write interest in these rows.

-- ---------------------------------------------------------------------------
-- Deferred — verified fail-closed, and not yet under version control
-- ---------------------------------------------------------------------------
-- public.event_performers
--   VERIFIED AGAINST LIVE (2026-07-31). An earlier revision of this file recorded the table's shape
--   and RLS state as "unknown". They are now known:
--
--     columns  event_id, performer_id, billing_order, created_at
--     PK       composite on (event_id, performer_id)
--     RLS      enabled
--     policies event_performers_select_public — SELECT, roles anon/authenticated, qual = true
--              no INSERT, UPDATE or DELETE policy exists
--     rows     0
--
--   So `performer_id` is confirmed (not `profile_id`, which the app also probes), and writes are
--   already fail-closed for every role: RLS is on and no permissive write policy matches, so
--   Postgres denies by default. The venue-owner dashboard's performer insert and delete paths are
--   inert live today.
--
--   Deferred deliberately, and this is not a security gap being left open. Adding write policies
--   here would *widen* access, not narrow it — it is feature enablement for the dashboard, not a
--   fix. More importantly the table still has no CREATE TABLE anywhere in db/: writing policies
--   from db/ against a table this repo does not define repeats exactly the drift that made these
--   two migrations need correcting. The right first step is a migration that brings the real live
--   definition under version control; policies of the form below can follow it.
--
--     USING (EXISTS (SELECT 1 FROM public.events e
--                     WHERE e.id = event_performers.event_id
--                       AND e.venue_id IS NOT NULL
--                       AND public.is_venue_owner(auth.uid(), e.venue_id)))

-- ---------------------------------------------------------------------------
-- Nothing to secure — these tables do not exist
-- ---------------------------------------------------------------------------
-- promotions / featured venues / venue analytics
--   No such tables exist — not in db/, and no `.from()` call in the app references one. `events`
--   has a `featured` boolean column, toggled by the owner and therefore covered by the UPDATE
--   policy above, and the dashboard's Analytics tab renders hardcoded placeholder data. There is
--   nothing here to secure.
