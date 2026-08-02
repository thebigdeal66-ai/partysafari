-- Migration 021: Founder calibration feedback
-- Purpose: give the private Crowd Pulse / AI Discover Cards calibration pass a durable, typed,
--          own-rows-only place to record one judgment per rendered recommendation, so thresholds
--          can later be tuned against ground truth instead of against intuition.
-- Scope: one new table (public.calibration_feedback). No functions, no views, no triggers.
--        Nothing existing is dropped or altered.
--
-- NOT APPLIED TO PRODUCTION. Like db/018 and db/019 before it, this file is a version-control
-- artifact only. It has not been executed against the live Supabase project and must not be
-- executed as part of this sprint — the calibration UI degrades to "unavailable" while the table
-- is absent (see src/lib/calibrationFeedback.ts). Deployment is a separate, separately-approved
-- step. See SECURITY_NOTES.md, "db/001-017 were never applied to production".
--
-- Unlike its predecessors, db/020 *was* applied: the live migration history
-- (`supabase_migrations.schema_migrations`) carries `020_create_venue_lit_signals` as
-- `20260801155821`, its 17th and most recent entry. So `public.venue_lit_signals` does exist live
-- and this file is correctly numbered 021.
--
-- ---------------------------------------------------------------------------
-- Live audit (read-only snapshot, this session)
-- ---------------------------------------------------------------------------
-- Project `aojwmqfmzdqrbgenovlb` (`PartySafari.Live`, us-east-2) holds exactly 32 tables in
-- `public`, all with RLS enabled:
--
--   profiles, performers, performer_owners, venues, venue_admins, events, event_performers,
--   talent_requests, talent_messages, booking_requests, booking_messages, requests,
--   request_responses, event_rsvps, event_comments, saved_events, activity_feed, activity_likes,
--   comment_likes, notifications, conversations, conversation_participants, direct_messages,
--   follows, venue_checkins, safari_plans, safari_stops, friend_requests, friendships, stories,
--   story_views, venue_lit_signals
--
-- VERIFIED AGAINST LIVE: **none of those 32 is an analytics, telemetry, feedback or calibration
-- table of any kind.** Every one of them stores product state — social graph, messaging, events,
-- presence — and none has a shape a per-recommendation judgment could be folded into without
-- overloading its meaning. `activity_feed` is the closest by name and is the opposite thing: a
-- user-visible social feed, not an internal measurement log. So a new table is required here, not
-- merely permitted; this is the audit conclusion Goal 2 of the sprint asks for.
--
-- VERIFIED AGAINST LIVE: zero naming collisions for anything this file introduces. There is no
-- `calibration_feedback` table, view, sequence or index in the live `public` schema, no policy
-- named "Testers can insert their own calibration feedback" or "Testers can read their own
-- calibration feedback" on any table, and no live object name matching `%calibration%` at all.
-- This migration adds no function, so there is no function name to collide either.
--
-- VERIFIED AGAINST LIVE: both FK targets exist and are the established reference targets in this
-- codebase — `public.profiles` (PK `id uuid`, FK `profiles_id_fkey: id -> auth.users(id)`, 1:1 with
-- auth.users across every row) and `public.venues` (PK `id uuid DEFAULT gen_random_uuid()`).
-- Because profiles.id is 1:1 with auth.users.id, comparing `profile_id` to `auth.uid()` in the
-- policies below is sound, exactly as db/020 established for `venue_lit_signals.user_id`.
--
-- The Founder's profile (`02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f`, username `thebigdeal66`) is a
-- plain `profile_type = 'user'` row. There is no admin role concept anywhere in this schema, and
-- this migration deliberately does not invent one — see the RLS section.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
-- Fail loudly here rather than emitting a confusing FK error further down. `public.profiles` has
-- no CREATE TABLE anywhere in db/ — it is one of the tables that exists live but was never brought
-- under version control (the same gap db/019 and db/020 both note) — so on a fresh database built
-- from db/ alone this check is what explains the problem.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Migration 021 requires public.profiles to exist (calibration_feedback.profile_id references it). '
      'Bring profiles under version control in db/ before running this file on a fresh database.';
  END IF;

  IF to_regclass('public.venues') IS NULL THEN
    RAISE EXCEPTION
      'Migration 021 requires public.venues to exist (calibration_feedback.venue_id references it).';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- calibration_feedback
