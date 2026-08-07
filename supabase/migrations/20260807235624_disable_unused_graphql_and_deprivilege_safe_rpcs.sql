-- Disable PartySafari's unused GraphQL API surface and remove unnecessary
-- SECURITY DEFINER elevation from browser RPCs whose underlying RLS already
-- enforces the same access rules.
--
-- Keep intentionally privileged cross-row workflows (friend requests,
-- conversation creation/read cleanup, offer acceptance, story soft delete,
-- venue claims) as SECURITY DEFINER until they receive purpose-built changes.

ALTER FUNCTION public.check_in_to_venue(uuid, double precision, double precision, double precision)
  SECURITY INVOKER;
ALTER FUNCTION public.get_unread_message_counts()
  SECURITY INVOKER;
ALTER FUNCTION public.get_venue_live_counts()
  SECURITY INVOKER;
ALTER FUNCTION public.record_story_view(uuid)
  SECURITY INVOKER;

-- New functions should not become browser-callable by accident. Future
-- client-facing RPCs must grant EXECUTE explicitly.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- PartySafari uses PostgREST/Supabase client APIs, not /graphql/v1.
DROP EXTENSION pg_graphql;
