-- Migration 026: harden venue claim API grants
-- Supabase grants new public tables/functions to API roles by default. RLS already
-- denied anonymous row access and submit_venue_claim() rejects a NULL auth.uid(),
-- but the claim API should expose only the privileges the client actually needs.

REVOKE ALL ON TABLE public.venue_claims FROM anon, authenticated;
GRANT SELECT ON TABLE public.venue_claims TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_venue_claim(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_venue_claim(UUID, TEXT) TO authenticated;
