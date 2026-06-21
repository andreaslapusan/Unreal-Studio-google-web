-- Per-property participants: titulares que participan en cada propiedad + %.
-- holder_participants jsonb [{email,pct}]; NULL/no-array/[] => todos (backward-compat).
-- Aplicado en vivo el 2026-06-21 (v3.442/3.443); este archivo lo deja reproducible.
-- Gating robusto con jsonb_typeof (no revienta con valores no-array).

alter table client_projects add column if not exists holder_participants jsonb;

create or replace function public.admin_assign_project(p_user_id text, p_client_id text, p_project_id text, p_unit text, p_amount numeric, p_currency text, p_date text, p_status text, p_drive text default null::text, p_investment_type text default 'compra'::text, p_pool_total numeric default null::numeric, p_participants jsonb default null::jsonb)
 returns json language plpgsql security definer as $function$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users where id::text=p_user_id and is_active=true and lower(username)=lower(coalesce(app_email(),''));
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  insert into client_projects (client_id,project_id,unit_number,investment_amount,investment_currency,purchase_date,status,drive_folder_url,investment_type,pool_total_amount,holder_participants)
  values (p_client_id::uuid,p_project_id::uuid,p_unit,p_amount,coalesce(p_currency,'EUR'),nullif(p_date,'')::date,p_status,nullif(p_drive,''),coalesce(nullif(p_investment_type,''),'compra'),p_pool_total,p_participants);
  return json_build_object('success',true);
end; $function$;

create or replace function public.admin_update_assignment(p_user_id text, p_assignment_id text, p_amount numeric, p_currency text, p_date text, p_status text, p_unit text, p_delivery text default null::text, p_drive text default null::text, p_investment_type text default null::text, p_pool_total numeric default null::numeric, p_participants jsonb default null::jsonb)
 returns json language plpgsql security definer as $function$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users where id::text=p_user_id and is_active=true and lower(username)=lower(coalesce(app_email(),''));
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  update client_projects set
    unit_number=p_unit, investment_amount=p_amount, investment_currency=coalesce(p_currency,'EUR'),
    purchase_date=case when p_date is not null and p_date<>'' then p_date::date else purchase_date end,
    status=p_status,
    delivery_date=case when p_delivery is null then delivery_date when p_delivery='' then null else p_delivery::timestamptz end,
    drive_folder_url=case when p_drive is null then drive_folder_url when p_drive='' then null else p_drive end,
    investment_type=coalesce(nullif(p_investment_type,''), investment_type),
    pool_total_amount=coalesce(p_pool_total, pool_total_amount),
    holder_participants=case when p_participants is null then holder_participants else p_participants end
  where id::text=p_assignment_id;
  return json_build_object('success',true);
end; $function$;

create or replace function public.admin_list_clients(p_user_id text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
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
          cp.investment_type,cp.pool_total_amount,cp.holder_participants,p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $function$;

create or replace function public.admin_list_client_payments(p_user_id text, p_client_id text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_user admin_users%rowtype; v_units json;
begin
  select * into v_user from admin_users where is_active=true and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  select json_agg(row_to_json(u) order by u.project_name) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number,
           cp.investment_currency as currency, cp.investment_amount as sale_total, cp.holder_participants,
           coalesce((select json_agg(row_to_json(pp) order by pp.due_date nulls last, pp.position)
             from (select pay.id, pay.label, pay.amount, pay.currency, pay.due_date, pay.paid_at, pay.received, pay.received_amount,
                          pay.payment_method, pay.reference, pay.notes, pay.reminder_sent_at, pay.position,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.signed_at is not null) as kw_signed,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.sent_at is not null) as kw_sent
                   from client_payments pay where pay.client_project_id = cp.id) pp), '[]'::json) as payments
    from client_projects cp join projects p on p.id::text = cp.project_id::text
    where cp.client_id::text = p_client_id
  ) u;
  return json_build_object('success', true, 'units', coalesce(v_units, '[]'::json));
end; $function$;

