-- Talent response offers and messages are private to the request organizer
-- and the performer who submitted each response.
alter policy "request_responses_select_authenticated"
on public.request_responses
to authenticated
using (
  responder_id = (select auth.uid())
  or exists (
    select 1
    from public.requests r
    where r.id = request_responses.request_id
      and r.created_by = (select auth.uid())
  )
);
