-- Signed-in talent needs the same public request visibility as signed-out discovery.
-- This also allows the request_responses insert policy to validate that a request is open.
alter policy "allow read requests"
on public.requests
to anon, authenticated
using (true);
