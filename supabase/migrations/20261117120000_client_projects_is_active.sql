-- Inactivar asignación (client_projects.is_active): conserva todos los datos y pagos;
-- inactiva = fuera del portal cliente (RPCs/RLS/reportes) y sin envíos automáticos.

alter table public.client_projects add column if not exists is_active boolean not null default true;

create or replace function public.admin_set_assignment_active(p_assignment_id uuid, p_active boolean)
 returns json language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_admin() then return json_build_object('success',false,'error','Unauthorized'); end if;
  update client_projects set is_active = coalesce(p_active, true) where id = p_assignment_id;
  if not found then return json_build_object('success',false,'error','not found'); end if;
  return json_build_object('success',true);
end $function$;
revoke all on function public.admin_set_assignment_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_assignment_active(uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.client_get_dashboard(p_client_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client clients%rowtype; v_projects json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','not a client'); end if;
  select json_agg(row_to_json(t)) into v_projects from (
    select cp.project_id, cp.unit_number, cp.investment_amount, cp.investment_currency,
      cp.purchase_date, cp.status, cp.delivery_date, cp.drive_folder_url, cp.reports_enabled, p.name as project_name, p.location as project_location, p.image as project_image,
      p.slug as project_slug, p.completion_percent, p.brochure_url, p.brochures, p.construction_update_url, p.construction_update_date,
      p.investor_price, p.market_price, p.price_currency, p.annual_rental_projection, p.years_contract, p.years_extension, p.land_ratio,
      (select count(*) from client_payments pay where pay.client_project_id = cp.id) as payments_count,
      cp.investment_type, cp.pool_total_amount, cp.holder_participants,
      (select coalesce(sum(pay.amount),0) from client_payments pay where pay.client_project_id = cp.id and coalesce(pay.received,false)) as received_total
    from client_projects cp join projects p on p.id::text=cp.project_id::text
    where cp.client_id = v_client.id and cp.is_active
      and (jsonb_typeof(cp.holder_participants) is distinct from 'array' or jsonb_array_length(cp.holder_participants)=0
           or exists (select 1 from jsonb_array_elements(cp.holder_participants) e where lower(e->>'email')=app_email()))
  ) t;
  return json_build_object('success',true,
    'client', json_build_object('name',v_client.name,'email',v_client.email,'drive_folder_url',v_client.drive_folder_url,
      'preferred_language',v_client.preferred_language,'preferred_currency',v_client.preferred_currency,'feature_overrides',v_client.feature_overrides,'holders',v_client.holders,
      -- idioma de QUIEN ha entrado: el de su titular si lo tiene, si no el del cliente
      'my_language', coalesce((select nullif(h->>'lang','') from jsonb_array_elements(case when jsonb_typeof(v_client.holders)='array' then v_client.holders else '[]' end) h
                               where lower(trim(h->>'email')) = app_email() limit 1), v_client.preferred_language)),
    'projects', coalesce(v_projects,'[]'::json));
end $function$;

CREATE OR REPLACE FUNCTION public.client_get_payments(p_client_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client clients%rowtype; v_units json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.project_name), '[]'::json) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number, cp.investment_currency as currency,
      (select json_agg(json_build_object('id',pay.id,'label',pay.label,'amount',pay.amount,'currency',pay.currency,
          'due_date',pay.due_date,'paid_at',pay.paid_at,'received',pay.received,'received_amount',case when pay.received and coalesce(pay.bank_fee,0)<>0 then coalesce(pay.received_amount,pay.amount)+pay.bank_fee else pay.received_amount end,
          'payment_method',pay.payment_method,'reference',pay.reference,'position',pay.position) order by pay.position, pay.due_date)
       from client_payments pay where pay.client_project_id=cp.id) as payments
    from client_projects cp join projects p on p.id::text=cp.project_id::text
    where cp.client_id=v_client.id and cp.is_active and exists (select 1 from client_payments pay where pay.client_project_id=cp.id)
      and (jsonb_typeof(cp.holder_participants) is distinct from 'array' or jsonb_array_length(cp.holder_participants)=0
           or exists (select 1 from jsonb_array_elements(cp.holder_participants) e where lower(e->>'email')=app_email()))
  ) t;
  return json_build_object('success',true,'units',v_units);
end $function$;

