alter table public.venues
  add column if not exists owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists venue_type text not null default 'bar',
  add column if not exists postal_code text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists image_url text,
  add column if not exists music_genres text[] not null default '{}',
  add column if not exists age_min integer,
  add column if not exists dress_code text,
  add column if not exists food_available boolean not null default false,
  add column if not exists vip_available boolean not null default false,
  add column if not exists current_status text not null default 'open',
  add column if not exists crowd_level text not null default 'quiet',
  add column if not exists drink_specials text,
  add column if not exists hours jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.venues set owner_id = created_by where owner_id is null and created_by is not null;
update public.venues set image_url = photo_url where image_url is null and photo_url is not null;

create unique index if not exists venues_slug_unique_idx on public.venues (slug);
create index if not exists venues_location_idx on public.venues (latitude, longitude);
create index if not exists venues_city_state_idx on public.venues (city, state);
create index if not exists venues_owner_idx on public.venues (owner_id);

create table if not exists public.venue_checkins (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now(),
  unique (venue_id, profile_id)
);

create index if not exists venue_checkins_venue_expires_idx on public.venue_checkins (venue_id, expires_at desc);
create index if not exists venue_checkins_profile_idx on public.venue_checkins (profile_id, expires_at desc);

alter table public.venues enable row level security;
alter table public.venue_checkins enable row level security;

drop policy if exists "venues_public_read" on public.venues;
create policy "venues_public_read" on public.venues for select using (true);

drop policy if exists "venues_owner_insert" on public.venues;
create policy "venues_owner_insert" on public.venues for insert to authenticated
with check (coalesce(owner_id, created_by) = auth.uid());

drop policy if exists "venues_owner_update" on public.venues;
create policy "venues_owner_update" on public.venues for update to authenticated
using (coalesce(owner_id, created_by) = auth.uid())
with check (coalesce(owner_id, created_by) = auth.uid());

drop policy if exists "venues_owner_delete" on public.venues;
create policy "venues_owner_delete" on public.venues for delete to authenticated
using (coalesce(owner_id, created_by) = auth.uid());

drop policy if exists "venue_checkins_public_read" on public.venue_checkins;
create policy "venue_checkins_public_read" on public.venue_checkins for select using (expires_at > now());

drop policy if exists "venue_checkins_self_insert" on public.venue_checkins;
create policy "venue_checkins_self_insert" on public.venue_checkins for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists "venue_checkins_self_update" on public.venue_checkins;
create policy "venue_checkins_self_update" on public.venue_checkins for update to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "venue_checkins_self_delete" on public.venue_checkins;
create policy "venue_checkins_self_delete" on public.venue_checkins for delete to authenticated
using (profile_id = auth.uid());

create or replace function public.check_in_to_venue(p_venue_id uuid)
returns public.venue_checkins
language plpgsql security definer set search_path = public
as $$
declare result public.venue_checkins;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.venue_checkins (venue_id, profile_id, checked_in_at, expires_at)
  values (p_venue_id, auth.uid(), now(), now() + interval '6 hours')
  on conflict (venue_id, profile_id)
  do update set checked_in_at = excluded.checked_in_at, expires_at = excluded.expires_at
  returning * into result;
  return result;
end;
$$;
grant execute on function public.check_in_to_venue(uuid) to authenticated;

create or replace function public.get_venue_live_counts()
returns table (venue_id uuid, live_count bigint)
language sql security definer set search_path = public stable
as $$
  select venue_id, count(*)::bigint
  from public.venue_checkins
  where expires_at > now()
  group by venue_id;
$$;
grant execute on function public.get_venue_live_counts() to anon, authenticated;

create or replace function public.set_venues_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists venues_set_updated_at on public.venues;
create trigger venues_set_updated_at before update on public.venues
for each row execute function public.set_venues_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venue_checkins'
  ) then
    alter publication supabase_realtime add table public.venue_checkins;
  end if;
end $$;;
