alter policy request_responses_insert_authenticated
on public.request_responses
with check (
  responder_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.profile_type = 'entertainer'
  )
  and exists (
    select 1
    from public.requests r
    where r.id = request_responses.request_id
      and coalesce(r.status, 'open') = 'open'
      and r.created_by is distinct from (select auth.uid())
  )
);
