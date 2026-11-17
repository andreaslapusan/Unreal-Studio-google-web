-- Apps iOS nativas (rama feature/ios-*): tokens de push, versión mínima/última por app y avisos al admin.
-- Aditivo: no cambia nada existente. push-send no envía nada hasta que exista el secret APNS_KEY_P8.

create table if not exists public.device_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  app         text not null,                      -- bundle id: com.unrealstudio.admin(.beta)
  platform    text not null default 'ios',
  lang        text,
  updated_at  timestamptz not null default now()
);
alter table public.device_tokens enable row level security;  -- sin políticas: solo vía RPC / service role
revoke all on public.device_tokens from anon, authenticated;
create index if not exists idx_device_tokens_app on public.device_tokens (app);

create or replace function public.register_device_token(p_token text, p_app text, p_lang text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_token !~ '^[0-9a-f]{64,200}$' or p_app !~ '^com\.unrealstudio\.[a-z]+(\.beta)?$' then raise exception 'bad input'; end if;
  insert into device_tokens (token, user_id, app, lang, updated_at)
  values (p_token, auth.uid(), p_app, left(p_lang, 8), now())
  on conflict (token) do update set user_id = excluded.user_id, app = excluded.app, lang = excluded.lang, updated_at = now();
end $$;
revoke all on function public.register_device_token(text, text, text) from public, anon;
grant execute on function public.register_device_token(text, text, text) to authenticated;

-- Al cerrar sesión el móvil ya no tiene JWT: basta con conocer el token (solo lo tiene ese iPhone).
create or replace function public.unregister_device_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from device_tokens where token = p_token;
$$;
grant execute on function public.unregister_device_token(text) to anon, authenticated;

-- Versión mínima / última por app (la app compara con su CFBundleVersion).
create table if not exists public.app_versions (
  bundle_id    text primary key,
  min_build    int not null default 0,
  latest_build int not null default 0,
  store_url    text,
  updated_at   timestamptz not null default now()
);
alter table public.app_versions enable row level security;
drop policy if exists app_versions_read on public.app_versions;
create policy app_versions_read on public.app_versions for select to anon, authenticated using (true);
grant select on public.app_versions to anon, authenticated;
insert into public.app_versions (bundle_id, store_url) values
  ('com.unrealstudio.clientes.beta', 'itms-beta://'), ('com.unrealstudio.agencias.beta', 'itms-beta://'),
  ('com.unrealstudio.equipo.beta', 'itms-beta://'),   ('com.unrealstudio.admin.beta', 'itms-beta://')
on conflict (bundle_id) do nothing;

-- Aviso nuevo al admin → push con el contador. Marcar leídas/borrar → push silencioso solo con el número del icono.
create or replace function public.push_send(p_body jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_send_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := p_body);
exception when others then
  return; -- nunca bloquear el aviso por el push
end $$;
revoke all on function public.push_send(jsonb) from public, anon, authenticated;

create or replace function public.trg_push_admin_new()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform push_send((select jsonb_build_object('kind', 'admin_new', 'ids', coalesce(jsonb_agg(id), '[]'::jsonb)) from new_rows));
  return null;
end $$;

create or replace function public.trg_push_admin_badge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform push_send(jsonb_build_object('kind', 'admin_badge'));
  return null;
end $$;

drop trigger if exists push_admin_notification_ins on public.admin_notifications;
create trigger push_admin_notification_ins after insert on public.admin_notifications
  referencing new table as new_rows for each statement execute function public.trg_push_admin_new();
drop trigger if exists push_admin_notification_upd on public.admin_notifications;
create trigger push_admin_notification_upd after update of is_read or delete on public.admin_notifications
  for each statement execute function public.trg_push_admin_badge();
