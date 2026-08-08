create or replace function public.guard_request_response_submission()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.responder_id is null
     or new.responder_id is distinct from (select auth.uid()) then
    raise exception using
      errcode = '42501',
      message = 'Response identity must match the authenticated user';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.request_id::text || ':' || new.responder_id::text, 0)
  );

  if exists (
    select 1
    from public.request_responses rr
    where rr.request_id = new.request_id
      and rr.responder_id = new.responder_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'You have already responded to this request';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_request_response_submission
on public.request_responses;

create trigger guard_request_response_submission
before insert on public.request_responses
for each row
execute function public.guard_request_response_submission();

alter table public.request_responses
  add constraint request_responses_message_valid
  check (
    message is not null
    and char_length(btrim(message)) between 1 and 2000
  ) not valid;

alter table public.request_responses
  add constraint request_responses_offer_amount_valid
  check (
    offer_amount is null
    or (
      offer_amount >= 0.01
      and offer_amount <= 1000000.00
      and offer_amount = round(offer_amount, 2)
    )
  ) not valid;

create index if not exists request_responses_request_responder_idx
on public.request_responses (request_id, responder_id);
