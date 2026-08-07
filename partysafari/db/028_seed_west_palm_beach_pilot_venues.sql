-- Migration 028: seed the first West Palm Beach pilot listings
-- Source verification performed against current venue/operator pages and the
-- West Palm Beach Downtown Development Authority nightlife directory.
-- These rows are deliberately unclaimed and unverified so the self-service
-- claim flow remains the authority for business ownership.

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS venue_count INTEGER NOT NULL DEFAULT 0 CHECK (venue_count >= 0);

WITH west_palm AS (
  SELECT id
  FROM public.markets
  WHERE market_key = 'west palm beach|FL'
)
INSERT INTO public.venues (
  slug,
  name,
  address,
  city,
  state,
  postal_code,
  description,
  verified,
  owner_id,
  venue_type,
  latitude,
  longitude,
  phone,
  website_url,
  current_status,
  market_id
)
SELECT
  seed.slug,
  seed.name,
  seed.address,
  'West Palm Beach',
  'FL',
  '33401',
  seed.description,
  FALSE,
  NULL,
  seed.venue_type,
  seed.latitude,
  seed.longitude,
  seed.phone,
  seed.website_url,
  'unknown',
  west_palm.id
FROM west_palm
CROSS JOIN (
  VALUES
    (
      'er-bradleys-saloon-wpb',
      'E.R. Bradley''s Saloon',
      '104 S Clematis Street',
      'bar',
      26.7125019::DOUBLE PRECISION,
      -80.0497041::DOUBLE PRECISION,
      '(561) 833-3520',
      'https://erbradleys.com/',
      'Waterfront downtown saloon and nightlife staple on Clematis Street.'
    ),
    (
      'roxys-pub-wpb',
      'Roxy''s Pub',
      '309 Clematis Street',
      'pub',
      26.7156866::DOUBLE PRECISION,
      -80.0528711::DOUBLE PRECISION,
      '(561) 296-7699',
      'https://www.roxyspub.com/',
      'Long-running downtown pub with late-night hours, live entertainment, and a rooftop bar.'
    ),
    (
      'lost-weekend-wpb',
      'Lost Weekend',
      '526 Clematis Street',
      'bar',
      26.7133207::DOUBLE PRECISION,
      -80.0564087::DOUBLE PRECISION,
      '(561) 293-2786',
      'https://sub-culture.org/lost-weekend-wpb/',
      'Clematis Street bar with billiards, vintage games, craft beer, and late-night food.'
    )
) AS seed(
  slug,
  name,
  address,
  venue_type,
  latitude,
  longitude,
  phone,
  website_url,
  description
)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.markets m
SET venue_count = (
      SELECT count(*)::INTEGER
      FROM public.venues v
      WHERE v.market_id = m.id
    ),
    last_imported_at = NOW(),
    updated_at = NOW()
WHERE m.market_key = 'west palm beach|FL';
