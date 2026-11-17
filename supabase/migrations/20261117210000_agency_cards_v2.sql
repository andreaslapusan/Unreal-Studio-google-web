-- 17-nov-2026 v2 (Andreas, foto de la ficha de cliente): agencia = ficha de cliente 1:1.
--  · comisión/mercado editables en la SOLICITUD antes de aprobar
--  · accesos al portal 7/30 días + aviso de acceso (como client_login_events / client_login)
--  · hash de la contraseña (prefijo) y carpeta Drive de cada proyecto en la ficha

alter table public.listing_partner_applications
  add column if not exists commission_close_pct numeric,
  add column if not exists commission_referral_pct numeric;

create table if not exists public.agency_login_events (
  id bigint generated always as identity primary key,
  partner_id uuid not null references public.listing_partners(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists agency_login_events_partner_idx on public.agency_login_events (partner_id, created_at desc);
alter table public.agency_login_events enable row level security;
grant select, insert, update, delete on public.agency_login_events to service_role;

-- 1 event per session (>1 h after the previous one), same rule as client_mark_login.
create or replace function public.agency_mark_login()
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid; v_name text; v_demo boolean; v_prev timestamptz;
begin
  select id, agency_name, coalesce(is_demo, false) into v_pid, v_name, v_demo from listing_partners
   where user_id = auth.uid() and status = 'approved' and deleted_at is null limit 1;
  if v_pid is null then return; end if;
  select max(created_at) into v_prev from agency_login_events where partner_id = v_pid;
  if v_prev is null or v_prev < now() - interval '1 hour' then
    insert into agency_login_events (partner_id) values (v_pid);
    if not v_demo then
      perform notify('agency_login', v_name, 'Ha entrado en su portal', 'info', 'listing_partner', v_pid::text, v_name, app_email(), null);
    end if;
  end if;
end $$;
revoke all on function public.agency_mark_login() from public;
grant execute on function public.agency_mark_login() to authenticated, service_role;

create or replace function public.admin_agency_cards()
returns json language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Unauthorized' using errcode = '42501'; end if;
  return json_build_object(
    'projects', (select coalesce(json_agg(json_build_object('id', p.id, 'name', p.name, 'default_on', public.agency_project_ok(p.name),
                     'drive_url', coalesce(nullif(p.drive_renders_url, ''), nullif(p.drive_brochure_folder_url, '')))
                   order by p.sort_order nulls last, p.name), '[]'::json)
                   from public.projects p where coalesce(p.is_hidden, false) = false and coalesce(p.visibility_status, '') <> 'sold_out'),
    'access', (select coalesce(json_agg(json_build_object('partner_id', a.partner_id, 'project_id', a.project_id, 'is_active', a.is_active)), '[]'::json)
                 from public.agency_project_access a),
    'passwords', (select coalesce(json_agg(json_build_object('partner_id', w.partner_id, 'password_plain', w.password_plain,
                    'temp_password', w.temp_password, 'must_change_password', w.must_change_password, 'updated_at', w.updated_at)), '[]'::json)
                   from public.listing_partner_passwords w),
    'accounts', (select coalesce(json_agg(json_build_object('partner_id', lp.id,
                    'hash', left(u.encrypted_password, 20),
                    'last_login', greatest(u.last_sign_in_at, (select max(e.created_at) from public.agency_login_events e where e.partner_id = lp.id)),
                    'logins_7d', (select count(*) from public.agency_login_events e where e.partner_id = lp.id and e.created_at > now() - interval '7 days'),
                    'logins_30d', (select count(*) from public.agency_login_events e where e.partner_id = lp.id and e.created_at > now() - interval '30 days'))), '[]'::json)
                  from public.listing_partners lp left join auth.users u on u.id = lp.user_id
                 where lp.deleted_at is null));
end $$;
