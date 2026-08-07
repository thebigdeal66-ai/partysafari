-- Migration 029: let a claimant re-check a pending venue claim after confirming
-- a business-domain PartySafari email. This keeps venue ownership assignment in the
-- database and never trusts client-provided email/domain values.

CREATE OR REPLACE FUNCTION public.verify_pending_venue_claim(
  p_claim_id UUID
)
RETURNS public.venue_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_claim public.venue_claims;
  v_owner_id UUID;
  v_website_url TEXT;
  v_email TEXT;
  v_email_confirmed_at TIMESTAMPTZ;
  v_email_domain TEXT;
  v_website_domain TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT vc.*
    INTO v_claim
    FROM public.venue_claims vc
   WHERE vc.id = p_claim_id
     AND vc.claimant_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venue claim not found';
  END IF;

  IF v_claim.status = 'verified' THEN
    RETURN v_claim;
  END IF;

  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'This venue claim is not pending';
  END IF;

  SELECT v.owner_id, v.website_url
    INTO v_owner_id, v_website_url
    FROM public.venues v
   WHERE v.id = v_claim.venue_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venue not found';
  END IF;

  IF v_owner_id IS NOT NULL AND v_owner_id <> v_user_id THEN
    RAISE EXCEPTION 'This venue has already been claimed';
  END IF;

  SELECT u.email, u.email_confirmed_at
    INTO v_email, v_email_confirmed_at
    FROM auth.users u
   WHERE u.id = v_user_id;

  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm your PartySafari email before verifying this venue';
  END IF;

  v_email_domain := lower(trim(split_part(COALESCE(v_email, ''), '@', 2)));
  v_website_domain := lower(split_part(
    regexp_replace(
      regexp_replace(trim(COALESCE(v_website_url, '')), '^https?://', '', 'i'),
      '^www\.',
      '',
      'i'
    ),
    '/',
    1
  ));
  v_website_domain := trim(trailing '.' FROM split_part(v_website_domain, ':', 1));

  IF v_email_domain = ''
     OR v_website_domain = ''
     OR v_email_domain <> v_website_domain
     OR v_website_domain IN (
       'facebook.com',
       'instagram.com',
       'linktr.ee',
       'x.com',
       'twitter.com',
       'tiktok.com'
     ) THEN
    RAISE EXCEPTION 'Use a confirmed email on this venue''s official website domain';
  END IF;

  UPDATE public.venue_claims
     SET status = 'verified',
         verification_method = 'business_email',
         verification_detail = v_website_domain,
         verified_at = COALESCE(verified_at, NOW()),
         reviewed_at = NOW(),
         updated_at = NOW()
   WHERE id = v_claim.id
   RETURNING * INTO v_claim;

  UPDATE public.venues
     SET owner_id = v_user_id,
         verified = TRUE,
         updated_at = NOW()
   WHERE id = v_claim.venue_id
     AND (owner_id IS NULL OR owner_id = v_user_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This venue has already been claimed';
  END IF;

  RETURN v_claim;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_pending_venue_claim(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_pending_venue_claim(UUID) TO authenticated;