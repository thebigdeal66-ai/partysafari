
-- Harden intentionally browser-callable SECURITY DEFINER functions.
-- These workflows must retain elevated rights for controlled cross-row operations,
-- but no longer search application-writable schemas for unqualified objects.
alter function public.accept_offer(uuid) set search_path = '';
alter function public.mark_conversation_read(uuid) set search_path = '';
alter function public.respond_to_friend_request(uuid,text) set search_path = '';
alter function public.send_friend_request(uuid) set search_path = '';
alter function public.soft_delete_story(uuid) set search_path = '';
alter function public.start_direct_conversation(uuid) set search_path = '';
alter function public.submit_venue_claim(uuid,text) set search_path = '';
alter function public.verify_pending_venue_claim(uuid) set search_path = '';
alter function public.get_active_story_view_counts() set search_path = '';

-- Story counts are a deliberate public API, but execution should be explicit
-- rather than inherited by every database role through PUBLIC.
revoke execute on function public.get_active_story_view_counts() from public;
grant execute on function public.get_active_story_view_counts() to anon, authenticated;
