create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_no_self_follow check (follower_id <> following_id),
  constraint follows_unique_pair unique (follower_id, following_id)
);

create index if not exists follows_follower_id_idx on public.follows(follower_id);
create index if not exists follows_following_id_idx on public.follows(following_id);

alter table public.follows enable row level security;

revoke all on table public.follows from anon;
grant select, insert, delete on table public.follows to authenticated;
grant all on table public.follows to service_role;

drop policy if exists follows_select_authenticated on public.follows;
create policy follows_select_authenticated
on public.follows
for select
to authenticated
using (true);

drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self
on public.follows
for insert
to authenticated
with check (follower_id = (select auth.uid()));

drop policy if exists follows_delete_self on public.follows;
create policy follows_delete_self
on public.follows
for delete
to authenticated
using (follower_id = (select auth.uid()));;
