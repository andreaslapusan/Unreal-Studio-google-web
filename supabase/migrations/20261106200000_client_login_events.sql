-- Accesos al portal de clientes en la ficha del admin (6-nov-2026, voz 11572 de Andreas):
-- último acceso + nº de accesos en los últimos 7 y 30 días.
-- "Acceso" = entrada separada >1 h de la anterior (la misma regla que el aviso 'client_login').
-- admin_notifications se purga a los 7 días (admin_notifications_cleanup), por eso cada acceso
-- se guarda también en su propia tabla.

-- 1) Tabla de accesos. RLS sin políticas: solo la leen/escriben funciones SECURITY DEFINER.
create table if not exists public.client_login_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text,
  at timestamptz not null default now()
);
create index if not exists client_login_events_client_at_idx on public.client_login_events (client_id, at desc);
alter table public.client_login_events enable row level security;
revoke all on public.client_login_events from anon, authenticated;
grant select, insert, update, delete on public.client_login_events to authenticated;
grant select, insert, update, delete on public.client_login_events to service_role;

-- 2) client_mark_login: igual que en producción + 1 insert dentro de la rama "> 1 h".
CREATE OR REPLACE FUNCTION public.client_mark_login()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client clients%rowtype; v_prev timestamptz; v_who text;
begin
  if app_email() is null then return; end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return; end if;
  v_prev := v_client.last_login;
  update clients set last_login = now() where id = v_client.id;
  if v_prev is null or v_prev < now() - interval '1 hour' then
    insert into client_login_events (client_id, email) values (v_client.id, app_email());
    select coalesce(
      (select h->>'name' from jsonb_array_elements(coalesce(v_client.holders,'[]'::jsonb)) h
       where lower(h->>'email') = app_email() and coalesce(h->>'name','') <> '' limit 1),
      v_client.name, 'Cliente') into v_who;
    insert into admin_notifications (type, title, body, severity, entity_type, entity_id, actor_name, actor_email)
    values ('client_login','Cliente inició sesión', v_who||' ha entrado en su portal','info','client',v_client.id::text,v_who, app_email());
  end if;
end $function$;

-- 3) Backfill idempotente desde los avisos 'client_login' que aún existen (ids borrados se saltan).
insert into public.client_login_events (client_id, email, at)
select c.id, n.actor_email, n.created_at
from public.admin_notifications n
join public.clients c on c.id::text = n.entity_id
where n.type = 'client_login' and n.entity_type = 'client'
  and not exists (select 1 from public.client_login_events e where e.client_id = c.id and e.at = n.created_at);

-- 4) admin_list_clients (mismo check de admin): igual que en producción + logins_7d / logins_30d.
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
