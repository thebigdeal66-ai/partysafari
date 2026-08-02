-- NOTE: Migrations 001-020 are intentionally not copied into supabase/migrations.
-- Production migration history predates and differs from this repository's custom numbered SQL files.
-- Importing older migrations could reapply schema that already exists remotely.
-- Do not auto-deploy this migration until remote migration history is reconciled.

create extension if not exists pgcrypto;

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

create policy if not exists calibration_feedback_select_own
  on public.calibration_feedback
  for select
  using (auth.uid() = profile_id);

create policy if not exists calibration_feedback_insert_own
  on public.calibration_feedback
  for insert
  with check (auth.uid() = profile_id);

create policy if not exists calibration_feedback_update_own
  on public.calibration_feedback
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
