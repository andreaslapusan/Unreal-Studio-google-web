-- Phase 3 — Client payment calendar.
-- Adds the client_payments table (scheduled payments per client unit) plus the
-- SECURITY DEFINER RPCs the portal and admin use. Mirrors the existing
-- clients / client_projects / admin_* conventions:
--   * client-facing read  -> client_get_payments(p_client_id text)   (no auth session; own data only)
--   * admin CRUD          -> admin_*_client_payment(p_user_id text, ...) gated on admin_users
-- Tables stay "no direct access" under RLS; all access flows through these RPCs.

-- ---------------------------------------------------------------------------
-- Table (idempotent — already created live on 2026-06-07, kept here for VCS)
-- ---------------------------------------------------------------------------
create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  client_project_id uuid not null references public.client_projects(id) on delete cascade,
  label text not null,
  amount numeric not null,
  currency text not null default 'IDR',
  due_date date,                 -- deadline for Unreal to RECEIVE the funds
  paid_at timestamptz,           -- when the client reports the payment was made
  received boolean not null default false,  -- Unreal confirmed the money arrived
  payment_method text,
  reference text,
  notes text,
  reminder_sent_at timestamptz,  -- dedupes the 7-day-before reminder email
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_payments is 'Phase 3 payment calendar: scheduled payments per client unit (client_projects). due_date = deadline for Unreal to RECEIVE the funds. reminder_sent_at dedupes the 7-day-before reminder email.';

create index if not exists client_payments_cp_idx on public.client_payments(client_project_id);
create index if not exists client_payments_due_unreceived_idx on public.client_payments(due_date) where received = false;

alter table public.client_payments enable row level security;
drop policy if exists "No direct access client_payments" on public.client_payments;
create policy "No direct access client_payments" on public.client_payments for all to public using (false);

create or replace function public.client_payments_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trg_client_payments_updated on public.client_payments;
create trigger trg_client_payments_updated before update on public.client_payments
  for each row execute function public.client_payments_set_updated_at();

-- ---------------------------------------------------------------------------
-- Client-facing read: payments for the logged-in client, grouped by unit.
-- Same access model as client_get_dashboard (text id, is_active gate).
-- ---------------------------------------------------------------------------
create or replace function public.client_get_payments(p_client_id text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_client clients%rowtype; v_units json;
begin
  select * into v_client from clients where id::text = p_client_id and is_active = true;
  if v_client.id is null then
    return json_build_object('success', false, 'error', 'Not found');
  end if;

  select json_agg(row_to_json(u) order by (u->>'project_name')) into v_units from (
    select cp.id as client_project_id,
           p.name as project_name,
           cp.unit_number,
           cp.investment_currency as currency,
           coalesce((
             select json_agg(json_build_object(
               'id', pay.id,
               'label', pay.label,
               'amount', pay.amount,
               'currency', pay.currency,
               'due_date', pay.due_date,
               'paid_at', pay.paid_at,
               'received', pay.received,
               'payment_method', pay.payment_method,
               'reference', pay.reference,
               'position', pay.position
             ) order by pay.position, pay.due_date)
             from client_payments pay where pay.client_project_id = cp.id
           ), '[]'::json) as payments
    from client_projects cp
    join projects p on p.id::text = cp.project_id::text
    where cp.client_id::text = p_client_id
  ) u
  where json_array_length(u.payments) > 0;

  return json_build_object('success', true, 'units', coalesce(v_units, '[]'::json));
end;
$function$;

-- ---------------------------------------------------------------------------
-- Admin read: every payment for one client, grouped by unit (for editing).
-- Gated on admin_users exactly like admin_list_clients.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_client_payments(p_user_id text, p_client_id text)
returns json
language plpgsql
security definer
as $function$
declare v_user admin_users%rowtype; v_units json;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  select json_agg(row_to_json(u) order by (u->>'project_name')) into v_units from (
    select cp.id as client_project_id,
           p.name as project_name,
           cp.unit_number,
           cp.investment_currency as currency,
           coalesce((
             select json_agg(row_to_json(pp) order by pp.position, pp.due_date)
             from (
               select pay.id, pay.label, pay.amount, pay.currency, pay.due_date,
                      pay.paid_at, pay.received, pay.payment_method, pay.reference,
                      pay.notes, pay.reminder_sent_at, pay.position
               from client_payments pay where pay.client_project_id = cp.id
             ) pp
           ), '[]'::json) as payments
    from client_projects cp
    join projects p on p.id::text = cp.project_id::text
    where cp.client_id::text = p_client_id
  ) u;

  return json_build_object('success', true, 'units', coalesce(v_units, '[]'::json));
end;
$function$;

-- ---------------------------------------------------------------------------
-- Admin upsert one payment.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_client_payment(p_user_id text, p_payment json)
returns json
language plpgsql
security definer
as $function$
declare v_user admin_users%rowtype; v_id uuid; v_cp uuid;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  v_id := nullif(p_payment->>'id','')::uuid;
  v_cp := nullif(p_payment->>'client_project_id','')::uuid;

  if v_id is not null and exists (select 1 from client_payments where id = v_id) then
    update client_payments set
      label          = coalesce(p_payment->>'label', label),
      amount         = coalesce(nullif(p_payment->>'amount','')::numeric, amount),
      currency       = coalesce(nullif(p_payment->>'currency',''), currency),
      due_date       = nullif(p_payment->>'due_date','')::date,
      paid_at        = nullif(p_payment->>'paid_at','')::timestamptz,
      received       = coalesce((p_payment->>'received')::boolean, received),
      payment_method = nullif(p_payment->>'payment_method',''),
      reference      = nullif(p_payment->>'reference',''),
      notes          = nullif(p_payment->>'notes',''),
      position       = coalesce(nullif(p_payment->>'position','')::int, position)
    where id = v_id;
    return json_build_object('success', true, 'id', v_id);
  else
    if v_cp is null then return json_build_object('success', false, 'error', 'client_project_id required'); end if;
    insert into client_payments (client_project_id, label, amount, currency, due_date, paid_at, received, payment_method, reference, notes, position)
    values (
      v_cp,
      coalesce(p_payment->>'label',''),
      coalesce(nullif(p_payment->>'amount','')::numeric, 0),
      coalesce(nullif(p_payment->>'currency',''), 'IDR'),
      nullif(p_payment->>'due_date','')::date,
      nullif(p_payment->>'paid_at','')::timestamptz,
      coalesce((p_payment->>'received')::boolean, false),
      nullif(p_payment->>'payment_method',''),
      nullif(p_payment->>'reference',''),
      nullif(p_payment->>'notes',''),
      coalesce(nullif(p_payment->>'position','')::int, 0)
    ) returning id into v_id;
    return json_build_object('success', true, 'id', v_id);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Admin delete one payment.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_client_payment(p_user_id text, p_payment_id uuid)
returns json
language plpgsql
security definer
as $function$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users where id::text = p_user_id and is_active = true;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;
  delete from client_payments where id = p_payment_id;
  return json_build_object('success', true);
end;
$function$;

-- Allow the anon/authenticated roles to call the RPCs (SECURITY DEFINER bodies
-- enforce their own auth). Matches how the other client_*/admin_* RPCs are exposed.
grant execute on function public.client_get_payments(text) to anon, authenticated;
grant execute on function public.admin_list_client_payments(text, text) to anon, authenticated;
grant execute on function public.admin_save_client_payment(text, json) to anon, authenticated;
grant execute on function public.admin_delete_client_payment(text, uuid) to anon, authenticated;
