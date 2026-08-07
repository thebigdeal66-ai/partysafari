alter table public.booking_requests enable row level security;
alter table public.booking_messages enable row level security;

drop policy if exists booking_requests_select_requester on public.booking_requests;
drop policy if exists booking_requests_select_participants on public.booking_requests;
create policy booking_requests_select_participants
on public.booking_requests
for select
to authenticated
using (
  requester_id = (select auth.uid())
  or exists (
    select 1
    from public.performer_owners po
    where po.performer_id = booking_requests.performer_id
      and po.profile_id = (select auth.uid())
  )
);

drop policy if exists booking_requests_update_performer_owner on public.booking_requests;
create policy booking_requests_update_performer_owner
on public.booking_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.performer_owners po
    where po.performer_id = booking_requests.performer_id
      and po.profile_id = (select auth.uid())
  )
)
with check (
  status in ('pending', 'contacted', 'accepted', 'declined')
  and exists (
    select 1
    from public.performer_owners po
    where po.performer_id = booking_requests.performer_id
      and po.profile_id = (select auth.uid())
  )
);

drop policy if exists booking_messages_select_auth on public.booking_messages;
drop policy if exists booking_messages_select_participants on public.booking_messages;
create policy booking_messages_select_participants
on public.booking_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.booking_requests br
    where br.id = booking_messages.booking_request_id
  )
);

drop policy if exists booking_messages_insert_auth on public.booking_messages;
drop policy if exists booking_messages_insert_participants on public.booking_messages;
create policy booking_messages_insert_participants
on public.booking_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.booking_requests br
    where br.id = booking_messages.booking_request_id
  )
);

revoke all on table public.booking_requests from anon;
revoke all on table public.booking_messages from anon;

revoke update, delete, truncate, trigger, references on table public.booking_requests from authenticated;
grant select, insert on table public.booking_requests to authenticated;
grant update (status) on table public.booking_requests to authenticated;

revoke update, delete, truncate, trigger, references on table public.booking_messages from authenticated;
grant select, insert on table public.booking_messages to authenticated;

create index if not exists booking_requests_performer_id_idx on public.booking_requests (performer_id);
create index if not exists booking_requests_requester_id_idx on public.booking_requests (requester_id);
create index if not exists booking_messages_booking_request_id_idx on public.booking_messages (booking_request_id);
create index if not exists performer_owners_profile_id_idx on public.performer_owners (profile_id);
