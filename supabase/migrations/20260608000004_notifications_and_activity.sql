-- Centro de notificaciones para admin + horarios de empleados + logs de cliente.
-- (2026-06-08) Pedido por Andreas: ver vacaciones, fichajes tarde (margen 15min,
-- requiere horario por empleado), logins de cliente, "ya he pagado", panel
-- "requiere tu atención", y actividad/comunicaciones por cliente.

-- ── 1. Horario por empleado ──────────────────────────────────────────────
alter table public.employees add column if not exists work_start_time time;
alter table public.employees add column if not exists work_end_time   time;
alter table public.employees add column if not exists work_days        int[];          -- ISO 1=Lun..7=Dom
alter table public.employees add column if not exists late_margin_min  int not null default 15;

-- ── 2. Tablas ────────────────────────────────────────────────────────────
create table if not exists public.admin_notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- vacation_request|late_checkin|client_login|payment_claim|generic
  title       text not null,
  body        text,
  severity    text not null default 'info',  -- info|warning|action
  entity_type text,
  entity_id   text,
  actor_name  text,
  actor_email text,
  metadata    jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_admin_notif_created on public.admin_notifications (created_at desc);
create index if not exists idx_admin_notif_type    on public.admin_notifications (type);
create index if not exists idx_admin_notif_unread  on public.admin_notifications (is_read) where is_read = false;

create table if not exists public.client_activity (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients(id) on delete cascade,
  event      text not null,                  -- login|view_payments|download_kwitansi|payment_claim|change_language
  detail     text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_client_activity_client on public.client_activity (client_id, created_at desc);

create table if not exists public.client_email_log (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients(id) on delete set null,
  to_email   text,
  email_type text,
  subject    text,
  status     text not null default 'sent',
  created_at timestamptz not null default now()
);
create index if not exists idx_client_email_log_client on public.client_email_log (client_id, created_at desc);

-- RLS: deny-all; el acceso es SOLO por RPC SECURITY DEFINER (patrón endurecido).
alter table public.admin_notifications enable row level security;
alter table public.client_activity     enable row level security;
alter table public.client_email_log    enable row level security;
revoke all on public.admin_notifications from anon, authenticated;
revoke all on public.client_activity     from anon, authenticated;
revoke all on public.client_email_log    from anon, authenticated;

-- ── 3. Helpers ───────────────────────────────────────────────────────────
create or replace function public.is_admin_or_team()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles p where p.user_id = auth.uid() and p.role in ('admin','team'));
$$;

