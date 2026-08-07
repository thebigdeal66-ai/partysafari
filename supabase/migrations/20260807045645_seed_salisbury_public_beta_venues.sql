-- Seed the curated Salisbury public-beta nightlife catalog.
-- Venue identity/contact details were verified against current first-party,
-- Salisbury University/local tourism, or official business pages on 2026-08-07.
-- Coordinates were matched to exact addresses with the U.S. Census geocoder;
-- OpenStreetMap/Nominatim was used to verify Salisbury's market center.
-- Listings are intentionally unclaimed and unverified. Business ownership must
-- continue through PartySafari's venue claim flow.

INSERT INTO public.markets (
  market_key, slug, city, state, status, center_latitude, center_longitude,
  venue_count, last_imported_at
)
VALUES (
  'salisbury|MD', 'salisbury-md', 'Salisbury', 'MD', 'active',
  38.3660270, -75.6009964, 14, now()
)
ON CONFLICT (market_key) DO UPDATE SET
  slug = excluded.slug,
  city = excluded.city,
  state = excluded.state,
  status = excluded.status,
  center_latitude = excluded.center_latitude,
  center_longitude = excluded.center_longitude,
  venue_count = excluded.venue_count,
  last_imported_at = excluded.last_imported_at,
  updated_at = now();

WITH seed(
  slug, name, address, postal_code, latitude, longitude, phone, website_url,
  venue_type, description, food_available, age_min
) AS (
  VALUES
    ('brew-river-salisbury','Brew River Seafood House & Dock Bar','502 W Main St','21801',38.365162741907::double precision,-75.605126930750::double precision,'(410) 677-6757','https://brewriver.com/','live_music_bar','Waterfront seafood house and dock bar with live music, DJs, sports, and late-night entertainment.',true,null::integer),
    ('crocos-bar-salisbury','Crocos Bar','1303 B S Salisbury Blvd','21801',38.344042247726,-75.603797418039,'(443) 358-6114','https://crocosbar.com/','nightclub','College-oriented nightlife bar with 21+ nights, DJs, karaoke, line dancing, and live entertainment.',true,21),
    ('hoppers-tap-house-salisbury','Hopper''s Tap House','1400 S Salisbury Blvd','21801',38.341392475777,-75.605579238524,'(443) 944-9633','https://www.hopperstaphouse.com/','sports_bar','Tap house with more than 40 draft beers, a full bar, sports viewing, events, and late-night hours.',true,null),
    ('roadie-joes-salisbury','Roadie Joe''s Bar & Grill','213 W Main St','21801',38.365325319873,-75.602687966370,'(443) 944-9156','https://roadiejoes.com/','restaurant_bar','Downtown Salisbury bar and grill with 20 beers on tap, daily specials, events, and an outdoor patio.',true,null),
    ('bury-tavern-salisbury','Bury Tavern','212 W Main St','21801',38.365287734264,-75.601745736902,'(667) 289-2879','https://www.instagram.com/bury_tavern/','bar','Western-themed downtown tavern serving food and drinks with live entertainment and social events.',true,null),
    ('mojos-urban-eatery-salisbury','MoJo''s Urban Eatery','213 E Main St','21801',38.365702457175,-75.598164484631,'(443) 944-9507','https://mojossalisbury.com/','restaurant_bar','Lively downtown restaurant and bar with craft beer, sports, music, happy hour, and a social late-night atmosphere.',true,null),
    ('brick-room-salisbury','The Brick Room','116 N Division St','21801',38.365709644707,-75.600585890731,'(443) 358-5092','https://www.brickroomsby.com/','bar','Downtown cocktail, craft beer, and wine lounge with a speakeasy-style atmosphere and recurring entertainment.',true,null),
    ('irish-penny-salisbury','The Irish Penny Pub & Grill','1014 S Salisbury Blvd','21801',38.350514100779,-75.601782498589,'(410) 742-0002','https://theirishpennypub.com/','pub','Irish-American pub and grill with a full bar, weekly specials, trivia, and late-night service.',true,null),
    ('evolution-craft-brewing-salisbury','Evolution Craft Brewing Company','201 E Vine St','21804',38.360657634226,-75.596472990619,'(443) 260-2337','https://www.evolutioncraftbrewing.com/','brewery','Salisbury craft brewery and public house with a tasting room, beer garden, brewery tours, and live music.',true,null),
    ('burnish-beer-co-salisbury','Burnish Beer Co.','2305 Northwood Dr, Suite E','21801',38.407856675710,-75.576441535451,'(443) 978-7320','https://burnishbeerco.com/','brewery','Locally owned craft brewery and taproom with 16 rotating beers, cocktails, a biergarten, trivia, and community events.',true,null),
    ('specific-gravity-salisbury','Specific Gravity Pizzeria & Beer Joint','105 E College Ave','21804',38.347995436170,-75.596999597332,'(443) 859-8412','https://specificgravitypizza.com/','restaurant_bar','Neighborhood pizzeria and beer joint near Salisbury University with craft beer, events, and group gatherings.',true,null),
    ('sobos-wine-beerstro-salisbury','SoBo''s Wine Beerstro','1015 Eastern Shore Dr','21804',38.349501674503,-75.597865109749,'(410) 219-1117','https://www.soboswinebeerstro.com/','wine_bar','Wine, craft beer, and cocktail-focused bistro with a full bar and evening dining near Salisbury University.',true,null),
    ('market-street-inn-salisbury','Market Street Inn','130 W Market St','21801',38.363617507347,-75.602338847144,'(410) 742-4145','https://www.marketstreetinnsalisbury.com/','restaurant_bar','Downtown waterfront restaurant and pub known for its bar, extensive wine selection, events, and evening atmosphere.',true,null),
    ('mogans-oyster-house-salisbury','Mogan''s Oyster House','100 E Main St, Suite 111','21801',38.365442470212,-75.600508251557,'(410) 834-2824','https://www.mogansoysterhouse.com/','restaurant_bar','Downtown seafood and oyster house featuring a long oak bar, raw bar, cocktails, and a lively modern dining room.',true,null)
)
INSERT INTO public.venues (
  slug, name, address, city, state, postal_code, latitude, longitude, phone,
  website_url, venue_type, description, food_available, age_min, owner_id,
  verified, current_status, market_id
)
SELECT
  seed.slug, seed.name, seed.address, 'Salisbury', 'MD', seed.postal_code,
  seed.latitude, seed.longitude, seed.phone, seed.website_url, seed.venue_type,
  seed.description, seed.food_available, seed.age_min, NULL, FALSE, 'unknown',
  markets.id
FROM seed
CROSS JOIN public.markets
WHERE markets.market_key = 'salisbury|MD'
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  state = excluded.state,
  postal_code = excluded.postal_code,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  phone = excluded.phone,
  website_url = excluded.website_url,
  venue_type = excluded.venue_type,
  description = excluded.description,
  food_available = excluded.food_available,
  age_min = excluded.age_min,
  current_status = excluded.current_status,
  market_id = excluded.market_id,
  updated_at = now();

UPDATE public.markets AS market
SET
  venue_count = (
    SELECT count(*)::integer
    FROM public.venues AS venue
    WHERE venue.market_id = market.id
  ),
  last_imported_at = now(),
  updated_at = now()
WHERE market.market_key = 'salisbury|MD';
