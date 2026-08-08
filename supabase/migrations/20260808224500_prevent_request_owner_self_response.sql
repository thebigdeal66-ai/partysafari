-- An organizer cannot submit a talent response to their own open request.
-- Keep responder identity ownership and open-request eligibility enforced at the database boundary.
alter policy "request_responses_insert_authenticated"
on public.request_responses
to authenticated
with check (
  responder_id = (select auth.uid())
  and exists (
    select 1
    from public.requests r
    where r.id = request_responses.request_id
      and coalesce(r.status, 'open') = 'open'
      and r.created_by is distinct from (select auth.uid())
  )
);
