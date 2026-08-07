-- Restrict authenticated-only SECURITY DEFINER RPCs from anonymous callers.
-- Public aggregate readers used by signed-out Radar remain intentionally executable.

revoke execute on function public.can_lit_venue(uuid, uuid) from public, anon;
revoke execute on function public.check_in_to_venue(uuid, double precision, double precision, double precision) from public, anon;
revoke execute on function public.enforce_venue_story_presence() from public, anon, authenticated;
revoke execute on function public.is_venue_owner(uuid, uuid) from public, anon;
revoke execute on function public.record_story_view(uuid) from public, anon;
revoke execute on function public.respond_to_friend_request(uuid, text) from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.soft_delete_story(uuid) from public, anon;
revoke execute on function public.within_lit_night_quota(uuid) from public, anon;

grant execute on function public.can_lit_venue(uuid, uuid) to authenticated, service_role;
grant execute on function public.check_in_to_venue(uuid, double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.is_venue_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.record_story_view(uuid) to authenticated, service_role;
grant execute on function public.respond_to_friend_request(uuid, text) to authenticated, service_role;
grant execute on function public.send_friend_request(uuid) to authenticated, service_role;
grant execute on function public.soft_delete_story(uuid) to authenticated, service_role;
grant execute on function public.within_lit_night_quota(uuid) to authenticated, service_role;
