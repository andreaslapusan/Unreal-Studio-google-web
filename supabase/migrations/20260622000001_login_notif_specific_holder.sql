-- Notificación de login del portal: si la ficha tiene varios titulares, indica
-- EXACTAMENTE quién entró (resuelto por el email de la sesión), no el nombre
-- combinado. Cae al nombre de la ficha si no hay match en holders.
create or replace function public.client_mark_login()
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_client clients%rowtype; v_prev timestamptz; v_who text;
begin
  if app_email() is null then return; end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return; end if;
  v_prev := v_client.last_login;
  update clients set last_login = now() where id = v_client.id;
  if v_prev is null or v_prev < now() - interval '1 hour' then
    select coalesce(
      (select h->>'name' from jsonb_array_elements(coalesce(v_client.holders,'[]'::jsonb)) h
       where lower(h->>'email') = app_email() and coalesce(h->>'name','') <> '' limit 1),
      v_client.name, 'Cliente') into v_who;
    insert into admin_notifications (type, title, body, severity, entity_type, entity_id, actor_name, actor_email)
    values ('client_login','Cliente inició sesión', v_who||' ha entrado en su portal','info','client',v_client.id::text,v_who, app_email());
  end if;
end $function$;
