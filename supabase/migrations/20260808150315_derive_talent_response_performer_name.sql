create or replace function public.set_request_response_performer_name()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_performer_name text;
begin
  select coalesce(
    nullif(btrim(p.display_name), ''),
    nullif(btrim(p.username), '')
  )
  into v_performer_name
  from public.profiles p
  where p.id = new.responder_id;

  if v_performer_name is null then
    raise exception 'Responder profile must have a display name or username';
  end if;

  new.performer_name := v_performer_name;
  return new;
end;
$$;

drop trigger if exists set_request_response_performer_name
on public.request_responses;

create trigger set_request_response_performer_name
before insert on public.request_responses
for each row
execute function public.set_request_response_performer_name();
