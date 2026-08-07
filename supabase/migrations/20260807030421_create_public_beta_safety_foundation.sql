-- Public-beta safety foundation: private reports, user blocks, and social contact enforcement.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('profile', 'story', 'event', 'venue', 'message', 'other')),
  target_id UUID,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'impersonation', 'spam', 'unsafe', 'illegal', 'other')),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_created
  ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_created
  ON public.content_reports (reporter_id, created_at DESC);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reporters can read their own reports" ON public.content_reports;
CREATE POLICY "Reporters can read their own reports"
  ON public.content_reports
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.content_reports;
CREATE POLICY "Authenticated users can submit reports"
  ON public.content_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND status = 'open'
    AND reviewed_at IS NULL
  );

REVOKE ALL ON public.content_reports FROM anon;
GRANT SELECT, INSERT ON public.content_reports TO authenticated;

CREATE TABLE IF NOT EXISTS public.profile_blocks (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_blocks_blocked
  ON public.profile_blocks (blocked_id, blocker_id);

ALTER TABLE public.profile_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own blocks" ON public.profile_blocks;
CREATE POLICY "Users can read their own blocks"
  ON public.profile_blocks
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Users can create their own blocks" ON public.profile_blocks;
CREATE POLICY "Users can create their own blocks"
  ON public.profile_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = blocker_id AND blocker_id <> blocked_id);

DROP POLICY IF EXISTS "Users can remove their own blocks" ON public.profile_blocks;
CREATE POLICY "Users can remove their own blocks"
  ON public.profile_blocks
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = blocker_id);

REVOKE ALL ON public.profile_blocks FROM anon;
GRANT SELECT, INSERT, DELETE ON public.profile_blocks TO authenticated;

CREATE OR REPLACE FUNCTION private.is_profile_blocked(p_left UUID, p_right UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_blocks b
    WHERE (b.blocker_id = p_left AND b.blocked_id = p_right)
       OR (b.blocker_id = p_right AND b.blocked_id = p_left)
  )
$$;

REVOKE ALL ON FUNCTION private.is_profile_blocked(UUID, UUID) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_profile_blocked(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.conversation_has_block(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.profile_blocks b
      ON (b.blocker_id = p_profile_id AND b.blocked_id = cp.profile_id)
      OR (b.blocked_id = p_profile_id AND b.blocker_id = cp.profile_id)
    WHERE cp.conversation_id = p_conversation_id
      AND cp.profile_id <> p_profile_id
  )
$$;

REVOKE ALL ON FUNCTION private.conversation_has_block(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.conversation_has_block(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.cleanup_profile_block()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM public.follows
  WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
     OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);

  DELETE FROM public.friend_requests
  WHERE (sender_id = NEW.blocker_id AND receiver_id = NEW.blocked_id)
     OR (sender_id = NEW.blocked_id AND receiver_id = NEW.blocker_id);

  DELETE FROM public.friendships
  WHERE (user_id = NEW.blocker_id AND friend_id = NEW.blocked_id)
     OR (user_id = NEW.blocked_id AND friend_id = NEW.blocker_id);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_profile_block() FROM PUBLIC;

DROP TRIGGER IF EXISTS cleanup_relationships_after_profile_block ON public.profile_blocks;
CREATE TRIGGER cleanup_relationships_after_profile_block
AFTER INSERT ON public.profile_blocks
FOR EACH ROW
EXECUTE FUNCTION private.cleanup_profile_block();

DROP POLICY IF EXISTS "follows_insert_self" ON public.follows;
CREATE POLICY "follows_insert_self"
  ON public.follows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    follower_id = (SELECT auth.uid())
    AND NOT private.is_profile_blocked(follower_id, following_id)
  );

DROP POLICY IF EXISTS "friend_requests_insert_own" ON public.friend_requests;
CREATE POLICY "friend_requests_insert_own"
  ON public.friend_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND sender_id <> receiver_id
    AND NOT private.is_profile_blocked(sender_id, receiver_id)
  );

DROP POLICY IF EXISTS "messages_insert_participant" ON public.direct_messages;
CREATE POLICY "messages_insert_participant"
  ON public.direct_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.is_conversation_member(conversation_id, (SELECT auth.uid()))
    AND NOT private.conversation_has_block(conversation_id, (SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.send_friend_request(p_receiver_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF auth.uid() = p_receiver_id THEN RAISE EXCEPTION 'Cannot friend yourself'; END IF;
  IF private.is_profile_blocked(auth.uid(), p_receiver_id) THEN RAISE EXCEPTION 'Interaction unavailable'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_id = auth.uid() AND friend_id = p_receiver_id
  ) THEN RAISE EXCEPTION 'Already friends'; END IF;

  INSERT INTO public.friend_requests(sender_id, receiver_id, status)
  VALUES (auth.uid(), p_receiver_id, 'pending')
  ON CONFLICT (sender_id, receiver_id)
  DO UPDATE SET status = 'pending', updated_at = NOW()
  RETURNING id INTO v_id;

  INSERT INTO public.notifications(user_id, actor_id, notification_type, metadata)
  VALUES (p_receiver_id, auth.uid(), 'friend_request', jsonb_build_object('request_id', v_id))
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_direct_conversation(p_other_profile_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me UUID := auth.uid();
  v_conversation_id UUID;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_other_profile_id IS NULL OR p_other_profile_id = v_me THEN RAISE EXCEPTION 'Choose another user'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_other_profile_id) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF private.is_profile_blocked(v_me, p_other_profile_id) THEN RAISE EXCEPTION 'Interaction unavailable'; END IF;

  SELECT c.id INTO v_conversation_id
  FROM public.conversations c
  JOIN public.conversation_participants a ON a.conversation_id = c.id AND a.profile_id = v_me
  JOIN public.conversation_participants b ON b.conversation_id = c.id AND b.profile_id = p_other_profile_id
  WHERE (SELECT COUNT(*) FROM public.conversation_participants x WHERE x.conversation_id = c.id) = 2
  ORDER BY c.created_at
  LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conversation_id;
    INSERT INTO public.conversation_participants(conversation_id, profile_id)
    VALUES (v_conversation_id, v_me), (v_conversation_id, p_other_profile_id);
  END IF;

  RETURN v_conversation_id;
END;
$$;
