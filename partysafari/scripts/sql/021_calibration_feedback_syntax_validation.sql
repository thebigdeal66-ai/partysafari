begin;

create schema if not exists auth;
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key
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
create policy calibration_feedback_select_own on public.calibration_feedback for select using (true);
create policy calibration_feedback_insert_own on public.calibration_feedback for insert with check (true);
create policy calibration_feedback_update_own on public.calibration_feedback for update using (true) with check (true);

alter table public.calibration_feedback
  alter column venue_id type uuid
  using (nullif(btrim(venue_id), '')::uuid);

alter table public.calibration_feedback
  add constraint calibration_feedback_venue_id_fkey
  foreign key (venue_id)
  references public.venues(id)
  on delete set null;

insert into public.profiles (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.venues (id) values
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

insert into public.calibration_feedback (profile_id, feature, venue_id, accurate)
values ('11111111-1111-1111-1111-111111111111', 'crowdPulse', '33333333-3333-4333-8333-333333333333'::uuid, true);

select
  pg_typeof(venue_id)::text as venue_id_type,
  (venue_id is not null)::int as has_uuid_value
from public.calibration_feedback
limit 1;

rollback;
