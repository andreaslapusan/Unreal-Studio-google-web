-- Deseo: un solo listing para todos los tipos -> el tipo (A/B/C/D) vive en cada unidad asignada.
-- A = estándar · B = cocina dentro · C = unidades de Sandra · D = unidades de Andreas (6 y 21)
alter table public.client_projects add column if not exists unit_type text
  check (unit_type in ('A','B','C','D'));

create or replace function public.admin_set_unit_type(p_assignment_id text, p_type text)
returns json language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_admin() then return json_build_object('success',false,'error','Unauthorized'); end if;
  update client_projects set unit_type = nullif(p_type,'') where id::text = p_assignment_id;
  return json_build_object('success',true);
end $$;
revoke all on function public.admin_set_unit_type(text, text) from public;
grant execute on function public.admin_set_unit_type(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_clients(p_user_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_clients json; v_is_superadmin boolean;
begin
  select * into v_user from admin_users where is_active=true and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_is_superadmin := (v_user.role='superadmin' or lower(trim(v_user.username)) like 'andreas%');
  select json_agg(row_to_json(t)) into v_clients from (
    select c.id,c.name,c.email,c.extra_emails,c.holders,c.phone,c.notes,c.tags,c.is_active,c.status,c.drive_folder_url,
      c.preferred_language,c.preferred_currency,c.feature_overrides,c.created_at,c.last_login,c.must_change_password,
      case when v_is_superadmin then c.temp_password else null end as temp_password,
      case when v_is_superadmin then c.password_plain else null end as password_plain,
      case when v_is_superadmin then c.password_hash else null end as password_hash,
      (select json_agg(row_to_json(cp_data)) from (
        select cp.id,cp.client_id,cp.project_id,cp.unit_number,cp.investment_amount,
          cp.investment_currency as currency,cp.purchase_date,cp.status,cp.delivery_date,cp.drive_folder_url,
          cp.investment_type,cp.pool_total_amount,cp.holder_participants,cp.reports_enabled,cp.unit_type,p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $function$;

-- Backfill solo donde es seguro (contratos/memoria): DS-03 y DS-20 = B (cocina dentro); DS-11..17 = C (Sandra).
update public.client_projects set unit_type='B' where unit_type is null and unit_number in ('DS-03','DS-20')
  and project_id='9674fe2c-8497-4043-b0e4-9e7294a0f779';
update public.client_projects set unit_type='C' where unit_type is null
  and unit_number in ('DS-11','DS-12','DS-13','DS-14','DS-15','DS-16','DS-17')
  and project_id='9674fe2c-8497-4043-b0e4-9e7294a0f779';
update public.client_projects set unit_type='D' where unit_type is null and unit_number in ('DS-06','DS-21')
  and project_id='9674fe2c-8497-4043-b0e4-9e7294a0f779';
