begin;

-- Trigger-only function: prevent direct RPC execution while preserving the auth trigger.
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- The legacy offer RPC must never be callable before sign-in.
revoke execute on function public.accept_offer(uuid) from public, anon;

-- Ownership mapping tables contain authorization data and must not be public.
revoke all on table public.performer_owners from anon;
revoke all on table public.venue_admins from anon;
grant select on table public.performer_owners to authenticated;
grant select on table public.venue_admins to authenticated;

alter table public.performer_owners enable row level security;
alter table public.venue_admins enable row level security;

drop policy if exists performer_owners_select_self on public.performer_owners;
create policy performer_owners_select_self
on public.performer_owners
for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists venue_admins_select_self on public.venue_admins;
create policy venue_admins_select_self
on public.venue_admins
for select
to authenticated
using (profile_id = (select auth.uid()));

-- Use init-plan form of auth.uid() in existing hot policies.
alter policy booking_messages_insert_auth on public.booking_messages
with check (sender_id = (select auth.uid()));

alter policy booking_requests_insert_self on public.booking_requests
with check (requester_id = (select auth.uid()));

alter policy booking_requests_select_requester on public.booking_requests
using (requester_id = (select auth.uid()));

alter policy talent_messages_insert_auth on public.talent_messages
with check (sender_id = (select auth.uid()));

alter policy talent_requests_insert_self on public.talent_requests
with check (requester_id = (select auth.uid()));

alter policy talent_requests_select_open_or_self on public.talent_requests
using ((status = 'open'::text) or (requester_id = (select auth.uid())));

alter policy performers_update_owner on public.performers
using (exists (
  select 1 from public.performer_owners po
  where po.performer_id = performers.id
    and po.profile_id = (select auth.uid())
))
with check (exists (
  select 1 from public.performer_owners po
  where po.performer_id = performers.id
    and po.profile_id = (select auth.uid())
));

commit;;
