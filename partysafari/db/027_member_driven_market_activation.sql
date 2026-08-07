-- Migration 027: member-driven market activation
-- Purpose: turn member home-city data into a controlled town-by-town expansion queue.
-- New cities remain candidates until deliberately activated; West Palm Beach is the first pilot.

CREATE TABLE IF NOT EXISTS public.markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (
    status IN ('candidate', 'pilot', 'active', 'paused')
  ),
  center_latitude DOUBLE PRECISION,
  center_longitude DOUBLE PRECISION,
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  import_requested_at TIMESTAMPTZ,
  last_imported_at TIMESTAMPTZ,
  first_interest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_interest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS markets_status_interest_idx
  ON public.markets (status, member_count DESC, last_interest_at DESC);

ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visible PartySafari markets are public" ON public.markets;
CREATE POLICY "Visible PartySafari markets are public"
  ON public.markets
  FOR SELECT
  TO anon, authenticated
  USING (status IN ('pilot', 'active'));

REVOKE ALL ON TABLE public.markets FROM anon, authenticated;
GRANT SELECT ON TABLE public.markets TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.market_members (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'profile',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS market_members_market_idx
  ON public.market_members (market_id);

ALTER TABLE public.market_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.market_members FROM anon, authenticated;

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS market_id UUID REFERENCES public.markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS venues_market_idx
  ON public.venues (market_id);

INSERT INTO public.markets (
  market_key,
  slug,
  city,
  state,
  status,
  center_latitude,
  center_longitude
)
VALUES
  ('ocean city|MD', 'ocean-city-md', 'Ocean City', 'MD', 'active', 38.3365, -75.0849),
  ('west palm beach|FL', 'west-palm-beach-fl', 'West Palm Beach', 'FL', 'pilot', 26.7153, -80.0534)
ON CONFLICT (market_key) DO NOTHING;

UPDATE public.venues v
SET market_id = m.id
FROM public.markets m
WHERE v.market_id IS NULL
  AND lower(trim(v.city)) = 'ocean city'
  AND upper(trim(v.state)) = 'MD'
  AND m.market_key = 'ocean city|MD';

CREATE OR REPLACE FUNCTION public.sync_profile_market_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_city TEXT := regexp_replace(trim(COALESCE(NEW.home_city, '')), '\\s+', ' ', 'g');
  v_state TEXT := upper(trim(COALESCE(NEW.home_state, '')));
  v_market_key TEXT;
  v_market_slug TEXT;
  v_market_id UUID;
  v_previous_market_id UUID;
  v_member_count INTEGER;
BEGIN
  SELECT mm.market_id
    INTO v_previous_market_id
    FROM public.market_members mm
   WHERE mm.profile_id = NEW.id;

  IF v_city = '' OR v_state !~ '^[A-Z]{2}$' THEN
    DELETE FROM public.market_members
     WHERE profile_id = NEW.id;

    IF v_previous_market_id IS NOT NULL THEN
      UPDATE public.markets m
         SET member_count = (
               SELECT count(*)::INTEGER
                 FROM public.market_members mm
                WHERE mm.market_id = v_previous_market_id
             ),
             updated_at = NOW()
       WHERE m.id = v_previous_market_id;
    END IF;

    RETURN NEW;
  END IF;

  v_market_key := lower(v_city) || '|' || v_state;
  v_market_slug := trim(both '-' from regexp_replace(lower(v_city), '[^a-z0-9]+', '-', 'g'))
                   || '-' || lower(v_state);

  INSERT INTO public.markets (
    market_key,
    slug,
    city,
    state,
    last_interest_at
  )
  VALUES (
    v_market_key,
    v_market_slug,
    v_city,
    v_state,
    NOW()
  )
  ON CONFLICT (market_key) DO UPDATE
    SET last_interest_at = EXCLUDED.last_interest_at,
        updated_at = NOW()
  RETURNING id INTO v_market_id;

  INSERT INTO public.market_members (
    profile_id,
    market_id,
    source,
    last_seen_at
  )
  VALUES (
    NEW.id,
    v_market_id,
    'profile',
    NOW()
  )
  ON CONFLICT (profile_id) DO UPDATE
    SET market_id = EXCLUDED.market_id,
        source = EXCLUDED.source,
        last_seen_at = NOW();

  SELECT count(*)::INTEGER
    INTO v_member_count
    FROM public.market_members mm
   WHERE mm.market_id = v_market_id;

  UPDATE public.markets m
     SET member_count = v_member_count,
         last_interest_at = NOW(),
         import_requested_at = CASE
           WHEN m.import_requested_at IS NULL
             AND (m.status = 'pilot' OR v_member_count >= 3)
           THEN NOW()
           ELSE m.import_requested_at
         END,
         updated_at = NOW()
   WHERE m.id = v_market_id;

  IF v_previous_market_id IS NOT NULL
     AND v_previous_market_id <> v_market_id THEN
    UPDATE public.markets m
       SET member_count = (
             SELECT count(*)::INTEGER
               FROM public.market_members mm
              WHERE mm.market_id = v_previous_market_id
           ),
           updated_at = NOW()
     WHERE m.id = v_previous_market_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_market_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_profile_market_membership ON public.profiles;
CREATE TRIGGER sync_profile_market_membership
AFTER INSERT OR UPDATE OF home_city, home_state
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_market_membership();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    username,
    full_name,
    profile_type,
    home_city,
    home_state
  )
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1),
    '',
    'user',
    NULLIF(left(trim(COALESCE(NEW.raw_user_meta_data ->> 'home_city', '')), 80), ''),
    NULLIF(upper(left(trim(COALESCE(NEW.raw_user_meta_data ->> 'home_state', '')), 2)), '')
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
