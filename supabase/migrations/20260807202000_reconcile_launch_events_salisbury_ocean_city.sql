-- Reconcile the verified PartySafari launch-event data applied on 2026-08-07.
-- Two Sound Bites rows were based on a page labeled 2025 and remain unpublished.
-- The event seed is idempotent by venue + title + exact start time.

UPDATE public.events AS event
SET status = 'draft'
FROM public.venues AS venue
WHERE event.venue_id = venue.id
  AND (
    (
      venue.slug = 'burnish-beer-co-salisbury'
      AND lower(event.title) = lower('Bootleg Bros')
      AND event.start_time = ('2026-08-08 18:00'::timestamp AT TIME ZONE 'America/New_York')
    )
    OR
    (
      venue.slug = 'brew-river-salisbury'
      AND lower(event.title) = lower('On The Edge')
      AND event.start_time = ('2026-08-22 18:00'::timestamp AT TIME ZONE 'America/New_York')
    )
  );

WITH seed(
  title, venue_slug, description, start_local, end_local, source_url, genre
) AS (
  VALUES
    ('TRIPWIRE','purple-moose-saloon','Live rock at Purple Moose Saloon.','2026-08-07 22:00',NULL,'https://purplemoosesaloon.com/calendar/','Live Music'),
    ('CHARLIE TRAVERS','purple-moose-saloon','Live music at Purple Moose Saloon.','2026-08-08 14:00','2026-08-08 18:00','https://purplemoosesaloon.com/calendar/','Live Music'),
    ('Live Music: The Harbor Boys','mackys-bayside','Live music on the bay at Macky''s Bayside.','2026-08-08 17:00','2026-08-08 20:00','https://www.mackys.com/events','Live Music'),
    ('DJ CASCIO','mackys-bayside','Late-night DJ set at Macky''s Bayside.','2026-08-08 21:00',NULL,'https://www.mackys.com/events','DJ'),
    ('Drink Beer! Save Turtles!','burnish-beer-co-salisbury','Annual Chesapeake AAZK and Turtle Survival Alliance fundraiser at Burnish Beer Co.','2026-08-10 16:00','2026-08-10 21:00','https://burnishbeerco.com/calendar','Social'),
    ('Theme Night: Little Black Dress','mackys-bayside','Costume theme night with DJ at Macky''s Bayside.','2026-08-11 22:00',NULL,'https://www.mackys.com/events','DJ'),
    ('Live Music: Lower Case Blues','mackys-bayside','Live music on the bay at Macky''s Bayside.','2026-08-14 17:00','2026-08-14 20:00','https://www.mackys.com/events','Live Music'),
    ('SURREAL','purple-moose-saloon','Live rock at Purple Moose Saloon.','2026-08-14 22:00',NULL,'https://purplemoosesaloon.com/calendar/','Live Music'),
    ('DJ Accelerate','mackys-bayside','Late-night DJ set at Macky''s Bayside.','2026-08-15 21:00','2026-08-16 01:00','https://www.mackys.com/events','DJ'),
    ('Jeep Meet','burnish-beer-co-salisbury','Delmarva Jeep Events social meet at Burnish Beer Co.','2026-08-20 18:00','2026-08-20 20:00','https://burnishbeerco.com/calendar','Social'),
    ('PARTY FOWL','purple-moose-saloon','Live rock at Purple Moose Saloon.','2026-08-21 22:00',NULL,'https://purplemoosesaloon.com/calendar/','Live Music'),
    ('Live Music: Deep Six','mackys-bayside','Live music on the bay at Macky''s Bayside.','2026-08-22 17:00','2026-08-22 20:00','https://www.mackys.com/events','Live Music'),
    ('Lopaka Rootz - Chasing Dreams Summer Tour','crawl-street-tavern','Free live reggae show at Crawl Street Tavern.','2026-08-28 20:00','2026-08-28 23:00','https://crawlstreet.com/events/','Live Music'),
    ('THE REAGAN YEARS','purple-moose-saloon','Live rock at Purple Moose Saloon.','2026-08-28 22:00',NULL,'https://purplemoosesaloon.com/calendar/','Live Music')
)
INSERT INTO public.events(
  venue_id, title, description, start_time, end_time,
  ticket_url, ticket_link, status, city, state, genre, event_date, venue_name
)
SELECT
  venue.id,
  seed.title,
  seed.description,
  seed.start_local::timestamp AT TIME ZONE 'America/New_York',
  CASE
    WHEN seed.end_local IS NULL THEN NULL
    ELSE seed.end_local::timestamp AT TIME ZONE 'America/New_York'
  END,
  seed.source_url,
  seed.source_url,
  'published',
  venue.city,
  venue.state,
  seed.genre,
  seed.start_local::date,
  venue.name
FROM seed
JOIN public.venues AS venue ON venue.slug = seed.venue_slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.events AS existing
  WHERE existing.venue_id = venue.id
    AND lower(existing.title) = lower(seed.title)
    AND existing.start_time =
      (seed.start_local::timestamp AT TIME ZONE 'America/New_York')
);
