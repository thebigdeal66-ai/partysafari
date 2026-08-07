-- Seed claimable performer identities from verified PartySafari August 2026 event listings.
-- Profiles intentionally contain only verified identity/type fields; owners can add bios/socials after claiming.
-- Idempotent by performer slug and event/performer primary key.

WITH seed(slug, stage_name, performer_type) AS (
  VALUES
    ('tripwire','TRIPWIRE','Band'),
    ('charlie-travers','Charlie Travers','Artist'),
    ('the-harbor-boys','The Harbor Boys','Band'),
    ('my-dirty-little-secret','My Dirty Little Secret','Band'),
    ('dj-cascio','DJ Cascio','DJ'),
    ('dj-e-state','DJ E-State','DJ'),
    ('dj-ruckus','DJ Ruckus','DJ'),
    ('seven-suns','Seven Suns','Band'),
    ('dj-j-spinz','DJ J-Spinz','DJ'),
    ('the-expendables','The Expendables','Band'),
    ('lower-case-blues','Lower Case Blues','Band'),
    ('making-waves','Making Waves','Band'),
    ('star-spangled-hustlers','Star Spangled Hustlers','Band'),
    ('surreal','SURREAL','Band'),
    ('tranzfusion','Tranzfusion','Band'),
    ('whyte-house-band','Whyte House Band','Band'),
    ('dj-accelerate','DJ Accelerate','DJ'),
    ('the-klassix','The Klassix','Band'),
    ('matisyahu','Matisyahu','Artist'),
    ('big-machine','Big Machine','Band'),
    ('party-fowl','PARTY FOWL','Band'),
    ('deep-six','Deep Six','Band'),
    ('garden-state-radio','Garden State Radio','Band'),
    ('chest-pains','Chest Pains','Band'),
    ('lopaka-rootz','Lopaka Rootz','Artist'),
    ('the-reagan-years','THE REAGAN YEARS','Band'),
    ('other-brother-darryl','Other Brother Darryl','Band')
)
INSERT INTO public.performers(slug, stage_name, performer_type)
SELECT slug, stage_name, performer_type
FROM seed
ON CONFLICT (slug) DO NOTHING;

WITH links(slug, event_title) AS (
  VALUES
    ('tripwire','TRIPWIRE'),
    ('charlie-travers','CHARLIE TRAVERS'),
    ('the-harbor-boys','Live Music: The Harbor Boys'),
    ('my-dirty-little-secret','My Dirty Little Secret'),
    ('dj-cascio','DJ CASCIO'),
    ('dj-e-state','DJ E-State Live at Seacrets Beach'),
    ('dj-ruckus','DJ Ruckus'),
    ('seven-suns','Summer Concert Series: Seven Suns'),
    ('dj-j-spinz','DJ J-Spinz Live at Tiki'),
    ('the-expendables','Summer Concert Series: The Expendables'),
    ('lower-case-blues','Live Music: Lower Case Blues'),
    ('making-waves','Making Waves'),
    ('star-spangled-hustlers','Star Spangled Hustlers'),
    ('surreal','SURREAL'),
    ('tranzfusion','Tranzfusion'),
    ('whyte-house-band','Whyte House Band'),
    ('dj-accelerate','DJ Accelerate'),
    ('the-klassix','The Klassix'),
    ('matisyahu','Summer Concert Series: Matisyahu'),
    ('big-machine','Big Machine'),
    ('party-fowl','PARTY FOWL'),
    ('deep-six','Live Music: Deep Six'),
    ('garden-state-radio','Garden State Radio'),
    ('chest-pains','Chest Pains'),
    ('lopaka-rootz','Lopaka Rootz - Chasing Dreams Summer Tour'),
    ('the-reagan-years','THE REAGAN YEARS'),
    ('other-brother-darryl','Other Brother Darryl')
)
INSERT INTO public.event_performers(event_id, performer_id, billing_order)
SELECT event.id, performer.id, 1
FROM links
JOIN public.performers AS performer ON performer.slug = links.slug
JOIN public.events AS event ON lower(event.title) = lower(links.event_title)
WHERE event.status = 'published'
  AND event.city IN ('Salisbury','Ocean City')
  AND event.start_time >=
      ('2026-08-07 00:00'::timestamp AT TIME ZONE 'America/New_York')
ON CONFLICT (event_id, performer_id) DO NOTHING;
