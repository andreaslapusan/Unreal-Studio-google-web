-- Phase 3/4 — payment reminders source + kwitansi (receipt) records.
--
--   * payment_reminders_due()      -> service-role read for the 7-day-before cron
--                                     (joins client → unit → project + latest
--                                     field report so the email carries an obra update)
--   * client_payments.reminder_sent_at is stamped by the edge function (service role).
--   * kwitansis table + admin_*_kwitansi RPCs -> manual "Send kwitansi" button.
--
-- Conventions mirror 20260607000001_client_payments.sql: tables are "no direct
-- access" under RLS; all reads/writes flow through SECURITY DEFINER RPCs gated
-- either on admin_users (admin) or on the service_role (cron).

-- ---------------------------------------------------------------------------
-- Kwitansi records (one row per receipt issued). Numbered sequentially.
-- ---------------------------------------------------------------------------
create table if not exists public.kwitansis (
  id                uuid primary key default gen_random_uuid(),
  no_seq            integer not null,            -- sequential receipt number ("No. 1")
  client_project_id uuid references public.client_projects(id) on delete set null,
  client_payment_id uuid references public.client_payments(id) on delete set null,
  received_from     text not null,               -- "Telah terima dari"
  amount            numeric not null,
  currency          text not null default 'IDR',
  for_payment       text not null,               -- "Untuk pembayaran"
  place             text not null default 'Bali',
  kwitansi_date     date not null,
  html              text,                         -- rendered receipt (for re-send / archive)
  drive_url         text,                         -- optional: copy archived to Drive
  sent_to_email     text,
  sent_at           timestamptz,
  created_by        uuid references public.admin_users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists kwitansis_cp_idx on public.kwitansis(client_project_id);
create unique index if not exists kwitansis_no_seq_uidx on public.kwitansis(no_seq);

alter table public.kwitansis enable row level security;
drop policy if exists "No direct access kwitansis" on public.kwitansis;
create policy "No direct access kwitansis" on public.kwitansis for all to public using (false);

-- ---------------------------------------------------------------------------
-- Admin: create a kwitansi (assigns the next sequential number atomically).
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_kwitansi(p_user_id text, p_kwitansi json)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_user admin_users%rowtype; v_no int; v_id uuid;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  -- Lock the table briefly so concurrent issues don't collide on no_seq.
  lock table kwitansis in share row exclusive mode;
  select coalesce(max(no_seq), 0) + 1 into v_no from kwitansis;

  insert into kwitansis (
    no_seq, client_project_id, client_payment_id, received_from, amount, currency,
    for_payment, place, kwitansi_date, html, created_by
  ) values (
    v_no,
    nullif(p_kwitansi->>'client_project_id','')::uuid,
    nullif(p_kwitansi->>'client_payment_id','')::uuid,
    coalesce(p_kwitansi->>'received_from',''),
    coalesce(nullif(p_kwitansi->>'amount','')::numeric, 0),
    coalesce(nullif(p_kwitansi->>'currency',''), 'IDR'),
    coalesce(p_kwitansi->>'for_payment',''),
    coalesce(nullif(p_kwitansi->>'place',''), 'Bali'),
    coalesce(nullif(p_kwitansi->>'kwitansi_date','')::date, current_date),
    p_kwitansi->>'html',
    v_user.id
  ) returning id into v_id;

  return json_build_object('success', true, 'id', v_id, 'no_seq', v_no);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Admin: record that a kwitansi was emailed (called after the edge fn sends).
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_kwitansi_sent(p_user_id text, p_id uuid, p_email text)
returns json
language plpgsql
security definer
as $function$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;
  update kwitansis set sent_to_email = p_email, sent_at = now() where id = p_id;
  return json_build_object('success', true);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Admin: list kwitansis issued for a client (history per client card).
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_kwitansis(p_user_id text, p_client_id text)
returns json
language plpgsql
security definer
as $function$
declare v_user admin_users%rowtype; v_rows json;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  select json_agg(row_to_json(k) order by k.no_seq desc) into v_rows from (
    select kw.id, kw.no_seq, kw.received_from, kw.amount, kw.currency, kw.for_payment,
           kw.kwitansi_date, kw.sent_to_email, kw.sent_at, kw.client_payment_id
    from kwitansis kw
    join client_projects cp on cp.id = kw.client_project_id
    where cp.client_id::text = p_client_id
  ) k;

  return json_build_object('success', true, 'kwitansis', coalesce(v_rows, '[]'::json));
end;
$function$;

-- ---------------------------------------------------------------------------
-- Cron source: payments whose due_date is exactly N days out (default 7),
-- not yet received and not yet reminded. Carries the recipient + an obra
-- update (latest field report for the unit's project + completion %).
-- service_role only — invoked by the payment-reminders edge function.
-- ---------------------------------------------------------------------------
create or replace function public.payment_reminders_due(p_days_before int default 7)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_rows json;
begin
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
    join clients c          on c.id = cp.client_id and c.is_active = true
    join projects p         on p.id = cp.project_id
    left join lateral (
      select comment, created_at from field_reports f
      where f.project_slug = p.slug
      order by f.created_at desc limit 1
    ) fr on true
    where pay.received = false
      and pay.reminder_sent_at is null
      and pay.due_date = current_date + (p_days_before || ' days')::interval
      and c.email is not null
  ) r;

  return json_build_object('success', true, 'payments', coalesce(v_rows, '[]'::json));
end;
$function$;

grant execute on function public.admin_create_kwitansi(text, json)        to anon, authenticated;
grant execute on function public.admin_mark_kwitansi_sent(text, uuid, text) to anon, authenticated;
grant execute on function public.admin_list_kwitansis(text, text)          to anon, authenticated;
grant execute on function public.payment_reminders_due(int)                to service_role;
