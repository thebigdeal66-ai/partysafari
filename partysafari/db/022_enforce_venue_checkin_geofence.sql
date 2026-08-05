-- Migration 022: proximity-gated venue check-ins
-- Requires authenticated users to submit a fresh device location and verifies
-- it against the venue coordinates before creating or refreshing a check-in.

CREATE OR REPLACE FUNCTION public.check_in_to_venue(
  p_venue_id UUID,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_accuracy_meters DOUBLE PRECISION DEFAULT NULL
)
RETURNS public.venue_checkins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.venue_checkins;
  venue_lat DOUBLE PRECISION;
  venue_lng DOUBLE PRECISION;
  distance_meters DOUBLE PRECISION;
  allowed_radius_meters DOUBLE PRECISION;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL
     OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Valid device location required' USING ERRCODE = '22023';
  END IF;

  SELECT latitude, longitude
    INTO venue_lat, venue_lng
  FROM public.venues
  WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venue not found' USING ERRCODE = 'P0002';
  END IF;

  IF venue_lat IS NULL OR venue_lng IS NULL THEN
    RAISE EXCEPTION 'Venue location unavailable' USING ERRCODE = '22023';
  END IF;

  distance_meters := 6371000 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(p_latitude - venue_lat) / 2), 2) +
    COS(RADIANS(venue_lat)) * COS(RADIANS(p_latitude)) *
    POWER(SIN(RADIANS(p_longitude - venue_lng) / 2), 2)
  ));

  -- 250 m base radius, plus no more than 100 m for normal GPS uncertainty.
  allowed_radius_meters := 250 + LEAST(GREATEST(COALESCE(p_accuracy_meters, 0), 0), 100);

  IF distance_meters > allowed_radius_meters THEN
    RAISE EXCEPTION 'Outside venue geofence'
      USING ERRCODE = 'P0001',
            DETAIL = FORMAT(
              'distance_meters=%s allowed_radius_meters=%s',
              ROUND(distance_meters),
              ROUND(allowed_radius_meters)
            );
  END IF;

  INSERT INTO public.venue_checkins (venue_id, profile_id, checked_in_at, expires_at)
  VALUES (p_venue_id, auth.uid(), NOW(), NOW() + INTERVAL '6 hours')
  ON CONFLICT (venue_id, profile_id)
  DO UPDATE SET
    checked_in_at = EXCLUDED.checked_in_at,
    expires_at = EXCLUDED.expires_at
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_to_venue(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_to_venue(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- Remove the prior ungated signature so it cannot be used as a bypass.
DROP FUNCTION IF EXISTS public.check_in_to_venue(UUID);
