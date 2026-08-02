alter table public.requests
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.request_responses
  add column if not exists responder_id uuid references public.profiles(id) on delete set null;

alter table public.requests
  alter column created_by set default auth.uid();

alter table public.request_responses
  alter column responder_id set default auth.uid();

update public.requests
set created_by = (
  select id from public.profiles where username = 'thebigdeal66' limit 1
)
where created_by is null;

update public.request_responses
set responder_id = (
  select id from public.profiles where username = 'thebigdeal66' limit 1
)
where responder_id is null;

create index if not exists requests_created_by_idx
  on public.requests(created_by);
create index if not exists request_responses_responder_id_idx
  on public.request_responses(responder_id);
create index if not exists request_responses_request_id_idx
  on public.request_responses(request_id);

drop policy if exists "allow anon update requests" on public.requests;
drop policy if exists "allow insert requests" on public.requests;
drop policy if exists "allow anon update request responses" on public.request_responses;
drop policy if exists "allow insert request responses" on public.request_responses;
drop policy if exists "allow read request responses" on public.request_responses;

drop policy if exists requests_insert_authenticated on public.requests;
create policy requests_insert_authenticated
on public.requests
for insert
to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists requests_update_owner on public.requests;
create policy requests_update_owner
on public.requests
for update
to authenticated
using (created_by = (select auth.uid()))
with check (created_by = (select auth.uid()));

drop policy if exists requests_delete_owner on public.requests;
create policy requests_delete_owner
on public.requests
for delete
to authenticated
using (created_by = (select auth.uid()));

drop policy if exists request_responses_select_authenticated on public.request_responses;
create policy request_responses_select_authenticated
on public.request_responses
for select
to authenticated
using (true);

drop policy if exists request_responses_insert_authenticated on public.request_responses;
create policy request_responses_insert_authenticated
on public.request_responses
for insert
to authenticated
with check (
  responder_id = (select auth.uid())
  and exists (
    select 1
    from public.requests r
    where r.id = request_responses.request_id
      and coalesce(r.status, 'open') = 'open'
  )
);

create or replace function public.accept_offer(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_request_id uuid;
  v_request_owner uuid;
begin
  if v_caller is null then
    raise exception 'Authentication required';
  end if;

  select rr.request_id, r.created_by
    into v_request_id, v_request_owner
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  where rr.id = p_response_id
  for update of r;

  if v_request_id is null then
    raise exception 'Response not found';
  end if;

  if v_request_owner is distinct from v_caller then
    raise exception 'Only the request owner can accept an offer';
  end if;

  update public.request_responses
  set accepted = (id = p_response_id)
  where request_id = v_request_id;

  update public.requests
  set status = 'booked'
  where id = v_request_id;
end;
$$;

revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated, service_role;

revoke insert, update, delete on public.requests from anon;
revoke insert, update, delete on public.request_responses from anon;
grant select on public.requests to anon, authenticated;
grant insert, update, delete on public.requests to authenticated;
grant select, insert on public.request_responses to authenticated;;
