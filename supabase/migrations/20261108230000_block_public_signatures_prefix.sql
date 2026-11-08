-- La firma del admin ya no vive en Storage público (va como data: URI, 8-nov-2026).
-- Cierra la escritura en images/signatures/ (bucket público) para que nadie vuelva a subir firmas ahí.
drop policy if exists images_staff_insert on storage.objects;
create policy images_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and name !~~ 'partner-logos/%' and name !~~ 'property-updates/%'
              and name !~~ 'signatures/%' and is_staff_uploader());

drop policy if exists images_staff_update on storage.objects;
create policy images_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'images' and is_staff_uploader())
  with check (bucket_id = 'images' and name !~~ 'signatures/%' and is_staff_uploader());
