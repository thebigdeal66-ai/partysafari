create table if not exists public.app_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('founder', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

revoke all on table public.app_admins from anon;
revoke all on table public.app_admins from authenticated;
grant select on table public.app_admins to authenticated;

drop policy if exists app_admins_select_self on public.app_admins;
create policy app_admins_select_self
on public.app_admins
for select
to authenticated
using (profile_id = (select auth.uid()));

-- Initial PartySafari founder reviewer. Resolve the verified login at migration time
-- instead of hardcoding a generated auth/profile UUID.
insert into public.app_admins (profile_id, role)
select p.id, 'founder'
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('thebigdeal66@gmail.com')
on conflict (profile_id) do update set role = excluded.role;

drop policy if exists performer_claims_admin_select on public.performer_claims;
create policy performer_claims_admin_select
on public.performer_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins a
    where a.profile_id = (select auth.uid())
  )
);

drop policy if exists performer_claims_admin_update_status on public.performer_claims;
create policy performer_claims_admin_update_status
on public.performer_claims
for update
to authenticated
using (
  status = 'pending'
  and exists (
    select 1
    from public.app_admins a
    where a.profile_id = (select auth.uid())
  )
)
with check (
  status in ('approved', 'rejected')
  and exists (
    select 1
    from public.app_admins a
    where a.profile_id = (select auth.uid())
  )
);

revoke update on table public.performer_claims from authenticated;
grant update (status) on table public.performer_claims to authenticated;

-- The trigger needs definer rights because normal authenticated users are deliberately
-- unable to insert performer ownership rows directly.
create or replace function public.grant_approved_performer_claim()
returns trigger
language plpgsql
security definer
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
