-- Migration 020: Lit Button signals
-- Purpose: give the Lit Button a durable, auditable table with server-side eligibility,
--          a race-free rolling cooldown, a nightly per-user ceiling, and a public read path
--          that never discloses who pressed the button.
-- Scope: one new table (public.venue_lit_signals), two SECURITY DEFINER predicates, and one
--        anonymising view (public.venue_lit_activity). Nothing existing is dropped or altered.
--
-- Implements MASTERPLAN.md § "Lit Button Specification" → "Eligibility and anti-abuse".
--
-- NOT APPLIED TO PRODUCTION. Like db/018 and db/019 before it, this file is a version-control
-- artifact only. It has not been executed against the live Supabase project and no live schema
-- snapshot was taken while writing it — deployment is a separate, separately-approved step. Unlike
-- 018/019 there are therefore no "VERIFIED AGAINST LIVE" annotations anywhere in this file, and
-- none should be inferred. See SECURITY_NOTES.md, "db/001-017 were never applied to production".
--
-- Because this table does not exist live, every reader added in this sprint
-- (`src/lib/litEngine.ts`, the Party Score engine) treats a missing table or view as "no lit
-- signal available" and degrades to a placeholder rather than throwing, per the Party Score
-- evolution rules in MASTERPLAN.md.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
-- btree_gist supplies the `=` operator class GiST needs for the uuid columns in the exclusion
-- constraint below. Without it the ADD CONSTRAINT fails with "data type uuid has no default
-- operator class for access method gist".
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- `public.profiles` has no CREATE TABLE anywhere in db/ — it is one of the tables that exists in
-- the live project but was never brought under version control (same gap as `event_performers`,
-- noted in db/019). This migration still targets it deliberately: `public.profiles.id` is the
-- established user-reference FK target in this codebase, per `venues.owner_id`. Fail loudly here
-- rather than emitting a confusing FK error twenty lines down.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Migration 020 requires public.profiles to exist (venue_lit_signals.user_id references it). '
      'Bring profiles under version control in db/ before running this file on a fresh database.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- venue_lit_signals
-- ---------------------------------------------------------------------------
-- One row per endorsement. Rows are immutable and never deleted: MASTERPLAN requires that abuse
-- can be reconstructed after the fact, so there is deliberately no UPDATE or DELETE policy below.
-- `expires_at` is what makes a signal stop counting, not deletion.
--
-- The cooldown window and the scoring window are the same 60 minutes on purpose. A signal that has
-- expired both stops contributing to the Party Score and releases the user to endorse again, which
-- is what "the button returns to its inactive state once the user's signal expires" means in the
-- UX spec.
--
-- No latitude/longitude column. MASTERPLAN lists "coarse location metadata" under auditability
-- alongside a device-radius proximity option, but this sprint gates on an active check-in or a
-- live event RSVP instead of device GPS (see `can_lit_venue` below), so there is no location
-- reading to record and a nullable column nothing writes would be dead schema. Add it in the same
-- migration that adds device-radius gating.
CREATE TABLE IF NOT EXISTS public.venue_lit_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 minutes'),
  CONSTRAINT venue_lit_signals_window_check CHECK (expires_at > created_at)
);

ALTER TABLE public.venue_lit_signals ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE;
ALTER TABLE public.venue_lit_signals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.venue_lit_signals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.venue_lit_signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 minutes');

-- The cooldown, enforced by the database rather than by the policy below.
--
-- A partial unique index (`... WHERE expires_at > NOW()`) cannot express this: index predicates
-- must be IMMUTABLE and NOW() is not. A plain UNIQUE (venue_id, user_id) — the shape
-- `venue_checkins` uses — cannot express it either, because check-ins are deleted on checkout
-- whereas lit rows are kept forever for audit, so the second endorsement of the night would be
-- rejected rather than the second endorsement of the hour.
--
-- An exclusion constraint over the active interval says exactly the intended thing: the same user
-- may not hold two overlapping active endorsements for the same venue. It is enforced by an index,
-- so it holds under concurrency — two simultaneous taps cannot both win the way they could with a
-- SELECT-then-INSERT check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'venue_lit_signals_no_overlapping_cooldown'
       AND conrelid = 'public.venue_lit_signals'::regclass
  ) THEN
    ALTER TABLE public.venue_lit_signals
      ADD CONSTRAINT venue_lit_signals_no_overlapping_cooldown
      EXCLUDE USING gist (
        venue_id WITH =,
        user_id WITH =,
        tstzrange(created_at, expires_at) WITH &&
      );
  END IF;
