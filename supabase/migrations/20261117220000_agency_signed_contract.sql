-- 17-nov-2026: contrato FIRMADO de cada agencia. Bucket PRIVADO agency-contracts, ruta <partner_id>/<fichero>.
-- Admin sube/sustituye/lee/borra; la agencia solo LEE su carpeta (enlace firmado corto desde el portal).
insert into storage.buckets (id, name, public) values ('agency-contracts', 'agency-contracts', false)
  on conflict (id) do update set public = false;

alter table public.listing_partners
  add column if not exists signed_contract_path text,
  add column if not exists signed_contract_uploaded_at timestamptz;
-- (agencies cannot write these: protect_partner_privileged_cols only lets them change logo/phone/whatsapp/manager)

drop policy if exists agency_contracts_admin_all on storage.objects;
create policy agency_contracts_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'agency-contracts' and public.is_admin())
  with check (bucket_id = 'agency-contracts' and public.is_admin());

drop policy if exists agency_contracts_own_read on storage.objects;
create policy agency_contracts_own_read on storage.objects for select to authenticated
  using (bucket_id = 'agency-contracts' and (storage.foldername(name))[1] = public.my_active_partner_id()::text);
