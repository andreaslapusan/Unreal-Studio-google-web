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
          and coalesce(c.status,'') <> 'draft'
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
        where coalesce(ev.status,'pendiente') not in ('aprobada','rechazada')
        order by ev.start_date asc limit 100) x),
    'clients_no_property', (
      select coalesce(json_agg(x),'[]'::json) from (
        select c.id, c.name, c.email from clients c
        where c.is_active and coalesce(c.status,'') <> 'draft'
          and not exists(select 1 from client_projects cpj where cpj.client_id = c.id)
        order by c.created_at desc limit 100) x)
  ) into v;
  return v;
end; $function$
