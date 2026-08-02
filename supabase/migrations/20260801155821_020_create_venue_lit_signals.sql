-- Migration 020: Lit Button signals
-- Purpose: give the Lit Button a durable, auditable table with server-side eligibility,
--          a race-free rolling cooldown, a nightly per-user ceiling, and a public read path
--          that never discloses who pressed the button.
-- Scope: one new table (public.venue_lit_signals), two SECURITY DEFINER predicates, and one
--        anonymising view (public.venue_lit_activity). Nothing existing is dropped or altered.
--
-- Implements MASTERPLAN.md § "Lit Button Specification" → "Eligibility and anti-abuse".

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Migration 020 requires public.profiles to exist (venue_lit_signals.user_id references it). '
      'Bring profiles under version control in db/ before running this file on a fresh database.';
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_venue_lit_signals_venue_active
  ON public.venue_lit_signals (venue_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_venue_lit_signals_user_recent
  ON public.venue_lit_signals (user_id, created_at DESC);

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

ALTER TABLE public.venue_lit_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own lit signals" ON public.venue_lit_signals;
CREATE POLICY "Users can read their own lit signals"
  ON public.venue_lit_signals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

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

CREATE OR REPLACE VIEW public.venue_lit_activity AS
  SELECT
    l.venue_id,
    l.created_at,
    l.expires_at,
    (l.user_id = auth.uid()) AS is_viewer
  FROM public.venue_lit_signals l
  WHERE l.expires_at > NOW();

ALTER VIEW public.venue_lit_activity SET (security_invoker = false);

GRANT SELECT ON public.venue_lit_activity TO anon, authenticated;
GRANT SELECT, INSERT ON public.venue_lit_signals TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_lit_venue(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.within_lit_night_quota(UUID) TO authenticated;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_lit_signals;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
;
