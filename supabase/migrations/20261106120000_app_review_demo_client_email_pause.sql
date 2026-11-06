-- App Review demo accounts (read-only demo admin) + per-client pause of ALL client emails.
-- 1) profiles.role 'demo': logs into /admin (routing only) but is NOT admin/team in any RLS/RPC
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['admin'::text, 'team'::text, 'lister'::text, 'investor'::text, 'demo'::text]));

-- 2) demo marker: App Review accounts are demo.*@unrealstudiobali.com
create or replace function public.is_demo_email(p_email text) returns boolean
language sql immutable set search_path = public as $$
  select lower(coalesce(p_email, '')) like 'demo.%@unrealstudiobali.com'
$$;

-- 3) per-client switch: false = no email of any kind is sent to this client until re-enabled
alter table public.clients add column if not exists auto_emails_enabled boolean not null default true;
comment on column public.clients.auto_emails_enabled is
  'false = pausa TODOS los correos al cliente (recordatorios, avisos de obra, recibís, bienvenida, envíos manuales) hasta reactivarlo';

-- 4) demo accounts never raise in-app alerts (client login, payment claim, late check-in, vacation...)
create or replace function public.trg_skip_demo_notifications() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.is_demo_email(new.actor_email) then return null; end if;
  return new;
end $$;
drop trigger if exists skip_demo_notifications on public.admin_notifications;
create trigger skip_demo_notifications before insert on public.admin_notifications
  for each row execute function public.trg_skip_demo_notifications();

-- 5) mailer guard (send-client-email): is any target a paused client?
create or replace function public.client_emails_paused(p_client_id uuid, p_emails text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where not c.auto_emails_enabled
      and (c.id = p_client_id
           or lower(c.email) = any(p_emails)
           or exists (select 1 from unnest(coalesce(c.extra_emails, '{}'::text[])) e where lower(e) = any(p_emails))
           or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(c.holders) = 'array' then c.holders else '[]'::jsonb end) h
                      where lower(h->>'email') = any(p_emails))))
$$;
revoke execute on function public.client_emails_paused(uuid, text[]) from public, anon, authenticated;
grant execute on function public.client_emails_paused(uuid, text[]) to service_role;

-- 6) admin toggle from the client card
create or replace function public.admin_set_client_auto_emails(p_user_id text, p_client_id uuid, p_enabled boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users where is_active = true and lower(trim(username)) = lower(trim(coalesce(app_email(), ''))) limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;
  update clients set auto_emails_enabled = coalesce(p_enabled, true) where id = p_client_id;
  if not found then return json_build_object('success', false, 'error', 'not found'); end if;
  return json_build_object('success', true, 'auto_emails_enabled', coalesce(p_enabled, true));
end $$;
revoke execute on function public.admin_set_client_auto_emails(text, uuid, boolean) from public, anon;
grant execute on function public.admin_set_client_auto_emails(text, uuid, boolean) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.payment_reminders_candidates()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    join clients c on c.id=cp.client_id and c.is_active=true and c.auto_emails_enabled
    join projects p on p.id::text=cp.project_id::text
    where pay.received=false and pay.due_date is not null
      and c.email is not null and c.email not like '%@pendiente.%'
  ) r;
  return json_build_object('success',true,'payments',coalesce(v_rows,'[]'::json));
end; $function$;