create or replace function public.client_get_dashboard(p_client_id text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_client clients%rowtype; v_projects json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','not a client'); end if;
  select json_agg(row_to_json(t)) into v_projects from (
    select cp.project_id, cp.unit_number, cp.investment_amount, cp.investment_currency,
      cp.purchase_date, cp.status, cp.delivery_date, cp.drive_folder_url, p.name as project_name, p.location as project_location, p.image as project_image,
      p.slug as project_slug, p.completion_percent, p.brochure_url, p.brochures, p.construction_update_url, p.construction_update_date,
      p.investor_price, p.market_price, p.price_currency, p.annual_rental_projection, p.years_contract, p.years_extension, p.land_ratio,
      (select count(*) from client_payments pay where pay.client_project_id = cp.id) as payments_count,
      cp.investment_type, cp.pool_total_amount, cp.holder_participants,
      (select coalesce(sum(pay.amount),0) from client_payments pay where pay.client_project_id = cp.id and coalesce(pay.received,false)) as received_total
    from client_projects cp join projects p on p.id::text=cp.project_id::text
    where cp.client_id = v_client.id
      and (jsonb_typeof(cp.holder_participants) is distinct from 'array' or jsonb_array_length(cp.holder_participants)=0
           or exists (select 1 from jsonb_array_elements(cp.holder_participants) e where lower(e->>'email')=app_email()))
  ) t;
  return json_build_object('success',true,
    'client', json_build_object('name',v_client.name,'email',v_client.email,'drive_folder_url',v_client.drive_folder_url,
      'preferred_language',v_client.preferred_language,'preferred_currency',v_client.preferred_currency,'feature_overrides',v_client.feature_overrides,'holders',v_client.holders),
    'projects', coalesce(v_projects,'[]'::json));
end $function$;

create or replace function public.client_get_payments(p_client_id text)
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_client clients%rowtype; v_units json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.project_name), '[]'::json) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number, cp.investment_currency as currency,
      (select json_agg(json_build_object('id',pay.id,'label',pay.label,'amount',pay.amount,'currency',pay.currency,
          'due_date',pay.due_date,'paid_at',pay.paid_at,'received',pay.received,'received_amount',pay.received_amount,
          'payment_method',pay.payment_method,'reference',pay.reference,'position',pay.position) order by pay.position, pay.due_date)
       from client_payments pay where pay.client_project_id=cp.id) as payments
    from client_projects cp join projects p on p.id::text=cp.project_id::text
    where cp.client_id=v_client.id and exists (select 1 from client_payments pay where pay.client_project_id=cp.id)
      and (jsonb_typeof(cp.holder_participants) is distinct from 'array' or jsonb_array_length(cp.holder_participants)=0
           or exists (select 1 from jsonb_array_elements(cp.holder_participants) e where lower(e->>'email')=app_email()))
  ) t;
  return json_build_object('success',true,'units',v_units);
end $function$;

create or replace function public.payment_reminders_candidates()
 returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_rows json;
begin
  if not (public.is_admin_or_team() or auth.role()='service_role') then return json_build_object('success',false,'error','unauthorized'); end if;
  select json_agg(row_to_json(r)) into v_rows from (
    select pay.id as payment_id, pay.label as payment_label, pay.amount, pay.currency, pay.due_date,
      pay.reminder_stages_sent,
      c.name as client_name, c.email as client_email, c.extra_emails as client_extra_emails, c.holders as client_holders,
      c.preferred_language as lang,
      p.name as project_name, cp.unit_number,
      p.completion_percent, p.construction_update_url,
      cp.holder_participants as holder_participants
    from client_payments pay
    join client_projects cp on cp.id=pay.client_project_id
    join clients c on c.id=cp.client_id and c.is_active=true
    join projects p on p.id::text=cp.project_id::text
    where pay.received=false and pay.due_date is not null
      and c.email is not null and c.email not like '%@pendiente.%'
  ) r;
  return json_build_object('success',true,'payments',coalesce(v_rows,'[]'::json));
end; $function$;
