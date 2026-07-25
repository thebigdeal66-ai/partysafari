-- Story metrics: persistent views + reactions with duplicate prevention and realtime support

CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_views_story_viewer_unique UNIQUE (story_id, viewer_id)
);

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

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