CREATE OR REPLACE FUNCTION public.payment_reminders_due(p_days_before integer DEFAULT 7)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rows json;
begin
  if not (public.is_admin_or_team() or auth.role()='service_role') then return json_build_object('success',false,'error','unauthorized'); end if;
  select json_agg(row_to_json(r)) into v_rows from (
    select
      pay.id            as payment_id,
      pay.label         as payment_label,
      pay.amount        as amount,
      pay.currency      as currency,
      pay.due_date      as due_date,
      c.id              as client_id,
      c.name            as client_name,
      c.email           as client_email,
      p.name            as project_name,
      p.slug            as project_slug,
      cp.unit_number    as unit_number,
      p.completion_percent as completion_percent,
      p.construction_update_url as construction_update_url,
      fr.comment        as last_report_comment,
      fr.created_at     as last_report_at
    from client_payments pay
    join client_projects cp on cp.id = pay.client_project_id
    join clients c          on c.id = cp.client_id and c.is_active = true and c.auto_emails_enabled
    join projects p         on p.id = cp.project_id
    left join lateral (
      select comment, created_at from field_reports f
      where f.project_slug = p.slug
      order by f.created_at desc limit 1
    ) fr on true
    where pay.received = false
      and pay.reminder_sent_at is null
      and pay.due_date = current_date + (p_days_before || ' days')::interval
      and c.email is not null
  ) r;

  return json_build_object('success', true, 'payments', coalesce(v_rows, '[]'::json));
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_client(p_user_id text, p_client json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_user admin_users%rowtype; v_client_id uuid; v_temp_password text; v_email text;
        v_existing_id uuid; v_old_email text; v_new_pw text; v_plain text; v_extra text[];
        v_holders jsonb; v_name text; v_status text;
begin
  select * into v_user from admin_users where is_active=true and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_new_pw := nullif(p_client->>'password_plain','');
  v_existing_id := nullif(p_client->>'id','')::uuid;
  v_status := nullif(p_client->>'status','');
  if p_client->'holders' is not null and json_typeof(p_client->'holders')='array' and json_array_length(p_client->'holders')>0 then
    v_holders := (p_client->'holders')::jsonb;
    select string_agg(nullif(trim(h->>'name'),''), ' & ') into v_name from jsonb_array_elements(v_holders) h where nullif(trim(h->>'name'),'') is not null;
    select lower(trim(h->>'email')) into v_email from jsonb_array_elements(v_holders) h where nullif(trim(h->>'email'),'') is not null limit 1;
    select coalesce(array_agg(lower(trim(e))) filter (where e is not null), '{}') into v_extra from (
      select (h->>'email') e, row_number() over () rn from jsonb_array_elements(v_holders) h where nullif(trim(h->>'email'),'') is not null) s where rn > 1 and trim(e)<>'';
    v_name := coalesce(v_name, p_client->>'name');
  else
    v_holders := null; v_name := p_client->>'name'; v_email := lower(trim(p_client->>'email'));
    if p_client->'extra_emails' is not null then
      v_extra := coalesce((select array_agg(lower(trim(e))) from json_array_elements_text(p_client->'extra_emails') e where trim(e)<>''), '{}');
    end if;
  end if;

  if v_existing_id is not null and exists (select 1 from clients where id=v_existing_id) then
    select email into v_old_email from clients where id=v_existing_id;
    update clients set
      name=coalesce(v_name,name), email=coalesce(v_email,email),
      phone=coalesce(p_client->>'phone',phone), notes=coalesce(p_client->>'notes',notes),
      drive_folder_url=coalesce(p_client->>'drive_folder_url', drive_folder_url),
      preferred_language=coalesce(nullif(p_client->>'preferred_language',''), preferred_language),
      preferred_currency=coalesce(nullif(p_client->>'preferred_currency',''), preferred_currency),
      feature_overrides=coalesce((p_client->>'feature_overrides')::jsonb, feature_overrides),
      status = coalesce(v_status, status),
      is_active = case when v_status is not null then (v_status='active') else coalesce((p_client->>'is_active')::boolean,is_active) end,
      extra_emails = case when (p_client->'holders' is not null or p_client->'extra_emails' is not null) then coalesce(v_extra,'{}') else extra_emails end,
      holders = coalesce(v_holders, holders),
      password_plain = coalesce(v_new_pw, password_plain), temp_password = coalesce(v_new_pw, temp_password),
      password_hash = case when v_new_pw is not null then crypt(v_new_pw,gen_salt('bf')) else password_hash end,
      must_change_password = case when v_new_pw is not null then false else must_change_password end,
      auto_emails_enabled = coalesce((p_client->>'auto_emails_enabled')::boolean, auto_emails_enabled)
    where id=v_existing_id;
    select password_plain into v_plain from clients where id=v_existing_id;
    if v_email is not null and v_email<>'' and (lower(coalesce(v_old_email,'')) <> v_email or v_new_pw is not null) then
      if v_plain is null or v_plain='' then
        v_plain := public.gen_temp_password();
        update clients set password_plain=v_plain, temp_password=v_plain, password_hash=crypt(v_plain,gen_salt('bf')) where id=v_existing_id;
      end if;
      perform public.ensure_auth_user(v_email, coalesce(v_new_pw, v_plain));
    end if;
    if v_extra is not null and array_length(v_extra,1) > 0 then
      perform public.ensure_auth_user_create(e, coalesce(v_new_pw, v_plain, (select password_plain from clients where id=v_existing_id))) from unnest(v_extra) as e;
    end if;
    return json_build_object('success',true,'client_id',v_existing_id,'temp_password',(select password_plain from clients where id=v_existing_id));
  else
    v_temp_password := coalesce(v_new_pw, public.gen_temp_password());
    insert into clients (name,email,phone,notes,drive_folder_url,preferred_language,preferred_currency,feature_overrides,status,is_active,extra_emails,holders,password_hash,temp_password,password_plain,must_change_password,auto_emails_enabled)
    values (v_name, v_email, p_client->>'phone', p_client->>'notes', p_client->>'drive_folder_url',
      coalesce(nullif(p_client->>'preferred_language',''),'es'), coalesce(nullif(p_client->>'preferred_currency',''),'EUR'),
      (p_client->>'feature_overrides')::jsonb, coalesce(v_status,'active'),
      case when v_status is not null then (v_status='active') else coalesce((p_client->>'is_active')::boolean,true) end,
      coalesce(v_extra,'{}'), coalesce(v_holders,'[]'::jsonb),
      crypt(v_temp_password,gen_salt('bf')), v_temp_password, v_temp_password, (v_new_pw is null),
      coalesce((p_client->>'auto_emails_enabled')::boolean, true))
    returning id into v_client_id;
    if v_email is not null and v_email <> '' then perform public.ensure_auth_user(v_email, v_temp_password); end if;
    if v_extra is not null and array_length(v_extra,1) > 0 then
      perform public.ensure_auth_user_create(e, v_temp_password) from unnest(v_extra) as e;
    end if;
    return json_build_object('success',true,'client_id',v_client_id,'temp_password',v_temp_password);
  end if;
end $function$;

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
                   and coalesce(c.status,'') <> 'draft')
  ) into v;
  return v;
end; $function$;

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
        where coalesce(ev.status,'pendiente') not in ('aprobada','rechazada') and not is_demo_email(ev.employee_email)
        order by ev.start_date asc limit 100) x),
    'clients_no_property', (
      select coalesce(json_agg(x),'[]'::json) from (
        select c.id, c.name, c.email from clients c
        where c.is_active and coalesce(c.status,'') <> 'draft'
          and not exists(select 1 from client_projects cpj where cpj.client_id = c.id)
        order by c.created_at desc limit 100) x)
  ) into v;
  return v;
end; $function$;

CREATE OR REPLACE FUNCTION public.is_staff_uploader()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_admin_or_team()
      or (exists (select 1 from employees e where lower(e.email) = public.app_email() and e.active)
          and not public.is_demo_email(public.app_email()));
$function$;
