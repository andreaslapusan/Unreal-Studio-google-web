-- El idioma elegido en el selector del portal no llegaba a los correos (fix 2026-11-08):
--  * client_set_my_language solo encontraba al cliente por su email principal (los demás titulares entran con
--    extra_emails → 'not a client') y solo tocaba clients.preferred_language, mientras notify-report y
--    payment-reminders usan primero holders[].lang. Ahora actualiza el titular que ha iniciado sesión
--    (holders[email=app_email()].lang) y, si es el email principal, también preferred_language.
--  * client_get_dashboard devuelve my_language (el idioma de ese titular) para abrir el portal en SU idioma.
--  * admin_save_client: holders[].lang ya no cuenta para el conflicto y la ficha solo lo escribe si el admin
--    lo cambió → el idioma elegido en el portal con la ficha abierta no da 'conflict' ni se pisa.
-- El front solo llama a estas RPC al pulsar el selector (nunca con el idioma auto-detectado).
-- Self-check: supabase/checks/admin_save_client_stale_card.sql (pasos g/h).

CREATE OR REPLACE FUNCTION public.client_set_my_language(p_lang text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me text := app_email(); v_row clients%rowtype; v_holders jsonb; v_pref text;
begin
  if v_me is null then return json_build_object('success',false,'error','no session'); end if;
  if p_lang is null or p_lang not in ('es','en','ro','id') then return json_build_object('success',false,'error','lang'); end if;
  -- mismo cliente que ve en su portal (client_get_dashboard)
  select * into v_row from clients where (lower(email)=v_me or v_me=any(extra_emails)) and is_active=true limit 1 for update;
  if v_row.id is null then return json_build_object('success',false,'error','not a client'); end if;
  v_holders := case when jsonb_typeof(v_row.holders) = 'array' then coalesce((
      select jsonb_agg(case when jsonb_typeof(h) = 'object' and lower(trim(h->>'email')) = v_me
                            then h || jsonb_build_object('lang', p_lang) else h end order by i)
      from jsonb_array_elements(v_row.holders) with ordinality e(h, i)), '[]'::jsonb) else v_row.holders end;
  v_pref := case when lower(v_row.email) = v_me then p_lang else v_row.preferred_language end;
  -- sin cambios no se toca la fila (no mueve updated_at)
  if v_holders is distinct from v_row.holders or v_pref is distinct from v_row.preferred_language then
    update clients set holders = v_holders, preferred_language = v_pref where id = v_row.id;
  end if;
  return json_build_object('success',true);
end $function$;

revoke all on function public.client_set_my_language(text) from public, anon;
grant execute on function public.client_set_my_language(text) to authenticated, service_role;

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
    where cp.client_id = v_client.id
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

CREATE OR REPLACE FUNCTION public.admin_save_client(p_user_id text, p_client json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_user admin_users%rowtype; v_client_id uuid; v_temp_password text; v_email text;
        v_existing_id uuid; v_old_email text; v_new_pw text; v_plain text; v_extra text[];
        v_holders jsonb; v_name text; v_status text;
        v_p jsonb := p_client::jsonb; v_row clients%rowtype; v_conflicts text[]; v_docs jsonb[];
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
      -- Fila actual / valores cargados (base) / tecleados, con los titulares SIN sus claves de contraseña
      -- (password_*, temp_password, must_change_password): las escribe client_change_password y abajo se
      -- conservan siempre de la BD → que un titular cambie la suya en el portal mientras tanto no es conflicto.
      select array_agg(case when jsonb_typeof(d->'holders') = 'array' then jsonb_set(d, '{holders}', (
               select coalesce(jsonb_agg(case when jsonb_typeof(h) = 'object' then (
                        select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(h) where key not like '%password%' and key <> 'lang')
                      else h end order by i), '[]')
               from jsonb_array_elements(d->'holders') with ordinality e(h, i))) else d end order by n)
        into v_docs
      from unnest(array[to_jsonb(v_row), v_p->'base', v_p]) with ordinality u(d, n);
      select array_agg(k order by k) into v_conflicts
      from jsonb_object_keys(v_p - 'id' - 'expected_updated_at' - 'base') k
      where coalesce(v_docs[1]->k, 'null') is distinct from coalesce(v_docs[2]->k, 'null')
        and coalesce(v_docs[1]->k, 'null') is distinct from coalesce(v_docs[3]->k, 'null');
      if v_conflicts is not null or v_p->>'expected_updated_at' is null then
        return json_build_object('success',false,'error','conflict','fields',coalesce(v_conflicts,'{}'));
      end if;
    end if;
    -- Las contraseñas por titular son de client_change_password, no de la ficha: de cada titular que
    -- ya existe (mismo email) se conserva lo de la BD y la ficha solo pone nombre/email/teléfono/idioma.
    if v_holders is not null then
      select jsonb_agg(case when o.h is null then n.h
               else o.h || (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(n.h) where key in ('name','email','phone'))
                        -- idioma: el de la ficha solo si el admin lo cambió respecto a lo cargado; si no, el de la BD
                        -- (el que el titular eligió en su portal con client_set_my_language mientras la ficha seguía abierta).
                        || case when n.h ? 'lang' and (b.h is null or (n.h->'lang') is distinct from (b.h->'lang'))
                                then jsonb_build_object('lang', n.h->'lang') else '{}'::jsonb end end
             order by n.i) into v_holders
      from jsonb_array_elements(v_holders) with ordinality n(h, i)
      left join lateral (select x.h from jsonb_array_elements(coalesce(v_row.holders,'[]')) x(h)
                         where lower(trim(x.h->>'email')) = lower(trim(n.h->>'email')) limit 1) o on true
      left join lateral (select x.h from jsonb_array_elements(case when jsonb_typeof(v_p->'base'->'holders') = 'array'
                                                                   then v_p->'base'->'holders' else '[]' end) x(h)
                         where lower(trim(x.h->>'email')) = lower(trim(n.h->>'email')) limit 1) b on true;
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
