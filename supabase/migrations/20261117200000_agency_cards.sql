-- 17-nov-2026 (Andreas): agencies managed "todo igual que los clientes" in the admin.
--  1. per-agency project access (active/inactive per project, overrides the global whitelist agency_config.agency_projects)
--  2. agency portal passwords visible to admin (same model as clients.password_plain/temp_password), admin-only
--  3. new agency applications in the admin notifications (task + badge + activity feed)

-- 1 ─ per-agency project access. No row = default (global whitelist). RLS on, no policies: only definer functions.
create table if not exists public.agency_project_access (
  partner_id uuid not null references public.listing_partners(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  is_active boolean not null,
  updated_at timestamptz not null default now(),
  primary key (partner_id, project_id)
);
alter table public.agency_project_access enable row level security;
grant select, insert, update, delete on public.agency_project_access to service_role;

-- 2 ─ agency passwords (written by agency-hub welcome + portal_store_plain_password). RLS on, no policies.
create table if not exists public.listing_partner_passwords (
  partner_id uuid primary key references public.listing_partners(id) on delete cascade,
  password_plain text,
  temp_password text,
  must_change_password boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.listing_partner_passwords enable row level security;
grant select, insert, update, delete on public.listing_partner_passwords to service_role;

create or replace function public.agency_partner_project_ok(p_project uuid, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select a.is_active from agency_project_access a
                    where a.partner_id = public.my_active_partner_id() and a.project_id = p_project),
                  public.agency_project_ok(p_name));
$$;
revoke all on function public.agency_partner_project_ok(uuid, text) from public;
grant execute on function public.agency_partner_project_ok(uuid, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agency_pack_get(p_slug text)
 RETURNS SETOF projects LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select (public.project_only_cols(p, array['id','name','slug','location','zone','property_type','description','completion_percent',
           'years_contract','years_extension','investor_price','price_currency','gallery','status','bedrooms','bathrooms','area_m2',
           'furnishing','completion_date','brochure_url','construction_update_url','construction_update_date','google_maps_url',
           'floor_plans','owner_name','lease_end_date','extension_cost_usd','payment_plan_off_plan','zoning_type',
           'building_permit_status','lease_years_paid','structural_warranty','water_supply','land_size_m2','pool_size_m2','parking',
           'view','living_room_style','has_powder_room','has_rooftop','furnishing_pack_cost_usd','video_url','drive_renders_url',
           'drive_2d_plans_url','drive_permits_url','drive_legal_url','drive_brochure_folder_url','description_en','description_id',
           'payment_plan_off_plan_en','payment_plan_off_plan_id','view_en','view_id','living_room_style_en','living_room_style_id',
           'parking_en','parking_id','water_supply_en','water_supply_id','structural_warranty_en','structural_warranty_id',
           'zoning_type_en','zoning_type_id','building_permit_status_en','building_permit_status_id','furnishing_en','furnishing_id',
           'completion_date_en','completion_date_id','lease_end_date_en','lease_end_date_id','description_ro',
           'building_permit_status_ro','furnishing_ro','living_room_style_ro','parking_ro','payment_plan_off_plan_ro',
           'structural_warranty_ro','view_ro','water_supply_ro','zoning_type_ro','visibility_status','area_m2_label',
           'land_m2_label'])).*
    from projects p
   where p.slug = p_slug
     and ( public.is_admin_or_team()
           or (public.my_active_partner_id() is not null and public.agency_partner_project_ok(p.id, p.name)) );
$function$;

CREATE OR REPLACE FUNCTION public.agency_projects_list()
 RETURNS SETOF projects LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select (public.project_only_cols(p, array['id','slug','name','image','investor_price','price_currency','bedrooms','completion_date',
           'is_hidden','visibility_status','status','location','completion_percent','updated_at','construction_update_url',
           'construction_update_date','brochure_url','brochures','drive_renders_url','drive_2d_plans_url',
           'drive_brochure_folder_url','video_url','walkthrough_url','tenure','years_contract','sort_order',
           'completion_date_en','completion_date_id','description','description_en','description_ro','description_id'])).*
    from projects p
   where public.is_admin_or_team()
      or (public.my_active_partner_id() is not null
          and coalesce(p.is_hidden, false) = false
          and coalesce(p.visibility_status, '') <> 'sold_out'
          and public.agency_partner_project_ok(p.id, p.name));
$function$;

-- Admin card data in one call: projects on sale (same rule as the portal) + per-agency overrides + passwords.
create or replace function public.admin_agency_cards()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return json_build_object(
    'projects', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'default_on', public.agency_project_ok(p.name))
                   order by p.sort_order nulls last, p.name), '[]'::json)
                   from projects p where coalesce(p.is_hidden, false) = false and coalesce(p.visibility_status, '') <> 'sold_out'),
    'access', (select coalesce(json_agg(json_build_object('partner_id', a.partner_id, 'project_id', a.project_id, 'is_active', a.is_active)), '[]'::json)
                 from agency_project_access a),
    'passwords', (select coalesce(json_agg(json_build_object('partner_id', w.partner_id, 'password_plain', w.password_plain,
                    'temp_password', w.temp_password, 'must_change_password', w.must_change_password, 'updated_at', w.updated_at)), '[]'::json)
                   from listing_partner_passwords w));
