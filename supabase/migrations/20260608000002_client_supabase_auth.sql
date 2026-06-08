-- Portal cliente sobre Supabase Auth + visibilidad de contraseñas para el dueño.
-- (Aplicado en vivo el 2026-06-08; este archivo es la fuente de verdad.)

-- 1) Crea/actualiza el usuario de login real (auth.users + auth.identities) en
--    formato GoTrue. Las columnas de token deben ser '' (no NULL) o GoTrue da
--    "Database error querying schema". search_path incluye extensions (crypt).
create or replace function public.ensure_auth_user(p_email text, p_password text)
returns uuid language plpgsql security definer set search_path to 'auth','public','extensions' as $$
declare v_uid uuid; v_email text := lower(trim(p_email));
begin
  select id into v_uid from auth.users where lower(email)=v_email limit 1;
  if v_uid is not null then
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
    where id = v_uid;
    return v_uid;
  end if;
  v_uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
     confirmation_token, recovery_token, email_change_token_new, email_change,
     email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated','authenticated', v_email,
     crypt(p_password, gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{"email_verified":true}', now(), now(),
     '','','','','','','','');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_uid::text, v_uid,
     jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', false, 'phone_verified', false),
     'email', now(), now(), now());
  return v_uid;
end $$;

-- 2) id del cliente para la sesión Supabase Auth actual (usado por el dashboard).
create or replace function public.client_my_id()
 returns json language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if auth.email() is null then return json_build_object('success',false,'error','no session'); end if;
  select id into v_id from clients where lower(email)=lower(auth.email()) and is_active=true limit 1;
  if v_id is null then return json_build_object('success',false,'error','not a client'); end if;
  return json_build_object('success',true,'client_id',v_id::text);
end $$;

-- 3) admin_save_client: autz por p_user_id legacy O auth.email(); al crear un
--    cliente, le crea también su usuario de login real.
create or replace function public.admin_save_client(p_user_id text, p_client json)
 returns json language plpgsql security definer set search_path to 'public','extensions' as $$
declare v_user admin_users%rowtype; v_client_id uuid; v_temp_password text; v_email text; v_existing_id uuid;
begin
  select * into v_user from admin_users
  where is_active=true and (id::text=p_user_id or lower(trim(username))=lower(trim(coalesce(auth.email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_email := lower(trim(p_client->>'email'));
  v_existing_id := nullif(p_client->>'id','')::uuid;
  if v_existing_id is not null and exists (select 1 from clients where id=v_existing_id) then
    update clients set name=coalesce(p_client->>'name',name), email=coalesce(v_email,email),
      phone=coalesce(p_client->>'phone',phone), notes=coalesce(p_client->>'notes',notes),
      is_active=coalesce((p_client->>'is_active')::boolean,is_active) where id=v_existing_id;
    return json_build_object('success',true,'client_id',v_existing_id);
  else
    v_temp_password := substr(md5(random()::text),1,8);
    insert into clients (name,email,phone,notes,is_active,password_hash,temp_password,password_plain,must_change_password)
    values (p_client->>'name', v_email, p_client->>'phone', p_client->>'notes',
      coalesce((p_client->>'is_active')::boolean,true),
      crypt(v_temp_password,gen_salt('bf')), v_temp_password, v_temp_password, true)
    returning id into v_client_id;
    if v_email is not null and v_email <> '' then
      perform public.ensure_auth_user(v_email, v_temp_password);
    end if;
    return json_build_object('success',true,'client_id',v_client_id,'temp_password',v_temp_password);
  end if;
end $$;

-- 4) admin_list_clients: el dueño (rol superadmin) ve las contraseñas en claro.
--    Antes comparaba username='andreas' literal, pero el username es el email.
create or replace function public.admin_list_clients(p_user_id text)
 returns json language plpgsql security definer set search_path to 'public' as $$
declare v_user admin_users%rowtype; v_clients json; v_is_superadmin boolean;
begin
  select * into v_user from admin_users
  where is_active=true and (id::text=p_user_id or lower(trim(username))=lower(trim(coalesce(auth.email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_is_superadmin := (v_user.role = 'superadmin' or lower(trim(v_user.username)) like 'andreas%');
  select json_agg(row_to_json(t)) into v_clients from (
    select c.id, c.name, c.email, c.phone, c.notes, c.tags, c.is_active,
      c.created_at, c.last_login, c.must_change_password,
      case when v_is_superadmin then c.temp_password else null end as temp_password,
      case when v_is_superadmin then c.password_plain else null end as password_plain,
      case when v_is_superadmin then c.password_hash else null end as password_hash,
      (select json_agg(row_to_json(cp_data)) from (
        select cp.id, cp.client_id, cp.project_id, cp.unit_number,
          cp.investment_amount, cp.investment_currency as currency,
          cp.purchase_date, cp.status, p.name as project_name
        from client_projects cp join projects p on p.id::text=cp.project_id::text
        where cp.client_id::text=c.id::text) cp_data) as projects
    from clients c order by c.created_at desc
  ) t;
  return json_build_object('success',true,'clients',coalesce(v_clients,'[]'::json));
end $$;
