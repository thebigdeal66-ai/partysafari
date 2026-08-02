create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  notification_type text not null check (char_length(notification_type) between 1 and 80),
  event_id uuid references public.events(id) on delete cascade,
  activity_id uuid references public.activity_feed(id) on delete cascade,
  comment_id uuid references public.event_comments(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id);
create index if not exists notifications_user_unread_created_idx
  on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

alter table public.notifications enable row level security;

-- Replace only policies owned by this migration.
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_read_own" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "notifications_update_read_own"
on public.notifications
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "notifications_delete_own"
on public.notifications
for delete
to authenticated
using (user_id = (select auth.uid()));

-- Limit direct table access. Notifications are created through the RPC below.
revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;
grant update (is_read) on table public.notifications to authenticated;
grant delete on table public.notifications to authenticated;

create or replace function public.create_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_notification_type text,
  p_event_id uuid default null,
  p_activity_id uuid default null,
  p_comment_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required';
  end if;

  if p_actor_id is distinct from v_caller then
    raise exception 'actor_id must match the authenticated user';
  end if;

  if p_recipient_id is null then
    raise exception 'recipient_id is required';
  end if;

  if p_notification_type is null or btrim(p_notification_type) = '' then
    raise exception 'notification_type is required';
  end if;

  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'metadata must be a JSON object';
  end if;

  -- Do not notify users about their own actions.
  if p_recipient_id = v_caller then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    actor_id,
    notification_type,
    event_id,
    activity_id,
    comment_id,
    metadata
  )
  values (
    p_recipient_id,
    v_caller,
    btrim(p_notification_type),
    p_event_id,
    p_activity_id,
    p_comment_id,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.create_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) from anon;
grant execute on function public.create_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.create_notification(uuid, uuid, text, uuid, uuid, uuid, jsonb) to service_role;

-- Enable realtime for live notification updates, without failing if already added.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;;
