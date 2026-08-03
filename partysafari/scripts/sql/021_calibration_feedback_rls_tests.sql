begin;

create schema if not exists public;
create schema if not exists auth;
create extension if not exists pgcrypto;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role bypassrls;
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  home_city text
);

create table if not exists public.venues (
  id uuid primary key
);

create table if not exists public.calibration_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature in ('crowdPulse', 'aiDiscoverCards')),
  venue_id text,
  recommendation_category text,
  displayed_party_score integer,
  displayed_psi_label text,
  crowd_pulse_level text,
  reason_codes text[],
  accurate boolean not null,
  note text,
  created_at timestamptz not null default now(),
  check (char_length(coalesce(note, '')) <= 500),
  check (char_length(coalesce(recommendation_category, '')) <= 64),
  check (char_length(coalesce(displayed_psi_label, '')) <= 120),
  check (coalesce(array_length(reason_codes, 1), 0) <= 10),
  check (coalesce(char_length(array_to_string(reason_codes, ',')), 0) <= 640)
);

alter table public.calibration_feedback enable row level security;
create policy calibration_feedback_select_own on public.calibration_feedback for select using (auth.uid() = profile_id);
create policy calibration_feedback_insert_own on public.calibration_feedback for insert with check (auth.uid() = profile_id);
create policy calibration_feedback_update_own on public.calibration_feedback for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

alter table public.calibration_feedback
  alter column venue_id type uuid
  using (nullif(btrim(venue_id), '')::uuid);

alter table public.calibration_feedback
  add constraint calibration_feedback_venue_id_fkey
  foreign key (venue_id)
  references public.venues(id)
  on delete set null;

grant usage on schema public, auth to anon, authenticated, service_role;
grant select, insert, update on public.calibration_feedback to authenticated;
grant select, insert, update, delete on public.calibration_feedback to service_role;
grant select on public.calibration_feedback to anon;

insert into public.profiles (id, home_city) values
  ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', 'Ocean City'),
  ('c7b79d8f-c6de-48ea-9652-9e2290be5588', 'River City');

insert into public.venues (id) values
  ('8f806f99-7d74-4b2d-8bc4-bf7bc10f89a0'),
  ('f5de5a91-8b27-4e87-a63d-bf12386674df');

-- authenticated own-profile insert with valid venue uuid
set local role authenticated;
select set_config('request.jwt.claim.sub', '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', true);

insert into public.calibration_feedback (profile_id, feature, venue_id, accurate)
values ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', 'crowdPulse', '8f806f99-7d74-4b2d-8bc4-bf7bc10f89a0'::uuid, true);

-- null venue remains allowed
insert into public.calibration_feedback (profile_id, feature, venue_id, accurate)
values ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', 'aiDiscoverCards', null, true);

-- non-existent venue uuid rejected by FK
do $$
begin
  begin
    insert into public.calibration_feedback (profile_id, feature, venue_id, accurate)
    values ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', 'crowdPulse', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid, true);
    raise exception 'expected fk violation for nonexistent venue uuid';
  exception when foreign_key_violation then
    null;
  end;
end $$;

-- malformed venue identifier rejected by UUID typing
do $$
begin
  begin
    insert into public.calibration_feedback (profile_id, feature, venue_id, accurate)
    values ('02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f', 'crowdPulse', 'not-a-uuid'::uuid, true);
    raise exception 'expected invalid uuid literal failure';
  exception when invalid_text_representation then
    null;
  end;
end $$;

-- anonymous select returns zero visible rows (RLS filtering), not an exception
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
declare
  visible_count bigint;
begin
  select count(*) into visible_count from public.calibration_feedback;
  if visible_count <> 0 then
    raise exception 'anonymous select should see zero rows, got %', visible_count;
  end if;
end $$;

reset role;

-- deleting referenced venue sets calibration row venue_id to null
set local role service_role;

do $$
declare
  before_count bigint;
  null_after_delete bigint;
begin
  select count(*) into before_count
  from public.calibration_feedback
  where venue_id = '8f806f99-7d74-4b2d-8bc4-bf7bc10f89a0'::uuid;

  if before_count = 0 then
    raise exception 'expected seeded row with referenced venue before delete';
  end if;

  delete from public.venues where id = '8f806f99-7d74-4b2d-8bc4-bf7bc10f89a0'::uuid;

  select count(*) into null_after_delete
  from public.calibration_feedback
  where profile_id = '02ed8330-6ca7-4cf0-ab16-52f1b4feaa8f'
    and venue_id is null;

  if null_after_delete = 0 then
    raise exception 'expected venue_id to become null after referenced venue delete';
  end if;
end $$;

reset role;

select 1 as rls_fixture_ready;

rollback;