create or replace function public.notify(
  p_type text, p_title text, p_body text, p_severity text default 'info',
  p_entity_type text default null, p_entity_id text default null,
  p_actor_name text default null, p_actor_email text default null, p_metadata jsonb default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into admin_notifications(type,title,body,severity,entity_type,entity_id,actor_name,actor_email,metadata)
  values (p_type,p_title,p_body,p_severity,p_entity_type,p_entity_id,p_actor_name,p_actor_email,p_metadata)
  returning id into v_id;
  return v_id;
end; $$;

-- ── 4. Trigger: solicitud de vacaciones → notificación ───────────────────
create or replace function public.trg_vacation_notify()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform notify('vacation_request',
    coalesce(NEW.employee_name, NEW.employee_email) || ' solicitó vacaciones',
    to_char(NEW.start_date,'DD/MM/YYYY') || ' → ' || to_char(NEW.end_date,'DD/MM/YYYY')
      || ' · ' || coalesce(NEW.type,'vacaciones') || coalesce(' · '||NEW.note,''),
    'action', 'employee_vacation', NEW.id::text,
    NEW.employee_name, NEW.employee_email,
    jsonb_build_object('start',NEW.start_date,'end',NEW.end_date,'vtype',NEW.type));
  return NEW;
end; $$;
drop trigger if exists vacation_notify on public.employee_vacations;
create trigger vacation_notify after insert on public.employee_vacations
  for each row when (NEW.status in ('pendiente','pending')) execute function public.trg_vacation_notify();

-- ── 5. Trigger: fichaje de entrada tarde → notificación ──────────────────
create or replace function public.trg_late_checkin_notify()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_start time; v_margin int; v_days int[];
  v_local timestamp; v_local_time time; v_dow int;
begin
  if NEW.type <> 'check_in' then return NEW; end if;
  select work_start_time, coalesce(late_margin_min,15), work_days
    into v_start, v_margin, v_days
    from employees where lower(email) = lower(NEW.employee_email) limit 1;
  if v_start is null then return NEW; end if;
  v_local      := (NEW.created_at at time zone 'Asia/Makassar');  -- hora local Bali (WITA)
  v_local_time := v_local::time;
  v_dow        := extract(isodow from v_local)::int;
  if v_days is not null and array_length(v_days,1) is not null and not (v_dow = any(v_days)) then
    return NEW;  -- no es día laborable de ese empleado
  end if;
  if v_local_time > (v_start + (v_margin || ' minutes')::interval) then
    perform notify('late_checkin',
      coalesce(NEW.employee_name, NEW.employee_email) || ' fichó tarde',
      'Entrada a las ' || to_char(v_local_time,'HH24:MI') || ' (horario ' || to_char(v_start,'HH24:MI')
        || ' +' || v_margin || ' min de margen)',
      'warning', 'attendance', NEW.id::text,
      NEW.employee_name, NEW.employee_email,
      jsonb_build_object('checkin', to_char(v_local_time,'HH24:MI'),'start', to_char(v_start,'HH24:MI'),'margin',v_margin));
  end if;
  return NEW;
end; $$;
drop trigger if exists late_checkin_notify on public.attendance;
create trigger late_checkin_notify after insert on public.attendance
  for each row execute function public.trg_late_checkin_notify();

-- ── 6. Login de cliente: log + notificación + last_login ─────────────────
create or replace function public.verify_client_login(p_email text, p_phone text, p_password text)
returns json language plpgsql security definer set search_path=public as $$
declare v_client clients%ROWTYPE;
begin
  if p_email is not null then
    select * into v_client from clients where email = p_email and is_active = true;
  elsif p_phone is not null then
    select * into v_client from clients where phone = p_phone and is_active = true;
  end if;
  if v_client.id is null then
    return json_build_object('success', false, 'error', 'Credenciales incorrectas');
  end if;
  if v_client.password_hash != crypt(p_password, v_client.password_hash) then
    return json_build_object('success', false, 'error', 'Credenciales incorrectas');
  end if;
  -- log + notificación de actividad
  update clients set last_login = now() where id = v_client.id;
  insert into client_activity(client_id, event, detail) values (v_client.id, 'login', 'Inició sesión en su portal');
  perform notify('client_login', v_client.name || ' inició sesión',
    'El cliente accedió a su portal', 'info', 'client', v_client.id::text, v_client.name, v_client.email, null);
  return json_build_object('success', true, 'client_id', v_client.id, 'name', v_client.name);
end; $$;

-- ── 7. Cliente: "ya he pagado / subir comprobante" ───────────────────────
-- Deriva el cliente del propio pago; registra actividad + notifica al admin.
create or replace function public.client_claim_payment(p_client_id uuid, p_payment_id uuid, p_note text default null)
returns json language plpgsql security definer set search_path=public as $$
declare v_client clients%ROWTYPE; v_label text; v_proj text;
begin
  select * into v_client from clients where id = p_client_id and is_active = true;
  if v_client.id is null then return json_build_object('success', false, 'error', 'cliente'); end if;
  -- (opcional) datos del pago para el texto
  select cp.label into v_label from client_payments cp where cp.id = p_payment_id;
  insert into client_activity(client_id, event, detail, metadata)
    values (v_client.id, 'payment_claim', coalesce('Marcó como pagado: '||v_label,'Avisó de un pago'),
            jsonb_build_object('payment_id', p_payment_id, 'note', p_note));
  perform notify('payment_claim', v_client.name || ' dice que ya pagó',
    coalesce('Pago: '||v_label,'') || coalesce(' · '||p_note,''), 'action',
    'client_payment', p_payment_id::text, v_client.name, v_client.email,
    jsonb_build_object('payment_id', p_payment_id, 'client_id', v_client.id));
  return json_build_object('success', true);
end; $$;
grant execute on function public.client_claim_payment(uuid,uuid,text) to anon, authenticated;

-- ── 8. RPCs admin de lectura ─────────────────────────────────────────────
create or replace function public.admin_notifications_list(
  p_type text default null, p_only_unread boolean default false, p_limit int default 200)
returns setof public.admin_notifications language sql stable security definer set search_path=public as $$
  select * from admin_notifications
  where is_admin_or_team()
    and (p_type is null or type = p_type)
    and (not p_only_unread or is_read = false)
  order by created_at desc
  limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.admin_notifications_list(text,boolean,int) to authenticated;

create or replace function public.admin_notifications_mark_read(p_id uuid, p_read boolean default true)
returns void language sql security definer set search_path=public as $$
  update admin_notifications set is_read = p_read where id = p_id and is_admin_or_team();
$$;
grant execute on function public.admin_notifications_mark_read(uuid,boolean) to authenticated;

create or replace function public.admin_notifications_mark_all_read()
returns void language sql security definer set search_path=public as $$
  update admin_notifications set is_read = true where is_admin_or_team() and is_read = false;
$$;
grant execute on function public.admin_notifications_mark_all_read() to authenticated;

create or replace function public.admin_unread_count()
returns int language sql stable security definer set search_path=public as $$
  select case when is_admin_or_team()
    then (select count(*)::int from admin_notifications where is_read = false) else 0 end;
$$;
grant execute on function public.admin_unread_count() to authenticated;

-- Actividad de un cliente (para cotillear su uso del portal).
create or replace function public.admin_client_activity(p_client_id uuid, p_limit int default 200)
returns setof public.client_activity language sql stable security definer set search_path=public as $$
  select * from client_activity
  where is_admin_or_team() and client_id = p_client_id
  order by created_at desc limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.admin_client_activity(uuid,int) to authenticated;

-- Log de emails enviados a un cliente.
create or replace function public.admin_client_emails(p_client_id uuid, p_limit int default 200)
returns setof public.client_email_log language sql stable security definer set search_path=public as $$
  select * from client_email_log
  where is_admin_or_team() and client_id = p_client_id
  order by created_at desc limit greatest(1, least(p_limit, 500));
$$;
grant execute on function public.admin_client_emails(uuid,int) to authenticated;

-- Panel "Requiere tu atención": agregados en vivo.
create or replace function public.admin_attention_panel()
returns json language plpgsql stable security definer set search_path=public as $$
declare v json;
begin
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
        order by cp.due_date asc limit 100) x),
    'clients_no_property', (
      select coalesce(json_agg(x),'[]'::json) from (
        select c.id, c.name, c.email from clients c
        where c.is_active and not exists(select 1 from client_projects cpj where cpj.client_id = c.id)
        order by c.created_at desc limit 100) x)
  ) into v;
  return v;
end; $$;
grant execute on function public.admin_attention_panel() to authenticated;
