create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, profile_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists conversation_participants_profile_idx
  on public.conversation_participants(profile_id, conversation_id);
create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id, created_at);
create index if not exists conversations_last_message_idx
  on public.conversations(last_message_at desc nulls last);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists conversations_select_participant on public.conversations;
create policy conversations_select_participant
on public.conversations for select to authenticated
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.profile_id = (select auth.uid())
  )
);

drop policy if exists participants_select_conversation_member on public.conversation_participants;
create policy participants_select_conversation_member
on public.conversation_participants for select to authenticated
using (
  exists (
    select 1 from public.conversation_participants mine
    where mine.conversation_id = conversation_participants.conversation_id
      and mine.profile_id = (select auth.uid())
  )
);

drop policy if exists participants_update_self on public.conversation_participants;
create policy participants_update_self
on public.conversation_participants for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

drop policy if exists messages_select_participant on public.direct_messages;
create policy messages_select_participant
on public.direct_messages for select to authenticated
using (
  exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_messages.conversation_id
      and cp.profile_id = (select auth.uid())
  )
);

drop policy if exists messages_insert_participant on public.direct_messages;
create policy messages_insert_participant
on public.direct_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = direct_messages.conversation_id
      and cp.profile_id = (select auth.uid())
  )
);

drop policy if exists messages_update_sender on public.direct_messages;
create policy messages_update_sender
on public.direct_messages for update to authenticated
using (sender_id = (select auth.uid()))
with check (sender_id = (select auth.uid()));

create or replace function public.start_direct_conversation(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication required';
  end if;
  if p_other_profile_id is null or p_other_profile_id = v_me then
    raise exception 'Choose another user';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_profile_id) then
    raise exception 'Profile not found';
  end if;

  select c.id into v_conversation_id
  from public.conversations c
  join public.conversation_participants a on a.conversation_id = c.id and a.profile_id = v_me
  join public.conversation_participants b on b.conversation_id = c.id and b.profile_id = p_other_profile_id
  where (select count(*) from public.conversation_participants x where x.conversation_id = c.id) = 2
  order by c.created_at
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations default values returning id into v_conversation_id;
    insert into public.conversation_participants(conversation_id, profile_id)
    values (v_conversation_id, v_me), (v_conversation_id, p_other_profile_id);
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated, service_role;

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists direct_messages_touch_conversation on public.direct_messages;
create trigger direct_messages_touch_conversation
after insert on public.direct_messages
for each row execute function public.touch_conversation_after_message();

revoke all on function public.touch_conversation_after_message() from public, anon, authenticated;
grant execute on function public.touch_conversation_after_message() to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;;
