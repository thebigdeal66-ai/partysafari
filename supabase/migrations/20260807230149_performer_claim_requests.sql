create table if not exists public.performer_claims (
  id uuid primary key default gen_random_uuid(),
  performer_id uuid not null references public.performers(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  verification_method text not null check (verification_method in ('instagram', 'official_website', 'business_email', 'management', 'other')),
  verification_detail text not null check (char_length(btrim(verification_detail)) between 10 and 1200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.performer_claims enable row level security;

create unique index if not exists performer_claims_one_pending_per_user_idx
  on public.performer_claims (performer_id, claimant_id)
  where status = 'pending';

create index if not exists performer_claims_claimant_id_idx
  on public.performer_claims (claimant_id);

create index if not exists performer_claims_status_submitted_at_idx
  on public.performer_claims (status, submitted_at desc);

drop policy if exists performer_claims_select_own on public.performer_claims;
create policy performer_claims_select_own
on public.performer_claims
for select
to authenticated
using (claimant_id = (select auth.uid()));

drop policy if exists performer_claims_insert_own_pending on public.performer_claims;
create policy performer_claims_insert_own_pending
on public.performer_claims
for insert
to authenticated
with check (
  claimant_id = (select auth.uid())
  and status = 'pending'
  and reviewed_at is null
);

revoke all on table public.performer_claims from anon;
revoke all on table public.performer_claims from authenticated;
grant select, insert on table public.performer_claims to authenticated;

revoke insert, update, delete, truncate, trigger, references
  on table public.performer_owners from authenticated;
grant select on table public.performer_owners to authenticated;

create or replace function public.grant_approved_performer_claim()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.status in ('approved', 'rejected')
     and new.status is distinct from old.status then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;

  if new.status = 'approved'
     and new.status is distinct from old.status then
    insert into public.performer_owners (performer_id, profile_id, role)
    values (new.performer_id, new.claimant_id, 'owner')
    on conflict (performer_id, profile_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.grant_approved_performer_claim() from public;
revoke all on function public.grant_approved_performer_claim() from anon;
revoke all on function public.grant_approved_performer_claim() from authenticated;
grant execute on function public.grant_approved_performer_claim() to service_role;

drop trigger if exists performer_claims_approval_grants_owner on public.performer_claims;
create trigger performer_claims_approval_grants_owner
before update of status on public.performer_claims
for each row
execute function public.grant_approved_performer_claim();
