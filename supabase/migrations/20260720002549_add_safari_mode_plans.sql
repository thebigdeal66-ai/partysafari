create table if not exists public.safari_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'My PartySafari',
  safari_date date not null default current_date,
  start_time time,
  end_time time,
  max_distance_miles numeric,
  budget numeric,
  preferred_genres text[] not null default '{}',
  preferred_venue_types text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','active','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.safari_stops (
  id uuid primary key default gen_random_uuid(),
  safari_plan_id uuid not null references public.safari_plans(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  stop_order integer not null,
  planned_arrival timestamptz,
  planned_departure timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (safari_plan_id, stop_order),
  unique (safari_plan_id, venue_id)
);

create index if not exists safari_plans_user_date_idx on public.safari_plans(user_id, safari_date desc);
create index if not exists safari_stops_plan_order_idx on public.safari_stops(safari_plan_id, stop_order);

alter table public.safari_plans enable row level security;
alter table public.safari_stops enable row level security;

drop policy if exists "Users can view own safari plans" on public.safari_plans;
create policy "Users can view own safari plans"
on public.safari_plans for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can create own safari plans" on public.safari_plans;
create policy "Users can create own safari plans"
on public.safari_plans for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own safari plans" on public.safari_plans;
create policy "Users can update own safari plans"
on public.safari_plans for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own safari plans" on public.safari_plans;
create policy "Users can delete own safari plans"
on public.safari_plans for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can view own safari stops" on public.safari_stops;
create policy "Users can view own safari stops"
on public.safari_stops for select
to authenticated
using (exists (
  select 1 from public.safari_plans p
  where p.id = safari_plan_id and p.user_id = auth.uid()
));

drop policy if exists "Users can create own safari stops" on public.safari_stops;
create policy "Users can create own safari stops"
on public.safari_stops for insert
to authenticated
with check (exists (
  select 1 from public.safari_plans p
  where p.id = safari_plan_id and p.user_id = auth.uid()
));

drop policy if exists "Users can update own safari stops" on public.safari_stops;
create policy "Users can update own safari stops"
on public.safari_stops for update
to authenticated
using (exists (
  select 1 from public.safari_plans p
  where p.id = safari_plan_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.safari_plans p
  where p.id = safari_plan_id and p.user_id = auth.uid()
));

drop policy if exists "Users can delete own safari stops" on public.safari_stops;
create policy "Users can delete own safari stops"
on public.safari_stops for delete
to authenticated
using (exists (
  select 1 from public.safari_plans p
  where p.id = safari_plan_id and p.user_id = auth.uid()
));

create or replace function public.set_safari_plan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists safari_plans_set_updated_at on public.safari_plans;
create trigger safari_plans_set_updated_at
before update on public.safari_plans
for each row execute function public.set_safari_plan_updated_at();;
