create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if v_username = '' then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 16);
  end if;

  insert into public.profiles (
    id,
    username,
    full_name,
    profile_type,
    home_city,
    home_state
  )
  values (
    new.id,
    v_username,
    '',
    'user',
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'home_city', '')), 80), ''),
    nullif(upper(left(trim(coalesce(new.raw_user_meta_data ->> 'home_state', '')), 2)), '')
  );

  return new;
end;
$function$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