end $$;
revoke all on function public.admin_agency_cards() from public;
grant execute on function public.admin_agency_cards() to authenticated, service_role;

-- Save the card toggles (only on "Guardar"). A value equal to the default removes the override.
create or replace function public.admin_set_agency_projects(p_partner uuid, p_items jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare it jsonb; v_pid uuid; v_on boolean; v_name text; n int := 0;
begin
  if not public.is_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from listing_partners where id = p_partner) then return json_build_object('success', false, 'error', 'partner_not_found'); end if;
  if jsonb_typeof(p_items) <> 'array' then return json_build_object('success', false, 'error', 'bad_items'); end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_pid := (it->>'project_id')::uuid; v_on := (it->>'is_active')::boolean;
    select name into v_name from projects where id = v_pid;
    if v_name is null or v_on is null then continue; end if;
    if v_on = public.agency_project_ok(v_name) then
      delete from agency_project_access where partner_id = p_partner and project_id = v_pid;
    else
      insert into agency_project_access (partner_id, project_id, is_active) values (p_partner, v_pid, v_on)
        on conflict (partner_id, project_id) do update set is_active = excluded.is_active, updated_at = now();
    end if;
    n := n + 1;
  end loop;
  insert into partner_audit (partner_id, action, actor, detail) values (p_partner, 'projects_access', coalesce(app_email(), 'admin'), jsonb_build_object('items', p_items));
  return json_build_object('success', true, 'saved', n);
end $$;
revoke all on function public.admin_set_agency_projects(uuid, jsonb) from public;
grant execute on function public.admin_set_agency_projects(uuid, jsonb) to authenticated, service_role;

-- Password mirror after the user sets/changes it (ResetPassword). Agencies: only their own partner row
-- (by auth.uid); clients/employees are no longer touched from an agency session (same real email).
CREATE OR REPLACE FUNCTION public.portal_store_plain_password(p_new text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_email text; v_done text := ''; v_partner uuid; v_name text;
begin
  v_email := app_email();
  if v_email is null then return json_build_object('success',false,'error','no session'); end if;
  if p_new is null or length(p_new) < 6 then return json_build_object('success',false,'error','weak'); end if;
  if coalesce(auth.jwt()->'app_metadata'->>'portal','') = 'agencias' then
    select id, agency_name into v_partner, v_name from listing_partners where user_id = auth.uid() and deleted_at is null limit 1;
    if v_partner is null then return json_build_object('success',true,'updated',''); end if;
    insert into listing_partner_passwords (partner_id, password_plain, temp_password, must_change_password, updated_at)
      values (v_partner, p_new, null, false, now())
      on conflict (partner_id) do update set password_plain = excluded.password_plain, temp_password = null, must_change_password = false, updated_at = now();
    perform notify('agency_password_change', v_name, 'Ha cambiado su contraseña', 'info', 'listing_partner', v_partner::text, v_name, v_email, null);
    return json_build_object('success',true,'updated','agency');
  end if;
  update clients set password_plain=p_new, temp_password=null, must_change_password=false
    where lower(email)=v_email;
  if found then v_done := 'client'; end if;
  update employees set password=p_new where lower(email)=v_email;
  if found and v_done='' then v_done := 'employee'; end if;
  return json_build_object('success',true,'updated',v_done);
end $function$;

-- 3 ─ notifications: activity entry on every new application (test rows "E2E …" excluded)…
CREATE OR REPLACE FUNCTION public.trg_lpa_hooks()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.agency_name not like 'E2E %' then
      perform notify('agency_application', new.agency_name, coalesce(new.country, ''), 'info', 'listing_partner_application',
                     new.id::text, new.agency_name, new.email, jsonb_build_object('country', new.country, 'website', new.website));
    end if;
    if new.status = 'pending' and coalesce((agency_cfg('auto_approve') #>> '{}')::boolean, false)
       and coalesce(new.auto_check->>'no_auto', '') <> 'true' then
      perform agency_hub_post(jsonb_build_object('action', 'approve', 'mode', 'auto', 'application_id', new.id));
    end if;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform agency_hub_post(jsonb_build_object('action', 'event', 'table', 'listing_partner_applications', 'event', 'rejected', 'id', new.id));
  end if;
  return new;
end;
$function$;

-- …and pending applications as a computed TASK (clears itself on approve/reject) that counts in the badge.
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
  + (case when is_admin() then (select count(*) from listing_partner_applications where status = 'pending') else 0 end)
  )::int else 0 end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_attention_panel()
 RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
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
end; $function$;
