create or replace function public.notify_direct_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select cp.profile_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.profile_id <> new.sender_id
  loop
    insert into public.notifications (
      user_id,
      actor_id,
      notification_type,
      metadata
    ) values (
      v_recipient,
      new.sender_id,
      'direct_message',
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'preview', left(new.body, 120)
      )
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_direct_message_recipient() from public, anon, authenticated;
grant execute on function public.notify_direct_message_recipient() to postgres, service_role;

drop trigger if exists trg_notify_direct_message_recipient on public.direct_messages;
create trigger trg_notify_direct_message_recipient
after insert on public.direct_messages
for each row execute function public.notify_direct_message_recipient();

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Authentication required';
  end if;

  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and profile_id = v_me;

  if not found then
    raise exception 'Conversation not found';
  end if;

  update public.notifications
  set is_read = true
  where user_id = v_me
    and notification_type = 'direct_message'
    and is_read = false
    and metadata ->> 'conversation_id' = p_conversation_id::text;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;

create or replace function public.get_unread_message_counts()
returns table(conversation_id uuid, unread_count bigint)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    cp.conversation_id,
    count(dm.id)::bigint as unread_count
  from public.conversation_participants cp
  left join public.direct_messages dm
    on dm.conversation_id = cp.conversation_id
   and dm.sender_id <> cp.profile_id
   and dm.created_at > coalesce(cp.last_read_at, cp.joined_at)
  where cp.profile_id = auth.uid()
  group by cp.conversation_id;
$$;

revoke all on function public.get_unread_message_counts() from public, anon;
grant execute on function public.get_unread_message_counts() to authenticated, service_role;

create index if not exists idx_notifications_direct_message_conversation
on public.notifications (user_id, is_read, notification_type, ((metadata ->> 'conversation_id')))
where notification_type = 'direct_message';;
