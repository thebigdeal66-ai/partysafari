create schema if not exists private;

create or replace function private.is_conversation_member(
  p_conversation_id uuid,
  p_profile_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_profile_id = auth.uid()
    and exists (
      select 1
      from public.conversation_participants cp
      where cp.conversation_id = p_conversation_id
        and cp.profile_id = p_profile_id
    );
$$;

create or replace function private.is_venue_owner(
  p_user_id uuid,
  p_venue_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and p_venue_id is not null
    and exists (
      select 1
      from public.venues v
      where v.id = p_venue_id
        and v.owner_id = p_user_id
    );
$$;

create or replace function private.can_lit_venue(
  p_user_id uuid,
  p_venue_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and p_venue_id is not null
    and not exists (
      select 1 from public.venues v
      where v.id = p_venue_id and v.owner_id = p_user_id
    )
    and exists (
      select 1 from public.venue_checkins c
      where c.venue_id = p_venue_id
        and c.profile_id = p_user_id
        and c.checked_in_at > now() - interval '90 minutes'
        and c.expires_at > now()
    );
$$;

create or replace function private.within_lit_night_quota(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_user_id = auth.uid()
    and (
      select count(*)
      from public.venue_lit_signals l
      where l.user_id = p_user_id
        and l.created_at > now() - interval '12 hours'
    ) < 10;
$$;

revoke all on function private.is_conversation_member(uuid, uuid) from public, anon;
revoke all on function private.is_venue_owner(uuid, uuid) from public, anon;
revoke all on function private.can_lit_venue(uuid, uuid) from public, anon;
revoke all on function private.within_lit_night_quota(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function private.is_venue_owner(uuid, uuid) to authenticated;
grant execute on function private.can_lit_venue(uuid, uuid) to authenticated;
grant execute on function private.within_lit_night_quota(uuid) to authenticated;

alter policy "participants_select_conversation_member"
  on public.conversation_participants
  using (private.is_conversation_member(conversation_id, (select auth.uid())));

alter policy "conversations_select_participant"
  on public.conversations
  using (private.is_conversation_member(id, (select auth.uid())));

alter policy "messages_insert_participant"
  on public.direct_messages
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id, (select auth.uid()))
    and not private.conversation_has_block(conversation_id, (select auth.uid()))
  );

alter policy "messages_select_participant"
  on public.direct_messages
  using (private.is_conversation_member(conversation_id, (select auth.uid())));

alter policy "Venue owners can delete owned venue events"
  on public.events
  using (venue_id is not null and private.is_venue_owner((select auth.uid()), venue_id));

alter policy "Venue owners can insert events for owned venues"
  on public.events
  with check (
    venue_id is not null
    and created_by = (select auth.uid())
    and private.is_venue_owner((select auth.uid()), venue_id)
  );

alter policy "Venue owners can update owned venue events"
  on public.events
  using (venue_id is not null and private.is_venue_owner((select auth.uid()), venue_id))
  with check (venue_id is not null and private.is_venue_owner((select auth.uid()), venue_id));

alter policy "Eligible users can insert their own lit signal"
  on public.venue_lit_signals
  with check (
    (select auth.uid()) = user_id
    and created_at >= now() - interval '2 minutes'
    and created_at <= now() + interval '2 minutes'
    and expires_at > now()
    and expires_at <= now() + interval '1 hour'
    and private.can_lit_venue((select auth.uid()), venue_id)
    and private.within_lit_night_quota((select auth.uid()))
    and not exists (
      select 1
      from public.venue_lit_signals existing
      where existing.venue_id = venue_lit_signals.venue_id
        and existing.user_id = (select auth.uid())
        and existing.expires_at > now()
    )
  );

drop function public.is_conversation_member(uuid, uuid);
drop function public.is_venue_owner(uuid, uuid);
drop function public.can_lit_venue(uuid, uuid);
drop function public.within_lit_night_quota(uuid);

revoke execute on function public.create_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

alter function public.set_safari_plan_updated_at()
  set search_path = public, pg_temp;
