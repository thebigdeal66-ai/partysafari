-- Sprint 023: venue-tagged stories require a recent active venue check-in.
-- Check-ins are already server-side geofenced, so this prevents remote venue stories
-- without duplicating location math in the stories path.

create or replace function public.enforce_venue_story_presence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venue_id is null then
    return new;
  end if;

  if auth.uid() is null or new.author_id <> auth.uid() then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.venue_checkins vc
    where vc.venue_id = new.venue_id
      and vc.profile_id = auth.uid()
      and vc.expires_at > now()
      and vc.checked_in_at > now() - interval '90 minutes'
  ) then
    raise exception 'Active venue check-in required'
      using errcode = 'P0001',
            hint = 'Check in at the venue before posting a venue story.';
  end if;

  return new;
end;
$$;

drop trigger if exists stories_require_active_venue_checkin on public.stories;
create trigger stories_require_active_venue_checkin
before insert or update of venue_id on public.stories
for each row
execute function public.enforce_venue_story_presence();
