-- Migration 019: RLS on venue-scoped content
-- Purpose: make venue ownership — not event authorship — govern writes to content that hangs off a
--          venue, without breaking the separate community-event model or any public read path.
-- Scope: the `events` table. `venues` itself was handled by 018. See the notes at the bottom of
--        this file for the venue-scoped tables that were examined and deliberately left alone, and
--        for the ones that cannot be secured here because no migration defines them.
--
-- Depends on 018: `venues.owner_id` and the corrected `is_venue_owner(p_user_id, p_venue_id)`.

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
-- `events.venue_id` is nullable and the app writes two distinct kinds of row:
--
--   venue event      venue_id IS NOT NULL  — created from /venue-owner (EventsManager, Tonight tab)
--   community event  venue_id IS NULL      — created from /events/create by any signed-in user,
--                                            which records the location as free-text `venue_name`
--
-- 012 collapsed both into `is_venue_owner(auth.uid(), venue_id) OR auth.uid() = created_by`. Two
-- problems with the `OR` branch:
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

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- SELECT is deliberately untouched. 012's policy already exposes every non-cancelled event to
-- `anon`, which is what Discover Tonight, venue pages and the events listing read. Restating it
-- here would risk narrowing it.

-- INSERT ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Venue owners can insert events for owned venues" ON public.events;
CREATE POLICY "Venue owners can insert events for owned venues"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    venue_id IS NOT NULL
    AND created_by = auth.uid()
    AND is_venue_owner(auth.uid(), venue_id)
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
    AND is_venue_owner(auth.uid(), venue_id)
  )
  WITH CHECK (
    venue_id IS NOT NULL
    AND is_venue_owner(auth.uid(), venue_id)
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
    AND is_venue_owner(auth.uid(), venue_id)
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
-- Cannot be secured here — no migration defines them
-- ---------------------------------------------------------------------------
-- public.event_performers
--   The venue-owner dashboard reads, deletes and inserts rows here, but nothing in db/ creates the
--   table, so its live shape (in particular `performer_id` vs `profile_id` — the app tries both)
--   and its current RLS state are unknown. It carries no `venue_id`; ownership would have to be
--   derived through `event_id -> events.venue_id`. Enabling RLS on a table this file cannot see
--   would silently blank it for every reader, so it is left alone. Bring the table under version
--   control first, then add policies of the form:
--
--     USING (EXISTS (SELECT 1 FROM public.events e
--                     WHERE e.id = event_performers.event_id
--                       AND e.venue_id IS NOT NULL
--                       AND is_venue_owner(auth.uid(), e.venue_id)))
--
-- promotions / featured venues / venue analytics
--   No such tables exist — not in db/, and no `.from()` call in the app references one. `events`
--   has a `featured` boolean column, toggled by the owner and therefore covered by the UPDATE
--   policy above, and the dashboard's Analytics tab renders hardcoded placeholder data. There is
--   nothing here to secure.