-- ---------------------------------------------------------------------------
-- One row per founder judgment on one rendered recommendation.
--
-- Explicit typed columns, not a JSON blob. A blob would let the payload grow silently, and the
-- whole privacy argument for this table rests on being able to read its column list and see that
-- nothing sensitive is in it. Adding a field must cost a migration and a review.
--
-- WHAT IS DELIBERATELY ABSENT, and must stay absent: no latitude/longitude, no movement or
-- location history, no device identifier, no message or story content, no friend list, no attendee
-- identity, no reference to anybody other than the submitter. This table records what the
-- submitter's own screen showed plus their verdict on it. It observes the recommendation, not the
-- crowd. MASTERPLAN forbids passive location tracking and this sprint adds none.
--
-- `venue_id` is nullable because not every observation has to be venue-scoped, but both features
-- are venue-scoped in practice, so it is populated on essentially every row the app writes.
--
-- `accurate` is nullable so a future partial-judgment flow has somewhere to go, but the control
-- shipped in this sprint only writes on an explicit Accurate or Inaccurate press, so every row it
-- creates carries a verdict. A null therefore means "written by something other than that
-- control", which is worth being able to tell apart.
--
-- `reason_codes` is `text[]`, not JSON: the values are a flat list of PSI / AI-Discover reason
-- identifiers, an array says exactly that, and it stays queryable with `&&` and `ANY` without a
-- JSON extraction in every predicate.
--
-- The note CHECK is a length bound, not validation. 500 characters is a sentence or two of
-- context — enough to say "packed but the pulse said quiet", not enough to become a free-form
-- field that accumulates whatever someone happens to type about other people.
--
-- `recommendation_category` and `displayed_psi_label` stay plain text instead of enums because
-- the product vocabulary is expected to evolve as calibration sharpens naming. We bound length,
-- not value set, so this table stays future-compatible without becoming an unbounded text sink.
--
-- `reason_codes` is constrained two ways: max 10 entries, and max 640 chars once serialized
-- (`reason_codes::text`). The count cap prevents "small-token spam" and the serialized cap
-- prevents a few very large values from quietly turning this field into a payload channel.
CREATE TABLE IF NOT EXISTS public.calibration_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  recommendation_category TEXT,
  displayed_party_score NUMERIC,
  displayed_psi_label TEXT,
  crowd_pulse_level TEXT,
  reason_codes TEXT[],
  accurate BOOLEAN,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calibration_feedback_feature_check
    CHECK (feature IN ('crowdPulse', 'aiDiscoverCards')),
  CONSTRAINT calibration_feedback_recommendation_category_length_check
    CHECK (recommendation_category IS NULL OR char_length(recommendation_category) <= 64),
  CONSTRAINT calibration_feedback_displayed_psi_label_length_check
    CHECK (displayed_psi_label IS NULL OR char_length(displayed_psi_label) <= 120),
  CONSTRAINT calibration_feedback_reason_codes_count_check
    CHECK (reason_codes IS NULL OR cardinality(reason_codes) <= 10),
  CONSTRAINT calibration_feedback_reason_codes_serialized_length_check
    CHECK (reason_codes IS NULL OR char_length(reason_codes::text) <= 640),
  CONSTRAINT calibration_feedback_note_length_check
    CHECK (note IS NULL OR char_length(note) <= 500)
);

