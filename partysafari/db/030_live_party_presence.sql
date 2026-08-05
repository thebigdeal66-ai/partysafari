-- Sprint 015: privacy-aware, short-lived user presence for Safari Radar.
create table if not exists public.user_live_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  privacy_mode text not null default 'invisible' check (privacy_mode in ('public', 'friends', 'invisible')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists user_live_presence_expires_at_idx
  on public.user_live_presence (expires_at);

alter table public.user_live_presence enable row level security;

drop policy if exists "presence owner read" on public.user_live_presence;
create policy "presence owner read"
  on public.user_live_presence for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "presence visible public or friends" on public.user_live_presence;
create policy "presence visible public or friends"
  on public.user_live_presence for select
  to authenticated
  using (
    expires_at > now()
    and privacy_mode <> 'invisible'
    and (
      privacy_mode = 'public'
      or exists (
        select 1
        from public.friendships f
        where (f.user_id = (select auth.uid()) and f.friend_id = user_live_presence.user_id)
           or (f.friend_id = (select auth.uid()) and f.user_id = user_live_presence.user_id)
      )
    )
  );

drop policy if exists "presence owner insert" on public.user_live_presence;
create policy "presence owner insert"
  on public.user_live_presence for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "presence owner update" on public.user_live_presence;
create policy "presence owner update"
  on public.user_live_presence for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "presence owner delete" on public.user_live_presence;
create policy "presence owner delete"
  on public.user_live_presence for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_live_presence to authenticated;
revoke all on public.user_live_presence from anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_live_presence'
  ) then
    alter publication supabase_realtime add table public.user_live_presence;
  end if;
end $$;
