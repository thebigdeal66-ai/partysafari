-- Migration 025: self-service venue claims
-- Purpose: let authenticated venue representatives claim pre-listed venues without a
--          founder meeting while keeping public.venues.owner_id as the authorization source.
-- Verification: a confirmed account email may auto-verify only when its domain exactly
--          matches the venue's official website domain. All other claims stay pending.

CREATE TABLE IF NOT EXISTS public.venue_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  claimant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verification_method TEXT NOT NULL CHECK (
    verification_method IN ('business_email', 'business_phone', 'website', 'social', 'document', 'manual')
  ),
  verification_detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'verified', 'rejected', 'cancelled')
  ),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venue_claims_claimant_idx
  ON public.venue_claims (claimant_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS venue_claims_venue_idx
  ON public.venue_claims (venue_id, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS venue_claims_one_active_per_venue_idx
  ON public.venue_claims (venue_id)
  WHERE status IN ('pending', 'verified');

ALTER TABLE public.venue_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Claimants can view their venue claims" ON public.venue_claims;
CREATE POLICY "Claimants can view their venue claims"
  ON public.venue_claims
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = claimant_id);

GRANT SELECT ON public.venue_claims TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_venue_claim(
  p_venue_id UUID,
  p_verification_method TEXT DEFAULT 'business_email'
)
RETURNS public.venue_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_email_domain TEXT;
  v_website_url TEXT;
  v_website_domain TEXT;
  v_owner_id UUID;
  v_claim public.venue_claims;
  v_status TEXT := 'pending';
  v_detail TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_verification_method NOT IN (
    'business_email', 'business_phone', 'website', 'social', 'document', 'manual'
  ) THEN
    RAISE EXCEPTION 'Unsupported verification method';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Complete your PartySafari profile before claiming a venue';
  END IF;

  SELECT v.website_url, v.owner_id
    INTO v_website_url, v_owner_id
    FROM public.venues v
   WHERE v.id = p_venue_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venue not found';
  END IF;

  IF v_owner_id IS NOT NULL THEN
    IF v_owner_id = v_user_id THEN
      SELECT vc.*
        INTO v_claim
        FROM public.venue_claims vc
       WHERE vc.venue_id = p_venue_id
         AND vc.claimant_id = v_user_id
         AND vc.status = 'verified'
       ORDER BY vc.submitted_at DESC
       LIMIT 1;

      IF FOUND THEN
        RETURN v_claim;
      END IF;
    END IF;

    RAISE EXCEPTION 'This venue has already been claimed';
  END IF;

  SELECT vc.*
    INTO v_claim
    FROM public.venue_claims vc
   WHERE vc.venue_id = p_venue_id
     AND vc.status IN ('pending', 'verified')
   ORDER BY vc.submitted_at DESC
   LIMIT 1;

  IF FOUND THEN
    IF v_claim.claimant_id = v_user_id THEN
      RETURN v_claim;
    END IF;

    RAISE EXCEPTION 'This venue already has an active claim';
  END IF;

  IF p_verification_method = 'business_email' THEN
    SELECT u.email, u.email_confirmed_at
      INTO v_email, v_email_confirmed_at
      FROM auth.users u
     WHERE u.id = v_user_id;

    v_email_domain := lower(split_part(COALESCE(v_email, ''), '@', 2));
    v_website_domain := lower(split_part(
      regexp_replace(
        regexp_replace(COALESCE(v_website_url, ''), '^https?://', '', 'i'),
        '^www\.',
        '',
        'i'
      ),
      '/',
      1
    ));
    v_website_domain := split_part(v_website_domain, ':', 1);

    IF v_email_confirmed_at IS NOT NULL
       AND v_email_domain <> ''
       AND v_website_domain <> ''
       AND v_email_domain = v_website_domain
       AND v_website_domain NOT IN (
         'facebook.com',
         'instagram.com',
         'linktr.ee',
         'x.com',
         'twitter.com',
         'tiktok.com'
       ) THEN
      v_status := 'verified';
      v_detail := v_website_domain;
    END IF;
  END IF;

  INSERT INTO public.venue_claims (
    venue_id,
    claimant_id,
    verification_method,
    verification_detail,
    status,
    verified_at,
    reviewed_at
  )
  VALUES (
    p_venue_id,
    v_user_id,
    p_verification_method,
    v_detail,
    v_status,
    CASE WHEN v_status = 'verified' THEN NOW() ELSE NULL END,
    CASE WHEN v_status = 'verified' THEN NOW() ELSE NULL END
  )
  RETURNING * INTO v_claim;

  IF v_status = 'verified' THEN
    UPDATE public.venues
       SET owner_id = v_user_id,
           verified = TRUE,
           updated_at = NOW()
     WHERE id = p_venue_id
       AND owner_id IS NULL;
  END IF;

  RETURN v_claim;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_venue_claim(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_venue_claim(UUID, TEXT) TO authenticated;
