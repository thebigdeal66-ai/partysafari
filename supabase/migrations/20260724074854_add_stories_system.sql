create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text,
  venue_id uuid references public.venues(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  constraint stories_expiry_after_create check (expires_at > created_at)
);

create index if not exists stories_active_idx on public.stories (expires_at desc) where deleted_at is null;
create index if not exists stories_author_idx on public.stories (author_id, created_at desc);
create index if not exists stories_venue_idx on public.stories (venue_id, created_at desc) where venue_id is not null;
create index if not exists stories_event_idx on public.stories (event_id, created_at desc) where event_id is not null;

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

create index if not exists story_views_story_idx on public.story_views (story_id, viewed_at desc);
create index if not exists story_views_viewer_idx on public.story_views (viewer_id, viewed_at desc);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "active stories are viewable" on public.stories;
create policy "active stories are viewable"
on public.stories for select
to anon, authenticated
using (deleted_at is null and expires_at > now());

drop policy if exists "users can create own stories" on public.stories;
create policy "users can create own stories"
on public.stories for insert
to authenticated
with check (auth.uid() = author_id);

drop policy if exists "users can update own stories" on public.stories;
create policy "users can update own stories"
on public.stories for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "users can delete own stories" on public.stories;
create policy "users can delete own stories"
on public.stories for delete
to authenticated
using (auth.uid() = author_id);

drop policy if exists "story views are readable" on public.story_views;
create policy "story views are readable"
on public.story_views for select
to authenticated
using (
  auth.uid() = viewer_id
  or exists (
    select 1 from public.stories s
    where s.id = story_id and s.author_id = auth.uid()
  )
);

drop policy if exists "users can record own story views" on public.story_views;
create policy "users can record own story views"
on public.story_views for insert
to authenticated
with check (auth.uid() = viewer_id);

drop policy if exists "users can update own story views" on public.story_views;
create policy "users can update own story views"
on public.story_views for update
to authenticated
using (auth.uid() = viewer_id)
with check (auth.uid() = viewer_id);

create or replace function public.record_story_view(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.stories
    where id = p_story_id
      and deleted_at is null
      and expires_at > now()
  ) then
    raise exception 'Story is unavailable';
  end if;

  insert into public.story_views (story_id, viewer_id)
  values (p_story_id, auth.uid())
  on conflict (story_id, viewer_id)
  do update set viewed_at = now();
end;
$$;

grant execute on function public.record_story_view(uuid) to authenticated;

create or replace function public.get_active_story_view_counts()
returns table (story_id uuid, view_count bigint)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, count(v.id)::bigint
  from public.stories s
  left join public.story_views v on v.story_id = s.id
  where s.deleted_at is null
    and s.expires_at > now()
  group by s.id;
$$;

grant execute on function public.get_active_story_view_counts() to anon, authenticated;

create or replace function public.soft_delete_story(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stories
  set deleted_at = now()
  where id = p_story_id
    and author_id = auth.uid();

  if not found then
    raise exception 'Story not found or not owned by user';
  end if;
end;
$$;

grant execute on function public.soft_delete_story(uuid) to authenticated;

alter publication supabase_realtime add table public.stories;
alter publication supabase_realtime add table public.story_views;;
