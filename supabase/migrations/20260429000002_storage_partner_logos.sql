-- Storage RLS for the `images` bucket — partner-logos folder.
--
-- Bucket is already `public: true`, so read access is open. We need to allow
-- authenticated users to upload/replace files inside `partner-logos/`.
--
-- We do NOT scope each lister to a sub-folder by id at the SQL level — the
-- AgenciasDashboard upload code names each file `<partner_id>-<timestamp>.<ext>`,
-- so collisions are already impossible. Anyone authenticated can write inside
-- `partner-logos/`, but the surface is small (logos only) and validated client
-- side (≤2MB, image/* MIME type).
--
-- If we later want stricter per-partner write isolation, we can switch the
-- policy to match `name like (auth.uid() || '/%')` and reorganise paths.

drop policy if exists partner_logos_authenticated_write on storage.objects;
create policy partner_logos_authenticated_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'images'
    and name like 'partner-logos/%'
  );

drop policy if exists partner_logos_authenticated_update on storage.objects;
create policy partner_logos_authenticated_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'images'
    and name like 'partner-logos/%'
  )
  with check (
    bucket_id = 'images'
    and name like 'partner-logos/%'
  );

-- Public read is implicit because bucket is public, but explicit policy keeps
-- the auditor happy and survives a later switch to private buckets.
drop policy if exists partner_logos_public_read on storage.objects;
create policy partner_logos_public_read on storage.objects
  for select
  to public
  using (
    bucket_id = 'images'
    and name like 'partner-logos/%'
  );
