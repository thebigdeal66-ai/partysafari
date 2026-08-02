-- Public image bucket for PartySafari profile, performer, venue, and event media.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'party-media',
  'party-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public can display uploaded images.
drop policy if exists "party_media_public_read" on storage.objects;
create policy "party_media_public_read"
on storage.objects
for select
to public
using (bucket_id = 'party-media');

-- Signed-in users upload only inside their own top-level folder:
-- {auth.uid()}/avatars, {auth.uid()}/events, etc.
drop policy if exists "party_media_authenticated_insert" on storage.objects;
create policy "party_media_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'party-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Users may replace only files in their own folder.
drop policy if exists "party_media_owner_update" on storage.objects;
create policy "party_media_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'party-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'party-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Users may remove only files in their own folder.
drop policy if exists "party_media_owner_delete" on storage.objects;
create policy "party_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'party-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);;
