-- 17-nov-2026: asignación INACTIVA / CONGELADA no genera nada (tareas, badge, cobros, estadísticas) + motivo opcional.
-- Datos de pagos intactos (nunca se marcan pagos): solo se filtra.
alter table public.client_projects add column if not exists inactive_reason text check (inactive_reason is null or length(inactive_reason) <= 500);

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
      c.preferred_language,c.preferred_currency,c.feature_overrides,c.created_at,c.last_login,c.must_change_password,c.auto_emails_enabled,
      c.updated_at,
      (select count(*) from client_login_events e where e.client_id=c.id and e.at > now() - interval '7 days') as logins_7d,
      (select count(*) from client_login_events e where e.client_id=c.id and e.at > now() - interval '30 days') as logins_30d,
      case when v_is_superadmin then c.temp_password else null end as temp_password,
      case when v_is_superadmin then c.password_plain else null end as password_plain,
      case when v_is_superadmin then c.password_hash else null end as password_hash,
      (select json_agg(row_to_json(cp_data)) from (
        select cp.id,cp.client_id,cp.project_id,cp.unit_number,cp.investment_amount,
          cp.investment_currency as currency,cp.purchase_date,cp.status,cp.delivery_date,cp.drive_folder_url,
          cp.investment_type,cp.pool_total_amount,cp.holder_participants,cp.reports_enabled,cp.unit_type,cp.is_active,cp.inactive_reason,p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_all_payments(p_user_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_rows json;
begin
  select * into v_user from admin_users where is_active=true and lower(trim(username))=lower(trim(coalesce(app_email(),''))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.due_date nulls last),'[]'::json) into v_rows from (
    select pay.id, pay.label, pay.amount, pay.currency, pay.due_date, pay.received,
           pay.received_amount, pay.bank_fee, pay.paid_at, pay.position,
           c.id as client_id, c.name as client_name, c.email as client_email, c.preferred_language as client_lang,
           cp.id as client_project_id, cp.unit_number, p.name as project_name,
           p.market_price as market_price, p.price_currency as market_currency
    from client_payments pay
    join client_projects cp on cp.id = pay.client_project_id
    join clients c on c.id = cp.client_id
    left join projects p on p.id::text = cp.project_id::text
    where coalesce(c.status, case when c.is_active then 'active' else 'inactive' end) <> 'draft'
      and cp.is_active
      and not public.is_demo_email(c.email)
  ) t;
  return json_build_object('success',true,'payments',v_rows);
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v json;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  if not is_admin_or_team() then return json_build_object('error','forbidden'); end if;
  select json_build_object(
    'properties', (select count(*) from projects where coalesce(slug,'') not like 'demo-%'),
    'clients', (select count(*) from clients where is_active and not is_demo_email(email)),
    'employees', (select count(*) from employees where active and not is_demo_email(email)),
    'agencies', (select count(*) from listing_partners),
    'pending_applications', (select count(*) from listing_partner_applications where status='pending'),
    'pending_vacations', (select count(*) from employee_vacations where coalesce(status,'pendiente') not in ('aprobada','rechazada') and not is_demo_email(employee_email)),
    'tasks', public.admin_unread_count(),
    'unread', (select count(*) from admin_notifications where is_read=false),
    'overdue', (select count(*) from client_payments cp
                  join client_projects cpj on cpj.id=cp.client_project_id
                  join clients c on c.id=cpj.client_id
                 where not coalesce(cp.received,false) and cp.paid_at is null
                   and cp.due_date is not null and cp.due_date < current_date
                   and coalesce(c.status,'') <> 'draft' and cpj.is_active)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_unread_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when is_admin_or_team() then (
    (select count(*) from client_payments cp
       join client_projects cpj on cpj.id=cp.client_project_id
       join clients c on c.id=cpj.client_id
      where not coalesce(cp.received,false) and cp.paid_at is null
        and cp.due_date is not null and cp.due_date < current_date
        and coalesce(c.status,'') <> 'draft' and cpj.is_active)
  + (select count(*) from projects p
      where coalesce(p.is_hidden,false)=false and coalesce(p.completion_percent,0) < 100
        and exists(select 1 from client_projects cpj where cpj.project_id::text=p.id::text)
        and (nullif(p.construction_update_date,'') is null or nullif(p.construction_update_date,'')::date < current_date-14))
  + (select count(*) from admin_notifications where is_read=false and type = 'payment_claim')
  + (case when is_admin() then
       (select count(*) from listing_partner_applications where status = 'pending')
     + (select count(*) from listing_partners where deleted_at is null and agency_signed_path is not null
          and (signed_contract_uploaded_at is null or signed_contract_uploaded_at < agency_signed_uploaded_at))
     + (select count(*) from agency_requests where type = 'project_contract' and template_path is null and status <> 'cancelled')
     else 0 end)
  )::int else 0 end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_attention_panel()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v json;
BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  if not is_admin_or_team() then return json_build_object('error','forbidden'); end if;
  select json_build_object(
    'overdue_payments', (
      select coalesce(json_agg(x),'[]'::json) from (
        select cp.id, cp.label, cp.amount, cp.currency, cp.due_date, c.name as client_name, c.id as client_id
        from client_payments cp
        join client_projects cpj on cpj.id = cp.client_project_id
        join clients c on c.id = cpj.client_id
        where not coalesce(cp.received,false) and cp.paid_at is null
          and cp.due_date is not null and cp.due_date < current_date
          and coalesce(c.status,'') <> 'draft' and cpj.is_active
        order by cp.due_date asc limit 100) x),
    'missing_reports', (
      select coalesce(json_agg(x),'[]'::json) from (
        select p.id as project_id, p.name as project_name, p.completion_percent,
               nullif(p.construction_update_date,'') as construction_update_date,
               case when nullif(p.construction_update_date,'') is null then null
                    else (current_date - nullif(p.construction_update_date,'')::date) end as days_since
        from projects p
        where coalesce(p.is_hidden,false)=false and coalesce(p.completion_percent,0) < 100 and coalesce(p.status,'') not in ('Listo para Entrar','Entregado','Finalizado','Finalizada','Vendido','Completado')
          and exists(select 1 from client_projects cpj where cpj.project_id::text=p.id::text)
          and ( nullif(p.construction_update_date,'') is null
             or (nullif(p.construction_update_date,'')::date < current_date-14
                 and nullif(p.construction_update_date,'')::date >= current_date-30) )
        order by nullif(p.construction_update_date,'')::date asc nulls first limit 100) x),
    'stale_properties', (
      select coalesce(json_agg(x),'[]'::json) from (
        select p.id as project_id, p.name as project_name, p.completion_percent,
               nullif(p.construction_update_date,'') as construction_update_date,
               (current_date - nullif(p.construction_update_date,'')::date) as days_since
        from projects p
        where coalesce(p.is_hidden,false)=false and coalesce(p.completion_percent,0) < 100 and coalesce(p.status,'') not in ('Listo para Entrar','Entregado','Finalizado','Finalizada','Vendido','Completado')
          and exists(select 1 from client_projects cpj where cpj.project_id::text=p.id::text)
          and nullif(p.construction_update_date,'') is not null
          and nullif(p.construction_update_date,'')::date < current_date-30
        order by nullif(p.construction_update_date,'')::date asc limit 100) x),
    'pending_vacations', (
      select coalesce(json_agg(x),'[]'::json) from (
        select ev.id, ev.employee_name, ev.start_date, ev.end_date, ev.type, ev.note
        from employee_vacations ev
        where coalesce(ev.status,'pendiente') not in ('aprobada','rechazada') and not is_demo_email(ev.employee_email)
        order by ev.start_date asc limit 100) x),
    'pending_agency_apps', (
      select coalesce(json_agg(x),'[]'::json) from (
        select a.id, a.agency_name, a.email, a.country, a.created_at
        from listing_partner_applications a where a.status = 'pending'
        order by a.created_at asc limit 100) x),
    'clients_no_property', (
      select coalesce(json_agg(x),'[]'::json) from (
        select c.id, c.name, c.email from clients c
        where c.is_active and coalesce(c.status,'') <> 'draft'
          and not exists(select 1 from client_projects cpj where cpj.client_id = c.id)
        order by c.created_at desc limit 100) x)
  ) into v;
  return v;
end; $function$
;

create or replace function public.admin_set_assignment_reason(p_assignment_id uuid, p_reason text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then return json_build_object('success',false,'error','Unauthorized'); end if;
  update client_projects set inactive_reason = nullif(trim(p_reason), '') where id = p_assignment_id;
  if not found then return json_build_object('success',false,'error','not found'); end if;
  return json_build_object('success',true);
end $$;
revoke all on function public.admin_set_assignment_reason(uuid, text) from public;
grant execute on function public.admin_set_assignment_reason(uuid, text) to authenticated, service_role;
