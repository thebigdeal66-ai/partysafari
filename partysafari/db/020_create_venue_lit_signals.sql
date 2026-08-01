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
-- artifact only. It has not been executed against the live Supabase project — deployment is a
-- separate, separately-approved step. See SECURITY_NOTES.md, "db/001-017 were never applied to
-- production".
--
-- A read-only live snapshot WAS taken during the pre-merge audit (2026-07-31), so statements below
-- marked VERIFIED AGAINST LIVE were checked against production rather than against db/. The
-- audit also confirmed migration history carries no "020" entry and no drift: live tracks 14
-- timestamp-named migrations plus `018_venue_ownership` and `019_venue_content_rls`, and none of
-- the hand-numbered db/001-017 files appear in it.
--
-- VERIFIED AGAINST LIVE (2026-07-31): zero naming collisions for anything this file introduces —
-- no `venue_lit_signals` table, no `venue_lit_activity` view, no `can_lit_venue` or
-- `within_lit_night_quota` function, and no policy named "Users can read their own lit signals" or
-- "Eligible users can insert their own lit signal" exists in the live `public` schema. The
-- existing policies on `venue_checkins`, `event_rsvps`, `venues` and `events` were reviewed for
-- name overlap and there is none, so unlike db/018 and db/019 this migration has no looser live
-- policy to drop out from under itself.
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
--
-- VERIFIED AGAINST LIVE (2026-07-31): btree_gist is NOT installed in production. `pg_extension`
-- there holds only pg_graphql, pg_stat_statements, pgcrypto, plpgsql, supabase_vault and
-- uuid-ossp. So this line is not a no-op the way it would be on a database that already had it —
-- it is the statement that makes the exclusion constraint below possible at all.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- `public.profiles` has no CREATE TABLE anywhere in db/ — it is one of the tables that exists in
-- the live project but was never brought under version control (same gap as `event_performers`,
-- noted in db/019). This migration still targets it deliberately: `public.profiles.id` is the
-- established user-reference FK target in this codebase, per `venues.owner_id`. Fail loudly here
-- rather than emitting a confusing FK error twenty lines down.
--
-- VERIFIED AGAINST LIVE (2026-07-31): `public.profiles` has PK `id uuid NOT NULL` with no default
-- and FK `profiles_id_fkey: id -> auth.users(id) ON DELETE CASCADE`. profiles.id was confirmed
-- 1:1 with auth.users.id (zero mismatches across every row), which is what makes comparing
-- `venue_lit_signals.user_id` to `auth.uid()` sound even though the two tables reached the same
-- uuid by different declared FK routes.
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
-- alongside a device-radius proximity option, but this sprint gates on a recent check-in instead
-- of device GPS (see `can_lit_venue` below), so there is no location reading to record and a
-- nullable column nothing writes would be dead schema. Add it in the same migration that adds
-- device-radius gating.
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
-- must be IMMUTABLE and NOW() is not. A plain UNIQUE (venue_id, user_id) cannot express it
-- either, because lit rows are kept forever for audit, so the second endorsement of the night
-- would be rejected rather than the second endorsement of the hour.
--
-- VERIFIED AGAINST LIVE (2026-07-31): an earlier revision of this comment justified the choice by
-- claiming `venue_checkins` rows "are deleted on checkout". That is false against production —
-- `venue_checkins` has no checkout path, no delete trigger, and no deletion mechanism of any
-- kind; rows simply age out via `expires_at` (default `now() + INTERVAL '6 hours'`). The
-- conclusion is unchanged and the reasoning is if anything stronger: neither table deletes rows,
-- so a plain UNIQUE would permanently bar a user's second endorsement at a venue.
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
-- Exactly ONE accepted proof of presence: a check-in at this venue made within the last 90
-- minutes and not yet expired. Per MASTERPLAN, "a Lit signal requires plausible physical
-- presence — an active check-in at the venue".
--
-- The 90 minutes is the recency window, and it is stated explicitly here rather than inherited
-- from the check-in row's own lifetime.
--
-- VERIFIED AGAINST LIVE (2026-07-31): `public.venue_checkins` is exactly
--   id uuid PK default gen_random_uuid()
--   venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE
--   profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
--   checked_in_at timestamptz NOT NULL default now()
--   expires_at timestamptz NOT NULL default now() + INTERVAL '6 hours'
--   created_at timestamptz NOT NULL default now()
-- with NO trigger and NO checkout or delete path — rows are never removed, they only age past
-- `expires_at`. That is why `expires_at > NOW()` alone is NOT the intended gate: on live data it
-- means "checked in at some point in the last six hours", which is a claim about this evening,
-- not about being in the room now. Both conditions are therefore required — `checked_in_at`
-- carries the 90-minute recency rule, and `expires_at` is still consulted so that an explicitly
-- shortened or already-lapsed check-in cannot unlock the button.
--
-- Note the FK target: live `venue_checkins.profile_id` references `public.profiles(id)`, not
-- `auth.users(id)` as db/017 declares. Either way it holds the same uuid as `auth.uid()` (see the
-- profiles annotation above), so the comparison against `p_user_id` is sound.
--
-- RSVP is deliberately NOT a proof of presence. An earlier revision of this function also
-- unlocked Lit for a 'going' RSVP to an event running at the venue; that branch is removed. A
-- 'going' RSVP is a statement of intent made in advance from anywhere, so accepting it would let
-- any account endorse a venue it has never physically visited — the exact abuse the proximity
-- gate exists to prevent. RSVP remains a Party Score input (`goingRsvps` / `interestedRsvps` in
-- src/lib/partyScoreEngine.ts), where it is a confidence signal rather than proof of attendance;
-- it must not reappear in this eligibility gate. The `public.events` and `public.event_rsvps`
-- joins that branch needed are gone with it.
--
-- VERIFIED AGAINST LIVE (2026-07-31), recorded because the removal was a judgement call and not a
-- schema problem: `public.event_rsvps` is exactly `id uuid PK`, `event_id uuid NOT NULL
-- REFERENCES events(id) ON DELETE CASCADE`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON
-- DELETE CASCADE` (auth.users directly — a different convention from venue_checkins above),
-- `status text NOT NULL`, `created_at`, `updated_at`, with `interested` and `going` observed as
-- live status values. The removed branch matched that shape correctly. It was dropped because
-- RSVP is the wrong signal for this gate, not because it was mis-written.
--
-- Device-radius gating is deliberately NOT implemented this sprint. It needs a location column, a
-- distance function and a spoofing story of its own; a recent check-in already carries the same
-- claim and is already enforced. Tracked as follow-up.
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
    --
    -- VERIFIED AGAINST LIVE (2026-07-31): `public.venues` has PK `id uuid DEFAULT
    -- gen_random_uuid()` and a nullable `owner_id uuid`, so this block is schema-correct as
    -- written. `owner_id` is NULL on every live row today, which makes the check inert in
    -- production until db/018 assigns owners — it is not wrong, it simply has nothing to match yet.
    AND NOT EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.id = p_venue_id
        AND v.owner_id = p_user_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.venue_checkins c
      WHERE c.venue_id = p_venue_id
        AND c.profile_id = p_user_id
        AND c.checked_in_at > NOW() - INTERVAL '90 minutes'
        AND c.expires_at > NOW()
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
--
-- Reviewed unchanged in the 2026-07-31 pre-merge audit: the rolling window found no concrete
-- defect, so it is deliberately left exactly as it was rather than retuned alongside the
-- eligibility fix above.
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