-- Idempotent column adds for a database that already has an earlier revision of the table, per
-- CONTRIBUTING.md's "additive changes only". The CHECK constraints are added separately below for
-- the same reason: a plain ADD CONSTRAINT is not idempotent.
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS feature TEXT;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS recommendation_category TEXT;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS displayed_party_score NUMERIC;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS displayed_psi_label TEXT;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS crowd_pulse_level TEXT;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS reason_codes TEXT[];
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS accurate BOOLEAN;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE public.calibration_feedback ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_feature_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_feature_check
      CHECK (feature IN ('crowdPulse', 'aiDiscoverCards'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_note_length_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_note_length_check
      CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_recommendation_category_length_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_recommendation_category_length_check
      CHECK (recommendation_category IS NULL OR char_length(recommendation_category) <= 64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_displayed_psi_label_length_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_displayed_psi_label_length_check
      CHECK (displayed_psi_label IS NULL OR char_length(displayed_psi_label) <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_reason_codes_count_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_reason_codes_count_check
      CHECK (reason_codes IS NULL OR cardinality(reason_codes) <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calibration_feedback_reason_codes_serialized_length_check'
       AND conrelid = 'public.calibration_feedback'::regclass
  ) THEN
    ALTER TABLE public.calibration_feedback
      ADD CONSTRAINT calibration_feedback_reason_codes_serialized_length_check
      CHECK (reason_codes IS NULL OR char_length(reason_codes::text) <= 640);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Sized for the two reads this table actually has, both of which are the later service-role
-- aggregate pass rather than anything on a hot user path:
--
--   "every judgment for this feature, newest first"  -> (feature, created_at DESC)
--   "every judgment about this venue, newest first"  -> (venue_id, created_at DESC)
--
-- Service-role analysis often groups by founder and orders recent-first, so `profile_id` gets its
-- own index too.
-- The table is expected to hold hundreds of rows, not millions; these exist so the aggregate reads
-- stay sequential-scan-free as the calibration window runs, not because throughput is a concern.
CREATE INDEX IF NOT EXISTS idx_calibration_feedback_feature_recent
  ON public.calibration_feedback (feature, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_feedback_venue_recent
  ON public.calibration_feedback (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_feedback_profile_recent
  ON public.calibration_feedback (profile_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.calibration_feedback ENABLE ROW LEVEL SECURITY;

-- The only write path, and the reason "a tester cannot submit feedback as another user" is a
-- database fact rather than a client convention.
--
-- `TO authenticated` plus `auth.uid() = profile_id` is the whole rule: `auth.uid()` is NULL for
-- `anon` so the comparison fails outright for a signed-out caller, and a forged `profile_id` fails
-- the comparison for a signed-in one. There is no branch, no helper function and no id list, so
-- there is nothing here to get wrong later.
DROP POLICY IF EXISTS "Testers can insert their own calibration feedback" ON public.calibration_feedback;
CREATE POLICY "Testers can insert their own calibration feedback"
  ON public.calibration_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

-- Deliberately NO SELECT policy. Calibration telemetry remains private to the administrative
-- analysis path until a dedicated dashboard is intentionally built.
DROP POLICY IF EXISTS "Testers can read their own calibration feedback" ON public.calibration_feedback;

-- No UPDATE and no DELETE policy, matching `venue_lit_signals`. Judgments are an audit trail of
-- what somebody believed at a moment in the night; a revised opinion is a new row with a later
-- `created_at`, which is strictly more information than an edit would leave behind. With RLS
-- enabled and no permissive policy for those commands, Postgres denies them by default for every
-- role including `authenticated`.

-- Administrative and aggregate reads happen exclusively through the Supabase `service_role` key,
-- which bypasses RLS by default and is never exposed to any client bundle. That is why there is no
-- fourth policy here naming approved analyst profile ids.
--
-- The alternative — an RLS policy with a literal UUID in its USING clause — would hardcode a
-- person's identity into the schema, require a migration to change, and put the Founder's id into
-- a place where revoking it is a deploy rather than a config change. The `service_role` route
-- needs no policy at all, is already how every other privileged read in this project works, and
-- keeps the set of people who can read across rows equal to the set of people who hold the
-- service key.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase grants these by default on new objects in `public`; restating them keeps the migration
-- self-contained and matches db/018, db/019 and db/020. RLS still decides which rows each grant
-- reaches.
--
-- `anon` is granted nothing at all — no SELECT and no INSERT — so an anonymous request is refused
-- by table privileges before RLS is even consulted. `authenticated` gets INSERT only; SELECT,
-- UPDATE and DELETE are withheld at the privilege level as well as the policy level, so the
-- immutability above holds even if a permissive policy is ever added by mistake.
REVOKE ALL ON public.calibration_feedback FROM anon;
GRANT INSERT ON public.calibration_feedback TO authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Deliberately NOT registered with `supabase_realtime`, unlike db/020.
--
-- Realtime exists so one client learns about another client's write. Nothing subscribes to
-- calibration feedback and nothing should: the submitter already knows what they submitted, no
-- other user may see these rows, and the analysis pass reads the table in bulk after the fact.
-- Publishing it would add replication traffic for an audience of nobody.

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- If this file is ever applied and then needs reverting, the table is self-contained and nothing
-- references it, so a single statement undoes it (dropping the table takes its policies, indexes
-- and constraints with it):
--
--   DROP TABLE IF EXISTS public.calibration_feedback;
--
-- Disabling the feature does NOT require that, or any deploy: unsetting the
-- `NEXT_PUBLIC_FEATURE_*_PROFILE_IDS` / `NEXT_PUBLIC_FEATURE_*_CITY` env vars removes every
-- tester's access and the calibration control along with it.
