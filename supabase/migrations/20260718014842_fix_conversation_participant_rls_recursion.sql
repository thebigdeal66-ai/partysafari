create or replace function public.is_conversation_member(p_conversation_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.profile_id = p_profile_id
  );
$$;

revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;

drop policy if exists participants_select_conversation_member on public.conversation_participants;
create policy participants_select_conversation_member
on public.conversation_participants
for select
to authenticated
using (public.is_conversation_member(conversation_id, (select auth.uid())));

drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
on public.conversations
for select
to authenticated
using (public.is_conversation_member(id, (select auth.uid())));

drop policy if exists messages_select_participant on public.direct_messages;
create policy messages_select_participant
on public.direct_messages
for select
to authenticated
using (public.is_conversation_member(conversation_id, (select auth.uid())));

drop policy if exists messages_insert_participant on public.direct_messages;
create policy messages_insert_participant
on public.direct_messages
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id, (select auth.uid()))
);;
