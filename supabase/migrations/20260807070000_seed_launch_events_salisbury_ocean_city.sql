-- Seed verified launch-window nightlife events for Salisbury and Ocean City.
-- Sources were checked on 2026-08-07 against current first-party venue calendars
-- plus the City of Salisbury Sound Bites schedule.
-- This seed is idempotent by venue + title + exact start time.

WITH seed(
  title, venue_slug, description, start_local, end_local, source_url, genre
) AS (
  VALUES
    ('Bootleg Bros','burnish-beer-co-salisbury','Sound Bites Tour live music at Burnish Beer Co.','2026-08-08 18:00','2026-08-08 21:00','https://salisbury.md/soundbites','Live Music'),
    ('My Dirty Little Secret','brew-river-salisbury','Live music at Brew River.','2026-08-08 17:00','2026-08-08 21:00','https://brewriver.com/calendar/','Live Music'),
    ('DJ Ruckus','brew-river-salisbury','Late-night DJ set at Brew River.','2026-08-08 22:00','2026-08-09 02:00','https://brewriver.com/calendar/','DJ'),
    ('Star Spangled Hustlers','brew-river-salisbury','Live music at Brew River.','2026-08-14 18:00','2026-08-14 22:00','https://brewriver.com/calendar/','Live Music'),
    ('Tranzfusion','brew-river-salisbury','Live music at Brew River.','2026-08-15 17:00','2026-08-15 21:00','https://brewriver.com/calendar/','Live Music'),
    ('Whyte House Band','brew-river-salisbury','Live music at Brew River.','2026-08-15 20:00','2026-08-16 00:00','https://brewriver.com/calendar/','Live Music'),
    ('DJ Ruckus','brew-river-salisbury','Late-night DJ set at Brew River.','2026-08-15 22:00','2026-08-16 02:00','https://brewriver.com/calendar/','DJ'),
    ('On The Edge','brew-river-salisbury','Sound Bites Tour live music at Brew River.','2026-08-22 18:00','2026-08-22 21:00','https://salisbury.md/soundbites','Live Music'),
    ('Chest Pains','brew-river-salisbury','Live music at Brew River.','2026-08-28 18:00','2026-08-28 22:00','https://brewriver.com/calendar/','Live Music'),
    ('DJ E-State Live at Seacrets Beach','seacrets-ocean-city','DJ E-State live at Seacrets.','2026-08-08 21:00','2026-08-09 02:00','https://seacrets.com/event/dj-e-state-at-tiki-stage-2-4-2-10/2026-08-08/','DJ'),
    ('Summer Concert Series: Seven Suns','seacrets-ocean-city','Seacrets Summer Concert Series.','2026-08-11 19:00','2026-08-11 22:00','https://seacrets.com/event/summer-concert-series-seven-suns/','Live Music'),
    ('DJ J-Spinz Live at Tiki','seacrets-ocean-city','DJ J-Spinz live at Seacrets Tiki Stage.','2026-08-11 21:00','2026-08-12 02:00','https://seacrets.com/event/dj-j-spinz-tiki-bar-live-4-3-2-2-3/2026-08-11/','DJ'),
    ('Summer Concert Series: The Expendables','seacrets-ocean-city','Seacrets Summer Concert Series.','2026-08-12 19:00','2026-08-12 22:00','https://seacrets.com/event/summer-concert-series-the-expendables/','Live Music'),
    ('Summer Concert Series: Matisyahu','seacrets-ocean-city','Seacrets Summer Concert Series.','2026-08-18 19:00',NULL,'https://seacrets.com/event/summer-concert-series-matisyahu/','Live Music'),
    ('Lunasea Glow Party!','seacrets-ocean-city','Featured late-night glow party at Seacrets.','2026-08-18 21:00','2026-08-19 02:00','https://seacrets.com/event/lunasea-glow-party-5/','Party'),
    ('Garden State Radio','seacrets-ocean-city','Live performance at Seacrets.','2026-08-22 22:00','2026-08-23 01:50','https://seacrets.com/event/garden-state-radio/2026-08-22/','Live Music'),
    ('Salt Water Sweat Line Dancing','fagers-island','Instruction and open line dancing on the deck at Fager''s Island.','2026-08-11 18:00','2026-08-11 22:00','https://www.fagers.com/entertainment/zm4ajypsd3gnr62','Line Dancing'),
    ('Making Waves','fagers-island','Live 80s and 90s rock, pop and alternative at Fager''s Island.','2026-08-14 17:30','2026-08-14 21:30','https://www.fagers.com/entertainment','Live Music'),
    ('The Klassix','fagers-island','Live music at Fager''s Island.','2026-08-17 17:30','2026-08-17 21:30','https://www.fagers.com/entertainment/t8v0p0kq724h1sor4vkah0vrelfhy0-4bkwh-h4n3r-87c68-3l3wm-h3rp2-hsf9k-rs2mh-fj924-382z2-ljyp5-97hgg-agltj-fb9xk','Live Music'),
    ('Big Machine','fagers-island','High-energy 80s and 90s rock and alternative at Fager''s Island.','2026-08-21 17:30','2026-08-21 21:30','https://www.fagers.com/entertainment/t8v0p0kq724h1sor4vkah0vrelfhy0-4bkwh-h4n3r-87c68-3l3wm-mck49-ay6ab-dm5wy-lld9g-defhl-zkkhp-r7nal-g6f2b-s7x4j-jbbds-7gszp-mrldp-tpded-n8txw-lshd8','Live Music'),
    ('Other Brother Darryl','fagers-island','Live music at Fager''s Island.','2026-08-29 17:30','2026-08-29 21:30','https://www.fagers.com/entertainment/t8v0p0kq724h1sor4vkah0vrelfhy0-4bkwh-h4n3r-87c68-3l3wm-h3rp2-hsf9k-mnn5z-hm84h-haww6-z73dz-hcze6-p3tth-jzt5f-kepn7-98flw-hjkr4-z83le-ekxy7-4w5gj-r6yxl-xthh3-mzkyt-b822a','Live Music')
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