END $$;

-- Serves the per-venue active-signal read (the view below, and the Party Score engine through it).
CREATE INDEX IF NOT EXISTS idx_venue_lit_signals_venue_active
  ON public.venue_lit_signals (venue_id, expires_at DESC);

-- Serves the nightly quota count in `within_lit_night_quota`.
CREATE INDEX IF NOT EXISTS idx_venue_lit_signals_user_recent
  ON public.venue_lit_signals (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Eligibility predicate
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because the caller cannot necessarily read the rows this has to consult: the
-- `venue_checkins` SELECT policy is public, but pinning eligibility to whatever the caller happens
-- to be allowed to read would make the rule depend on unrelated policy changes. STABLE, not
-- IMMUTABLE — it reads tables and NOW().
--
-- `SET search_path = public` matches db/018 and is the reason the unqualified names inside cannot
-- be hijacked by a caller-controlled search_path.
--
-- Two accepted proofs of presence, per MASTERPLAN "an active check-in at the venue, or a device
-- location within a small radius":
--
--   1. An unexpired row in `venue_checkins` for this venue. This is the primary path.
--   2. A 'going' RSVP to an event at this venue that is running right now. MASTERPLAN does not
--      name this case, but a person at a venue for its event is exactly the person the feature is
--      for, and requiring them to also press check-in first would be a UX trap.
--
-- Device-radius gating is deliberately NOT implemented. It needs a location column, a distance
-- function and a spoofing story of its own; check-in already carries the same claim and is
-- already enforced. Tracked as follow-up.
--
-- `venue_checkins.profile_id` holds an auth user id (db/017 declares the FK against
-- `auth.users(id)`), and `profiles.id` is 1:1 with `auth.users.id`, so comparing it to
-- `venue_lit_signals.user_id` / `auth.uid()` is sound despite the differing declared FK targets.
CREATE OR REPLACE FUNCTION public.can_lit_venue(p_user_id UUID, p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_venue_id IS NOT NULL
    -- A venue cannot endorse itself. MASTERPLAN: "Venue-owned accounts cannot Lit their own venue."
    AND NOT EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = p_venue_id
        AND v.owner_id = p_user_id
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.venue_checkins c
        WHERE c.venue_id = p_venue_id
          AND c.profile_id = p_user_id
          AND c.expires_at > NOW()
      )
      OR EXISTS (
        SELECT 1
        FROM public.events e
        JOIN public.event_rsvps r ON r.event_id = e.id
        WHERE e.venue_id = p_venue_id
          AND r.user_id = p_user_id
          AND LOWER(COALESCE(r.status, '')) = 'going'
          -- Mirrors isEventActive() in src/lib/partyScoreEngine.ts: a null bound means "no bound",
          -- not "excluded". An event with no end_time is treated as running for six hours.
          AND COALESCE(e.start_time, NOW()) <= NOW()
          AND COALESCE(e.end_time, e.start_time + INTERVAL '6 hours', NOW() + INTERVAL '6 hours') > NOW()
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Nightly ceiling
-- ---------------------------------------------------------------------------
-- MASTERPLAN asks for "a per-user ceiling across all venues per night" without naming a number.
-- ASSUMPTION: 10 endorsements per rolling 12 hours. A rolling window rather than a calendar night
-- because "night" spans midnight and a calendar-day reset would hand every account a fresh
-- allowance at exactly the busiest moment. 10 is deliberately generous for a real person doing a
-- bar crawl (the per-venue cooldown already caps them at one per venue per hour) and tight enough
-- that a single compromised account cannot move the city-level ranking. Revisit against real
-- Founding-cohort data before the ceiling is treated as tuned.
CREATE OR REPLACE FUNCTION public.within_lit_night_quota(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL
     AND (
       SELECT COUNT(*)
       FROM public.venue_lit_signals l
       WHERE l.user_id = p_user_id
         AND l.created_at > NOW() - INTERVAL '12 hours'
     ) < 10;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_lit_signals ENABLE ROW LEVEL SECURITY;

-- Read on the base table is own-rows-only, which is the whole privacy model: MASTERPLAN says
-- "Individual Lit events are never displayed attributed to a named user... Publicly, Lit is always
-- an aggregate." RLS filters rows, not columns, so any policy that let a client see other people's
-- rows would also hand them `user_id`. The public path is the view below instead.
--
-- This policy exists so a user can see their own cooldown state and audit their own history.
DROP POLICY IF EXISTS "Users can read their own lit signals" ON public.venue_lit_signals;
CREATE POLICY "Users can read their own lit signals"
  ON public.venue_lit_signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- The only write path.
--
-- `TO authenticated` plus `auth.uid() = user_id` is what makes anonymous endorsement and
-- endorsement-on-behalf-of-another-user impossible: auth.uid() is NULL for `anon`, so the first
-- conjunct fails, and a forged `user_id` fails the comparison.
--
-- The created_at / expires_at bounds exist because both columns are client-writable — a client
-- that supplied `expires_at = NOW() + INTERVAL '10 years'` would otherwise mint a permanent
-- endorsement and lock its own cooldown open forever. Defaults produce a conforming row, so the
-- app inserts only (venue_id, user_id) and never sets either. The tolerance on created_at absorbs
-- clock skew without allowing a backdated or postdated window.
--
-- The final NOT EXISTS duplicates the exclusion constraint on purpose. It is not the enforcement —
-- it loses a concurrent race that the constraint wins — but it turns the common case into an
-- ordinary RLS refusal rather than a 23P01 constraint violation, which is a much better signal for
-- the client to render "cooling down" from.
DROP POLICY IF EXISTS "Eligible users can insert their own lit signal" ON public.venue_lit_signals;
CREATE POLICY "Eligible users can insert their own lit signal"
  ON public.venue_lit_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND created_at BETWEEN NOW() - INTERVAL '2 minutes' AND NOW() + INTERVAL '2 minutes'
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '60 minutes'
    AND public.can_lit_venue(auth.uid(), venue_id)
    AND public.within_lit_night_quota(auth.uid())
    AND NOT EXISTS (
      SELECT 1
      FROM public.venue_lit_signals existing
      WHERE existing.venue_id = venue_lit_signals.venue_id
        AND existing.user_id = auth.uid()
        AND existing.expires_at > NOW()
    )
  );

-- No UPDATE and no DELETE policy. Endorsements are an audit trail; they expire, they are not
-- edited or withdrawn. With RLS enabled and no permissive policy for those commands, Postgres
-- denies them by default for every role including `authenticated`.

-- ---------------------------------------------------------------------------
-- Public aggregate read path
-- ---------------------------------------------------------------------------
-- The anonymising projection every public reader uses. It exposes when endorsements happened and
-- whether one of them is the caller's, and never exposes whose the others are.
--
-- `security_invoker = false` is deliberate and is the point of the view: it runs with the view
-- owner's privileges and therefore reads past the own-rows-only policy above, which is the only
-- way to publish an aggregate without also publishing `user_id`. Supabase's linter flags
-- definer-semantics views generically; here the definer semantics are the security control, not a
-- mistake. db/017 introduced the `check_ins` compatibility view the same way. Nothing sensitive
-- leaks: the view selects three columns and `user_id` is not one of them, and the `is_viewer` flag
-- is computed from auth.uid(), which resolves per-request from the JWT rather than from the
-- executing role.
CREATE OR REPLACE VIEW public.venue_lit_activity AS
  SELECT
    l.venue_id,
    l.created_at,
    l.expires_at,
    (l.user_id = auth.uid()) AS is_viewer
  FROM public.venue_lit_signals l
  WHERE l.expires_at > NOW();

ALTER VIEW public.venue_lit_activity SET (security_invoker = false);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase grants these by default on new objects in `public`; restating them keeps the migration
-- self-contained and matches db/018 and db/019. RLS still decides which rows each grant reaches.
--
-- `anon` is granted the view and nothing else: signed-out visitors see aggregate lit counts on
-- venue cards and cannot write. No grant on the base table for `anon` at all, so an anonymous
-- INSERT is refused by table privileges before RLS is even consulted.
GRANT SELECT ON public.venue_lit_activity TO anon, authenticated;
GRANT SELECT, INSERT ON public.venue_lit_signals TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_lit_venue(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.within_lit_night_quota(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Added for parity with the other Discover tables in db/017. Nothing subscribes to it yet: the
-- client refreshes lit state on write and on its own interval instead, because a realtime
-- subscription against a table that does not exist in the target project produces a channel error
-- loop, and this table does not exist in the target project.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_lit_signals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
