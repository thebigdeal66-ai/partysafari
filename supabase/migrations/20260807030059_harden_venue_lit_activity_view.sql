-- Harden the public Lit activity read path without exposing member identities.
-- The helper lives outside the Data API exposed schemas and returns only the
-- anonymized fields the client already consumes.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.read_venue_lit_activity()
RETURNS TABLE (
  venue_id UUID,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_viewer BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT
    l.venue_id,
    l.created_at,
    l.expires_at,
    (l.user_id = auth.uid()) AS is_viewer
  FROM public.venue_lit_signals AS l
  WHERE l.expires_at > pg_catalog.now()
$$;

REVOKE ALL ON FUNCTION private.read_venue_lit_activity() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.read_venue_lit_activity() TO anon, authenticated;

CREATE OR REPLACE VIEW public.venue_lit_activity
WITH (security_invoker = true)
AS
  SELECT venue_id, created_at, expires_at, is_viewer
  FROM private.read_venue_lit_activity();

GRANT SELECT ON public.venue_lit_activity TO anon, authenticated;
