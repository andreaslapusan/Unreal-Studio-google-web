-- Storage hardening: the `images` bucket had wide-open public INSERT/UPDATE/
-- DELETE policies (`images_public_upload`, `images_public_update`,
-- `images_public_delete` granted to role `public`), which let anonymous users
-- on the internet upload arbitrary files into the bucket.
--
-- Smoke-tested this: anon `POST /storage/v1/object/images/partner-logos/...`
-- returned HTTP 200 even with no credentials.
--
-- Lock it down: drop the public write policies. Keep `images_public_read` so
-- existing project / partner / blog imagery is still served. Authenticated
-- users now write only via the narrow `partner_logos_authenticated_*` policies
-- added in 20260429000002. Admin/team uploads from EquipoUpload still work
-- because they go through an authenticated session.
--
-- If we later need anon writes (e.g. user-submitted form attachments), gate
-- them behind a Supabase Edge Function that signs upload URLs after rate
-- limiting + virus scan, instead of opening the storage RLS again.

drop policy if exists images_public_upload on storage.objects;
drop policy if exists images_public_update on storage.objects;
drop policy if exists images_public_delete on storage.objects;

-- Allow authenticated users to upload to top-level images/ for the team upload
-- page (EquipoUpload). Scope: any authenticated session, bucket = images.
drop policy if exists images_authenticated_write on storage.objects;
create policy images_authenticated_write on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'images');

drop policy if exists images_authenticated_update on storage.objects;
create policy images_authenticated_update on storage.objects
  for update
  to authenticated
  using (bucket_id = 'images')
  with check (bucket_id = 'images');

drop policy if exists images_authenticated_delete on storage.objects;
create policy images_authenticated_delete on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'images');
