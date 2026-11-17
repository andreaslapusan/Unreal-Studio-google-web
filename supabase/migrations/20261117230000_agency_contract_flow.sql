-- 17-nov-2026 (Andreas): contrato de agencia en 3 pasos, sin adjuntos en la bienvenida.
--  1) la agencia descarga la plantilla (agency-contracts/templates/…; mercado ES = PDF generado por agency-hub)
--  2) la agencia sube su copia firmada (PDF/JPG) a agency-contracts/<partner_id>/agency-… → aviso al admin + tarea
--  3) el admin sube la versión contrafirmada (signed_contract_path) → la agencia la descarga
alter table public.listing_partners
  add column if not exists agency_signed_path text,
  add column if not exists agency_signed_uploaded_at timestamptz;

drop policy if exists agency_contracts_templates_read on storage.objects;
create policy agency_contracts_templates_read on storage.objects for select to authenticated
  using (bucket_id = 'agency-contracts' and (storage.foldername(name))[1] = 'templates' and public.my_active_partner_id() is not null);

drop policy if exists agency_contracts_own_insert on storage.objects;
create policy agency_contracts_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agency-contracts' and (storage.foldername(name))[1] = public.my_active_partner_id()::text
              and storage.filename(name) like 'agency-%');

-- the agency registers its upload (it cannot write listing_partners columns directly)
create or replace function public.agency_set_signed_upload(p_path text)
returns json language plpgsql security definer set search_path = public as $$
declare v_pid uuid := public.my_active_partner_id(); v_name text;
begin
  if v_pid is null then return json_build_object('success', false, 'error', 'not_partner'); end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_pid::text or split_part(p_path, '/', 2) not like 'agency-%' then
    return json_build_object('success', false, 'error', 'bad_path');
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'agency-contracts' and name = p_path) then
    return json_build_object('success', false, 'error', 'not_uploaded');
  end if;
  update listing_partners set agency_signed_path = p_path, agency_signed_uploaded_at = now() where id = v_pid returning agency_name into v_name;
  perform notify('agency_contract_upload', v_name, 'Ha subido el contrato firmado', 'info', 'listing_partner', v_pid::text, v_name, app_email(), null);
  return json_build_object('success', true);
end $$;
revoke all on function public.agency_set_signed_upload(text) from public;
grant execute on function public.agency_set_signed_upload(text) to authenticated, service_role;

-- task + badge: contracts uploaded by the agency and not yet countersigned
create or replace function public.admin_agency_contracts_to_sign()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return (select coalesce(json_agg(json_build_object('id', id, 'agency_name', agency_name, 'email', email, 'uploaded_at', agency_signed_uploaded_at) order by agency_signed_uploaded_at), '[]'::json)
            from listing_partners
           where deleted_at is null and agency_signed_path is not null
             and (signed_contract_uploaded_at is null or signed_contract_uploaded_at < agency_signed_uploaded_at));
end $$;
revoke all on function public.admin_agency_contracts_to_sign() from public;
grant execute on function public.admin_agency_contracts_to_sign() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_unread_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when is_admin_or_team() then (
    (select count(*) from client_payments cp
       join client_projects cpj on cpj.id=cp.client_project_id
       join clients c on c.id=cpj.client_id
      where not coalesce(cp.received,false) and cp.paid_at is null
        and cp.due_date is not null and cp.due_date < current_date
        and coalesce(c.status,'') <> 'draft')
  + (select count(*) from projects p
      where coalesce(p.is_hidden,false)=false and coalesce(p.completion_percent,0) < 100
        and exists(select 1 from client_projects cpj where cpj.project_id::text=p.id::text)
        and (nullif(p.construction_update_date,'') is null or nullif(p.construction_update_date,'')::date < current_date-14))
  + (select count(*) from admin_notifications where is_read=false and type = 'payment_claim')
  + (case when is_admin() then
       (select count(*) from listing_partner_applications where status = 'pending')
     + (select count(*) from listing_partners where deleted_at is null and agency_signed_path is not null
          and (signed_contract_uploaded_at is null or signed_contract_uploaded_at < agency_signed_uploaded_at))
     else 0 end)
  )::int else 0 end;
$function$;
