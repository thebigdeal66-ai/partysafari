-- Seed the curated Ocean City public-beta nightlife catalog.
-- Venue identity/contact details were verified against current first-party or
-- Town of Ocean City tourism pages on 2026-08-06. Coordinates are geocoded
-- from those source addresses using OpenStreetMap/Nominatim.
-- Listings are intentionally unclaimed and unverified; business ownership
-- must continue through the venue claim flow.

WITH ocean_city AS (
  SELECT id
  FROM public.markets
  WHERE market_key = 'ocean city|MD'
)
INSERT INTO public.venues (
  slug, name, address, city, state, postal_code, description, verified, owner_id,
  venue_type, latitude, longitude, phone, website_url, current_status, market_id
)
SELECT
  seed.slug, seed.name, seed.address, 'Ocean City', 'MD', '21842',
  seed.description, FALSE, NULL, seed.venue_type, seed.latitude, seed.longitude,
  seed.phone, seed.website_url, 'unknown', ocean_city.id
FROM ocean_city
CROSS JOIN (
  VALUES
    ('fish-tales-ocean-city','Fish Tales','2107 Herring Way','restaurant_bar',38.3515179::double precision,-75.0784412::double precision,'(410) 289-0990','https://www.ocfishtales.com/','Bayfront bar and grill at Bahia Marina with a lively outdoor nightlife atmosphere.'),
    ('pickles-pub-ocean-city','Pickles Pub','706 Philadelphia Ave','live_music_bar',38.3386237::double precision,-75.0837009::double precision,'(410) 289-4891','https://www.picklesoc.com/','Downtown sports pub with bands on stage and late-night hours.'),
    ('crawl-street-tavern','Crawl Street Tavern','19 Wicomico St','live_music_bar',38.3283588::double precision,-75.0876166::double precision,'(443) 373-2756','https://crawlstreet.com/','Downtown tavern and intimate live-music venue on Wicomico Street.'),
    ('coins-pub-ocean-city','Coins Pub & Restaurant','2820 Philadelphia Ave','pub',38.3573746::double precision,-75.0750798::double precision,'(410) 289-3100','https://www.coinspuboc.com/','Long-running pub and restaurant near 28th Street.'),
    ('ropewalk-ocean-city','Ropewalk Ocean City','8203 Coastal Hwy','restaurant_bar',38.4017632::double precision,-75.0624048::double precision,'(410) 524-1009','https://oceancity.ropewalk.com/','Bayfront restaurant and bar with live entertainment, sunsets, and outdoor seating.'),
    ('coconuts-beach-bar','Coconuts Beach Bar & Grill','3701 Atlantic Ave','live_music_bar',38.3650463::double precision,-75.0703615::double precision,'(410) 289-6846','https://coconutsbeachbar.com/','Oceanfront beach bar at Castle in the Sand with live music and tropical drinks.'),
    ('liquid-assets-ocean-city','Liquid Assets','9301 Coastal Hwy','bar',38.4087115::double precision,-75.0586064::double precision,'(410) 524-7037','https://la94.com/','Uptown restaurant and bar known for wine, whiskey, cocktails, and late-evening drinks.'),
    ('kirbys-pub-ocean-city','Kirby''s Pub','9209 Coastal Hwy','pub',38.4081778::double precision,-75.0587075::double precision,'(410) 723-1700','https://www.kirbyspuboc.com/','Neighborhood uptown pub with daily late-night bar hours.'),
    ('dry-85-ocean-city','DRY 85','12 48th St','bar',38.3734559::double precision,-75.0691476::double precision,'(443) 664-8989','https://www.dry85.com/ocean-city/','Prohibition-inspired bar focused on bourbon, craft beer, cocktails, and late-night service.'),
    ('bearded-clam-ocean-city','The Bearded Clam','15 Wicomico St','pub',38.3283410::double precision,-75.0874290::double precision,'(410) 289-4498','https://www.thebeardedclam.com/','Downtown bar and liquor store serving Ocean City since 1978, with pool, darts, and a jukebox.'),
    ('skye-bar-ocean-city','Skye Bar','6601 Coastal Hwy','live_music_bar',38.3884641::double precision,-75.0657926::double precision,'(410) 723-6762','https://skyebaroc.com/','Open-air rooftop bar with bay views, cocktails, live music, and late-night energy.'),
    ('mr-ducks-ocean-city','M.R. Ducks','311 Talbot St','live_music_bar',38.3311792::double precision,-75.0892340::double precision,'(410) 289-9125','https://mrducks.com/','Seasonal downtown bayfront bar and grille with outdoor live entertainment.'),
    ('treehouse-bar-ocean-city','Treehouse Bar','216 S Baltimore Ave','bar',38.3303055::double precision,-75.0869203::double precision,'(410) 289-4040','https://www.ococean.com/listing/treehouse-bar/642/','Cozy downtown cocktail bar on South Baltimore Avenue.'),
    ('45th-street-taphouse','45th Street Taphouse','4507 Coastal Hwy','restaurant_bar',38.3716555::double precision,-75.0720321::double precision,'(443) 664-2201','https://www.octaphouses.com/taphouse45th','Bayfront taproom with craft beer, cocktails, and sunset views.'),
    ('the-wedge-ocean-city','The Wedge','806 S Atlantic Ave','live_music_bar',38.3254831::double precision,-75.0882205::double precision,'(443) 664-6051','https://thewedgeoc.com/','Waterfront inlet bar with cocktails, food, and live music.'),
    ('the-angler-ocean-city','The Angler','312 Talbot St','restaurant_bar',38.3317957::double precision,-75.0896565::double precision,'(410) 520-1938','https://www.angleronthebay.com/','Historic downtown waterfront restaurant and bar with happy hour and evening entertainment.'),
    ('bourbon-street-on-the-beach','Bourbon Street on the Beach','12601 Coastal Hwy','live_music_bar',38.4314989::double precision,-75.0547181::double precision,'(443) 664-2896','https://www.bourbonstreetonthebeach.com/','Uptown New Orleans-inspired restaurant and full bar with live music.'),
    ('alley-oops-midtown','Alley Oops Midtown','5509 Coastal Hwy','sports_bar',38.3796576::double precision,-75.0683876::double precision,'(443) 664-7084','https://midtown.alleyoopsoc.com/','Midtown sports bar and entertainment venue with bowling, arcade games, and late-night food.'),
    ('spain-wine-bar-ocean-city','Spain Wine Bar','13 St Louis Ave','wine_bar',38.3330876::double precision,-75.0893661::double precision,'(410) 520-4541','https://www.spainwinebar.com/','Rooftop wine and cocktail bar overlooking the bay in downtown Ocean City.'),
    ('tequila-mockingbird-ocean-city','Tequila Mockingbird','12919 Coastal Hwy','restaurant_bar',38.4345967::double precision,-75.0542525::double precision,'(410) 250-4424','https://www.octequila.com/','North Ocean City Mexican restaurant and bar with a large tequila selection and daily happy hour.'),
    ('bad-monkey-58th-street','Bad Monkey 58th Street','5801 Coastal Hwy','restaurant_bar',38.3820090::double precision,-75.0676150::double precision,'(443) 856-2885','https://badmonkeyoc.com/','Midtown bar and grill with a broad craft beer selection and beach happy hour.')
) AS seed(slug,name,address,venue_type,latitude,longitude,phone,website_url,description)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.markets AS m
SET venue_count = (
      SELECT count(*)::integer
      FROM public.venues AS v
      WHERE v.market_id = m.id
    ),
    last_imported_at = now(),
    updated_at = now()
WHERE m.market_key = 'ocean city|MD';
