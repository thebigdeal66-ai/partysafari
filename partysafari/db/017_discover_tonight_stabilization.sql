-- Migration 017: Discover Tonight stabilization
-- Purpose: ensure Discover-critical schema exists with safe defaults, RLS, indexes, and realtime publication entries.

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  venue_type TEXT,
  city TEXT,
  state TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  image_url TEXT,
  photo_url TEXT,
  current_status TEXT,
  music_genres TEXT[] DEFAULT '{}',
  drink_specials TEXT,
  description TEXT,
  vip_available BOOLEAN NOT NULL DEFAULT FALSE,
  food_available BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS venue_type TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS current_status TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS music_genres TEXT[] DEFAULT '{}';
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS drink_specials TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS vip_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS food_available BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_venues_slug ON public.venues (slug);
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_current_status ON public.venues (current_status);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues"
  ON public.venues
  FOR SELECT
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Stories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL,
  caption TEXT,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stories_author_id ON public.stories (author_id);
CREATE INDEX IF NOT EXISTS idx_stories_venue_id ON public.stories (venue_id);
CREATE INDEX IF NOT EXISTS idx_stories_event_id ON public.stories (event_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON public.stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_active_lookup ON public.stories (deleted_at, expires_at);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active stories" ON public.stories;
CREATE POLICY "Anyone can read active stories"
  ON public.stories
  FOR SELECT
  USING (deleted_at IS NULL AND expires_at > NOW());

DROP POLICY IF EXISTS "Users can insert own stories" ON public.stories;
CREATE POLICY "Users can insert own stories"
  ON public.stories
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Users can soft-delete own stories" ON public.stories;
CREATE POLICY "Users can soft-delete own stories"
  ON public.stories
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- Venue check-ins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours')
);

ALTER TABLE public.venue_checkins ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE;
ALTER TABLE public.venue_checkins ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.venue_checkins ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.venue_checkins ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '4 hours');

CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_checkins_unique_active
  ON public.venue_checkins (venue_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_venue_id ON public.venue_checkins (venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_profile_id ON public.venue_checkins (profile_id);
CREATE INDEX IF NOT EXISTS idx_venue_checkins_expires_at ON public.venue_checkins (expires_at);

ALTER TABLE public.venue_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active venue checkins" ON public.venue_checkins;
CREATE POLICY "Anyone can read active venue checkins"
  ON public.venue_checkins
  FOR SELECT
  USING (expires_at > NOW());

DROP POLICY IF EXISTS "Users can insert own venue checkins" ON public.venue_checkins;
CREATE POLICY "Users can insert own venue checkins"
  ON public.venue_checkins
  FOR INSERT
  WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS "Users can delete own venue checkins" ON public.venue_checkins;
CREATE POLICY "Users can delete own venue checkins"
  ON public.venue_checkins
  FOR DELETE
  USING (auth.uid() = profile_id);

-- Optional compatibility view for systems that still reference check_ins.
DO $$
BEGIN
  IF to_regclass('public.check_ins') IS NULL THEN
    EXECUTE 'CREATE VIEW public.check_ins AS SELECT id, venue_id, profile_id AS user_id, created_at, expires_at FROM public.venue_checkins';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friendships_not_self CHECK (user_id <> friend_id)
);

ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS friend_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.friendships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON public.friendships (user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON public.friendships (user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON public.friendships (friend_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
CREATE POLICY "Users can view own friendships"
  ON public.friendships
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can insert own friendships" ON public.friendships;
CREATE POLICY "Users can insert own friendships"
  ON public.friendships
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() = friend_id);

DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;
CREATE POLICY "Users can delete own friendships"
  ON public.friendships
  FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ---------------------------------------------------------------------------
-- Events: compatibility columns for Discover query payload
-- ---------------------------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS performer_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS drink_specials TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS cover_image TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticket_link TEXT;

CREATE INDEX IF NOT EXISTS idx_events_event_type ON public.events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_featured ON public.events (featured);

-- ---------------------------------------------------------------------------
-- Story metrics (required by stories rail + party score)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_views_story_viewer_unique UNIQUE (story_id, viewer_id)
);

ALTER TABLE public.story_views ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_story_views_story_id ON public.story_views (story_id);
CREATE INDEX IF NOT EXISTS idx_story_views_viewer_id ON public.story_views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_views_created_at ON public.story_views (created_at DESC);

CREATE TABLE IF NOT EXISTS public.story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  reactor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_reactions_story_reactor_reaction_unique UNIQUE (story_id, reactor_id, reaction),
  CONSTRAINT story_reactions_reaction_length_check CHECK (char_length(reaction) >= 1 AND char_length(reaction) <= 16)
);

CREATE INDEX IF NOT EXISTS idx_story_reactions_story_id ON public.story_reactions (story_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_reactor_id ON public.story_reactions (reactor_id);
CREATE INDEX IF NOT EXISTS idx_story_reactions_created_at ON public.story_reactions (created_at DESC);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read story views" ON public.story_views;
CREATE POLICY "Anyone can read story views"
  ON public.story_views
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Users can insert their own story views" ON public.story_views;
CREATE POLICY "Users can insert their own story views"
  ON public.story_views
  FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Users can delete their own story views" ON public.story_views;
CREATE POLICY "Users can delete their own story views"
  ON public.story_views
  FOR DELETE
  USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Anyone can read story reactions" ON public.story_reactions;
CREATE POLICY "Anyone can read story reactions"
  ON public.story_reactions
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "Users can insert their own story reactions" ON public.story_reactions;
CREATE POLICY "Users can insert their own story reactions"
  ON public.story_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = reactor_id);

DROP POLICY IF EXISTS "Users can delete their own story reactions" ON public.story_reactions;
CREATE POLICY "Users can delete their own story reactions"
  ON public.story_reactions
  FOR DELETE
  USING (auth.uid() = reactor_id);

-- ---------------------------------------------------------------------------
-- Follows read policy remediation (RLS denial in production)
-- ---------------------------------------------------------------------------
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all follows" ON public.follows;
CREATE POLICY "Users can view all follows"
  ON public.follows
  FOR SELECT
  USING (TRUE);

GRANT SELECT ON public.follows TO anon, authenticated;
GRANT SELECT ON public.story_views TO anon, authenticated;
GRANT SELECT ON public.story_reactions TO anon, authenticated;
GRANT SELECT ON public.friendships TO anon, authenticated;
GRANT SELECT ON public.venue_checkins TO anon, authenticated;
GRANT SELECT ON public.stories TO anon, authenticated;
GRANT SELECT ON public.venues TO anon, authenticated;
GRANT SELECT ON public.events TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication coverage for Discover tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venues;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.venue_checkins;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_rsvps;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
