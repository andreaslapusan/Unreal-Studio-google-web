-- Ficha de cliente abierta ANTES de otros cambios los revertía al guardar (6-nov-2026, 17:43:
-- la pausa de correos puesta con admin_set_client_auto_emails y el teléfono de José Manuel).
-- Causa: la ficha mandaba el objeto ENTERO cargado al abrirla y admin_save_client escribe toda clave
-- presente → también revertía contraseñas del portal (password_plain → ensure_auth_user), el idioma
-- elegido por el cliente, estado puesto en bloque, etc.
-- Arreglo: la ficha manda SOLO lo cambiado + sus valores de partida (p_client.base) + la versión de
-- fila que cargó (p_client.expected_updated_at). Si la fila cambió desde entonces y alguien tocó un
-- campo que esta ficha también cambia → {success:false, error:'conflict', fields:[...]} sin escribir.
-- Self-check: supabase/checks/admin_save_client_stale_card.sql

-- 1) Versión de fila. clock_timestamp (no now()): dos cambios en la misma transacción = versiones distintas.
alter table public.clients add column if not exists updated_at timestamptz not null default now();
create or replace function public.clients_set_updated_at() returns trigger
 language plpgsql set search_path to 'public'
as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.clients_set_updated_at();

-- 2) admin_list_clients: igual que en producción (20261106200000) + c.updated_at.
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
          cp.investment_type,cp.pool_total_amount,cp.holder_participants,cp.reports_enabled,cp.unit_type,p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $function$;

-- 3) admin_save_client: igual que en producción (20261106120000) salvo el bloque de la fila existente:
--    lock + comprobación de versión/conflicto y conservar las contraseñas por titular de la BD.
--    Las claves ausentes ya no se tocaban (coalesce); ahora la ficha solo manda las que cambió.
CREATE OR REPLACE FUNCTION public.admin_save_client(p_user_id text, p_client json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_user admin_users%rowtype; v_client_id uuid; v_temp_password text; v_email text;
        v_existing_id uuid; v_old_email text; v_new_pw text; v_plain text; v_extra text[];
        v_holders jsonb; v_name text; v_status text;
        v_p jsonb := p_client::jsonb; v_row clients%rowtype; v_conflicts text[];
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

  select * into v_row from clients where id=v_existing_id for update;
  if v_row.id is not null then
    -- Ficha abierta con una versión anterior: no escribir si alguien cambió un campo que esta ficha
    -- también cambia. Sin versión = UI vieja que manda la ficha entera → también se rechaza.
    if v_row.updated_at is distinct from (v_p->>'expected_updated_at')::timestamptz then
      select array_agg(k order by k) into v_conflicts
      from jsonb_object_keys(v_p - 'id' - 'expected_updated_at' - 'base') k
      where coalesce(to_jsonb(v_row)->k, 'null') is distinct from coalesce(v_p->'base'->k, 'null')
        and coalesce(to_jsonb(v_row)->k, 'null') is distinct from coalesce(v_p->k, 'null');
      if v_conflicts is not null or v_p->>'expected_updated_at' is null then
        return json_build_object('success',false,'error','conflict','fields',coalesce(v_conflicts,'{}'));
      end if;
    end if;
    -- Las contraseñas por titular son de client_change_password, no de la ficha: de cada titular que
    -- ya existe (mismo email) se conserva lo de la BD y la ficha solo pone nombre/email/teléfono/idioma.
    if v_holders is not null then
      select jsonb_agg(case when o.h is null then n.h
               else o.h || (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(n.h) where key in ('name','email','phone','lang')) end
             order by n.i) into v_holders
      from jsonb_array_elements(v_holders) with ordinality n(h, i)
      left join lateral (select x.h from jsonb_array_elements(coalesce(v_row.holders,'[]')) x(h)
                         where lower(trim(x.h->>'email')) = lower(trim(n.h->>'email')) limit 1) o on true;
    end if;
    v_old_email := v_row.email;
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
