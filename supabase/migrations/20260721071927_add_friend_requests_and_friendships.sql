create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  unique (sender_id, receiver_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id <> friend_id),
  unique (user_id, friend_id)
);

create index if not exists friend_requests_receiver_status_idx on public.friend_requests(receiver_id, status, created_at desc);
create index if not exists friend_requests_sender_status_idx on public.friend_requests(sender_id, status, created_at desc);
create index if not exists friendships_user_idx on public.friendships(user_id, created_at desc);
create index if not exists friendships_friend_idx on public.friendships(friend_id, created_at desc);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists friend_requests_select_own on public.friend_requests;
create policy friend_requests_select_own on public.friend_requests
for select to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friend_requests_insert_own on public.friend_requests;
create policy friend_requests_insert_own on public.friend_requests
for insert to authenticated
with check (auth.uid() = sender_id and sender_id <> receiver_id);

drop policy if exists friend_requests_update_participant on public.friend_requests;
create policy friend_requests_update_participant on public.friend_requests
for update to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id)
with check (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friend_requests_delete_participant on public.friend_requests;
create policy friend_requests_delete_participant on public.friend_requests
for delete to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists friendships_select_participant on public.friendships;
create policy friendships_select_participant on public.friendships
for select to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

create or replace function public.respond_to_friend_request(p_request_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.friend_requests%rowtype;
begin
  select * into v_req from public.friend_requests where id = p_request_id for update;
  if not found then raise exception 'Friend request not found'; end if;
  if auth.uid() <> v_req.receiver_id then raise exception 'Not authorized'; end if;
  if v_req.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
  if p_action not in ('accept','decline') then raise exception 'Invalid action'; end if;

  if p_action = 'accept' then
    update public.friend_requests set status='accepted', updated_at=now() where id=p_request_id;
    insert into public.friendships(user_id, friend_id) values (v_req.sender_id, v_req.receiver_id) on conflict do nothing;
    insert into public.friendships(user_id, friend_id) values (v_req.receiver_id, v_req.sender_id) on conflict do nothing;
    insert into public.notifications(user_id, actor_id, notification_type, metadata)
    values (v_req.sender_id, v_req.receiver_id, 'friend_request_accepted', jsonb_build_object('request_id', p_request_id))
    on conflict do nothing;
  else
    update public.friend_requests set status='declined', updated_at=now() where id=p_request_id;
  end if;
end;
$$;

grant execute on function public.respond_to_friend_request(uuid,text) to authenticated;

create or replace function public.send_friend_request(p_receiver_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if auth.uid() = p_receiver_id then raise exception 'Cannot friend yourself'; end if;
  if exists(select 1 from public.friendships where user_id=auth.uid() and friend_id=p_receiver_id) then raise exception 'Already friends'; end if;

  insert into public.friend_requests(sender_id, receiver_id, status)
  values (auth.uid(), p_receiver_id, 'pending')
  on conflict (sender_id, receiver_id)
  do update set status='pending', updated_at=now()
  returning id into v_id;

  insert into public.notifications(user_id, actor_id, notification_type, metadata)
  values (p_receiver_id, auth.uid(), 'friend_request', jsonb_build_object('request_id', v_id))
  on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;;
