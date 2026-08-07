drop policy if exists performers_insert_auth on public.performers;

revoke insert, update, delete, truncate, trigger, references
  on table public.performers from anon;
revoke insert, update, delete, truncate, trigger, references
  on table public.performers from authenticated;

grant select on table public.performers to anon, authenticated;
grant update (stage_name, performer_type, photo_url, instagram, bio, genres)
  on table public.performers to authenticated;

drop policy if exists performers_update_owner on public.performers;
create policy performers_update_owner
on public.performers
for update
to authenticated
using (
  exists (
    select 1
    from public.performer_owners po
    where po.performer_id = performers.id
      and po.profile_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.performer_owners po
    where po.performer_id = performers.id
      and po.profile_id = (select auth.uid())
  )
);