CREATE OR REPLACE FUNCTION public.client_get_kwitansis()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_rows json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select id into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.kwitansi_date desc, t.no_seq desc), '[]'::json) into v_rows from (
    select distinct on (coalesce(k.client_payment_id::text, k.id::text))
           k.id, k.no_seq, k.display_no, k.client_payment_id, k.for_payment, k.amount, k.currency,
           k.kwitansi_date, k.due_date, k.html, k.drive_url, k.received_from, k.place, pr.name as project_name, cp.unit_number
    from kwitansis k join client_projects cp on cp.id = k.client_project_id
    left join projects pr on pr.id::text = cp.project_id::text
    left join client_payments pay on pay.id = k.client_payment_id
    where cp.client_id = v_client and cp.is_active and k.signed_at is not null and (k.client_payment_id is null or pay.received = true)
    order by coalesce(k.client_payment_id::text, k.id::text), k.created_at desc) t;
  return json_build_object('success', true, 'kwitansis', v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.client_owns_project(p_project_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.app_email() is not null and exists (
    select 1 from client_projects cp join clients c on c.id = cp.client_id
     where cp.project_id::text = p_project_id::text and c.is_active and cp.is_active
       and (lower(c.email) = public.app_email() or public.app_email() = any(c.extra_emails)));
$function$;

CREATE OR REPLACE FUNCTION public.can_read_report(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(p_name like 'property-updates/%' and p_name not like '%..%' and (
    public.is_admin() or public.is_admin_or_team()
    or (exists (select 1 from employees e where lower(e.email) = public.app_email() and e.active)
        and not public.is_demo_email(public.app_email()))
    or exists (select 1 from listing_partners lp where lp.user_id = auth.uid() and lp.status = 'approved')
    or exists (
      select 1 from clients c join client_projects cp on cp.client_id = c.id
       where (lower(c.email) = public.app_email() or public.app_email() = any(c.extra_emails))
         and c.is_active
         and cp.project_id::text = (storage.foldername(p_name))[2]
         and cp.is_active
         and coalesce(cp.reports_enabled, true)
         and coalesce(c.feature_overrides->>'construction', '') <> 'false'
         and (jsonb_typeof(cp.holder_participants) is distinct from 'array'
              or jsonb_array_length(cp.holder_participants) = 0
              or exists (select 1 from jsonb_array_elements(cp.holder_participants) h
                          where lower(h->>'email') = public.app_email())))
  ), false);
$function$;

CREATE OR REPLACE FUNCTION public.client_claim_payment(p_client_id uuid, p_payment_id uuid, p_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client clients%rowtype; v_label text;
begin
  if app_email() is null then return json_build_object('success', false, 'error', 'no session'); end if;
  select * into v_client from clients where lower(email)=app_email() and is_active = true limit 1;
  if v_client.id is null then return json_build_object('success', false, 'error', 'not a client'); end if;
  if not exists (
    select 1 from client_payments pay
    join client_projects cp on cp.id = pay.client_project_id
    where pay.id = p_payment_id and cp.client_id = v_client.id and cp.is_active
  ) then return json_build_object('success', false, 'error', 'pago no pertenece al cliente'); end if;
  select cp.label into v_label from client_payments cp where cp.id = p_payment_id;
  insert into client_activity(client_id, event, detail, metadata)
    values (v_client.id, 'payment_claim', coalesce('Marcó como pagado: '||v_label,'Avisó de un pago'),
            jsonb_build_object('payment_id', p_payment_id, 'note', p_note));
  perform notify('payment_claim', v_client.name || ' dice que ya pagó',
    coalesce('Pago: '||v_label,'') || coalesce(' · '||p_note,''), 'action',
    'client_payment', p_payment_id::text, v_client.name, v_client.email,
    jsonb_build_object('payment_id', p_payment_id, 'client_id', v_client.id));
  return json_build_object('success', true);
end; $function$;

CREATE OR REPLACE FUNCTION public.client_list_incidents()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_rows json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select id into v_client from clients where lower(email)=app_email() and is_active=true limit 1;
  if v_client is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc),'[]'::json) into v_rows from (
    select i.id, i.client_project_id, i.title, i.description, i.location, i.photo_path, i.video_url, i.status, i.created_at,
           p.name as project_name, cp.unit_number
    from incidents i join client_projects cp on cp.id=i.client_project_id left join projects p on p.id::text=cp.project_id::text
    where i.client_id=v_client and cp.is_active) t;
  return json_build_object('success',true,'incidents',v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.client_report_incident(p_client_project_id uuid, p_title text, p_description text, p_location text, p_photo_path text, p_video_url text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client uuid; v_id uuid;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select id into v_client from clients where lower(email)=app_email() and is_active=true limit 1;
  if v_client is null then return json_build_object('success',false,'error','not a client'); end if;
  if not exists(select 1 from client_projects where id=p_client_project_id and client_id=v_client and is_active) then
    return json_build_object('success',false,'error','not your property'); end if;
  insert into incidents(client_project_id, client_id, title, description, location, photo_path, video_url)
    values(p_client_project_id, v_client, nullif(p_title,''), nullif(p_description,''), nullif(p_location,''), nullif(p_photo_path,''), nullif(p_video_url,''))
    returning id into v_id;
  return json_build_object('success',true,'id',v_id);
end $function$;

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
    where pay.received=false and pay.due_date is not null and cp.is_active
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
    where pay.received = false and cp.is_active
      and pay.reminder_sent_at is null
      and pay.due_date = current_date + (p_days_before || ' days')::interval
      and c.email is not null
  ) r;

  return json_build_object('success', true, 'payments', coalesce(v_rows, '[]'::json));
end;
$function$;

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
          cp.investment_type,cp.pool_total_amount,cp.holder_participants,cp.reports_enabled,cp.unit_type,cp.is_active,p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_client_payments(p_user_id text, p_client_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_units json;
begin
  select * into v_user from admin_users where is_active=true and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  select json_agg(row_to_json(u) order by u.project_name) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number,
           cp.investment_currency as currency, cp.investment_amount as sale_total, cp.holder_participants, cp.is_active,
           coalesce((select json_agg(row_to_json(pp) order by pp.due_date nulls last, pp.position)
             from (select pay.id, pay.label, pay.amount, pay.currency, pay.due_date, pay.paid_at, pay.received, pay.received_amount, pay.bank_fee,
                          pay.payment_method, pay.reference, pay.notes, pay.reminder_sent_at, pay.position,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.signed_at is not null) as kw_signed,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.sent_at is not null) as kw_sent
                   from client_payments pay where pay.client_project_id = cp.id) pp), '[]'::json) as payments
    from client_projects cp join projects p on p.id::text = cp.project_id::text
    where cp.client_id::text = p_client_id
  ) u;
  return json_build_object('success', true, 'units', coalesce(v_units, '[]'::json));
end; $function$;
