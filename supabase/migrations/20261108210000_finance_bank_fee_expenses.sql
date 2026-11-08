-- Finanzas 8-nov-2026 (pedido de Andreas 7-nov): comisión bancaria por pago + módulo Gastos.
--
-- REGLA de la comisión (client_payments.bank_fee, nullable, aditiva):
--   received_amount = lo que LLEGÓ de verdad al banco (NETO; es lo que sale en el recibí).
--   bank_fee        = lo que el banco se quedó en esa transferencia (lo asume Unreal).
--   acreditado (bruto) = coalesce(received_amount, amount) + bank_fee -> cuenta para el saldo
--   del cliente. Si el descuadre se debe a la comisión, apuntarla lo cierra; si no se apunta,
--   el descuadre sigue siendo del cliente. El cliente NUNCA ve la comisión: el portal recibe
--   ya el importe acreditado en received_amount (client_get_payments).
-- Además admin_all_payments excluye las cuentas demo (App Review) aunque no estén en draft.

alter table public.client_payments add column if not exists bank_fee numeric;
comment on column public.client_payments.bank_fee is 'Comisión bancaria de esta transferencia (la asume Unreal). Acreditado = coalesce(received_amount,amount)+bank_fee.';

CREATE OR REPLACE FUNCTION public.admin_all_payments(p_user_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_rows json;
begin
  select * into v_user from admin_users where is_active=true and lower(trim(username))=lower(trim(coalesce(app_email(),''))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.due_date nulls last),'[]'::json) into v_rows from (
    select pay.id, pay.label, pay.amount, pay.currency, pay.due_date, pay.received,
           pay.received_amount, pay.bank_fee, pay.paid_at, pay.position,
           c.id as client_id, c.name as client_name, c.email as client_email, c.preferred_language as client_lang,
           cp.id as client_project_id, cp.unit_number, p.name as project_name,
           p.market_price as market_price, p.price_currency as market_currency
    from client_payments pay
    join client_projects cp on cp.id = pay.client_project_id
    join clients c on c.id = cp.client_id
    left join projects p on p.id::text = cp.project_id::text
    where coalesce(c.status, case when c.is_active then 'active' else 'inactive' end) <> 'draft'
      and not public.is_demo_email(c.email)
  ) t;
  return json_build_object('success',true,'payments',v_rows);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_list_client_payments(p_user_id text, p_client_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_units json;
begin
  select * into v_user from admin_users where is_active=true and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  select json_agg(row_to_json(u) order by u.project_name) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number,
           cp.investment_currency as currency, cp.investment_amount as sale_total, cp.holder_participants,
           coalesce((select json_agg(row_to_json(pp) order by pp.due_date nulls last, pp.position)
             from (select pay.id, pay.label, pay.amount, pay.currency, pay.due_date, pay.paid_at, pay.received, pay.received_amount, pay.bank_fee,
                          pay.payment_method, pay.reference, pay.notes, pay.reminder_sent_at, pay.position,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.signed_at is not null) as kw_signed,
                          exists(select 1 from kwitansis k where k.client_payment_id=pay.id and k.sent_at is not null) as kw_sent
                   from client_payments pay where pay.client_project_id = cp.id) pp), '[]'::json) as payments
    from client_projects cp join projects p on p.id::text = cp.project_id::text
    where cp.client_id::text = p_client_id
  ) u;
  return json_build_object('success', true, 'units', coalesce(v_units, '[]'::json));
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_save_client_payment(p_user_id text, p_payment json)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user admin_users%rowtype; v_id uuid; v_cp uuid; j jsonb := p_payment::jsonb;
begin
  select * into v_user from admin_users where is_active=true
    and (lower(trim(username))=lower(trim(coalesce(app_email(),'')))) limit 1;
  if v_user.id is null then return json_build_object('success',false,'error','Unauthorized'); end if;
  v_id := nullif(p_payment->>'id','')::uuid;
  v_cp := nullif(p_payment->>'client_project_id','')::uuid;
  if v_id is not null and exists (select 1 from client_payments where id = v_id) then
    update client_payments set
      label          = coalesce(p_payment->>'label', label),
      amount         = coalesce(nullif(p_payment->>'amount','')::numeric, amount),
      currency       = coalesce(nullif(p_payment->>'currency',''), currency),
      due_date       = case when (j ? 'due_date') then nullif(p_payment->>'due_date','')::date else due_date end,
      paid_at        = case when (j ? 'paid_at') then nullif(p_payment->>'paid_at','')::timestamptz else paid_at end,
      received       = coalesce((p_payment->>'received')::boolean, received),
      received_amount= case when (j ? 'received_amount') then nullif(p_payment->>'received_amount','')::numeric else received_amount end,
      bank_fee       = case when (j ? 'bank_fee') then nullif(p_payment->>'bank_fee','')::numeric else bank_fee end,
      payment_method = case when (j ? 'payment_method') then nullif(p_payment->>'payment_method','') else payment_method end,
      reference      = case when (j ? 'reference') then nullif(p_payment->>'reference','') else reference end,
      notes          = case when (j ? 'notes') then nullif(p_payment->>'notes','') else notes end,
      position       = coalesce(nullif(p_payment->>'position','')::int, position)
    where id = v_id;
    return json_build_object('success', true, 'id', v_id);
  else
    if v_cp is null then return json_build_object('success', false, 'error', 'client_project_id required'); end if;
    insert into client_payments (client_project_id, label, amount, currency, due_date, paid_at, received, received_amount, bank_fee, payment_method, reference, notes, position)
    values (v_cp, coalesce(p_payment->>'label',''), coalesce(nullif(p_payment->>'amount','')::numeric,0),
      coalesce(nullif(p_payment->>'currency',''),'IDR'), nullif(p_payment->>'due_date','')::date,
      nullif(p_payment->>'paid_at','')::timestamptz, coalesce((p_payment->>'received')::boolean,false),
      nullif(p_payment->>'received_amount','')::numeric, nullif(p_payment->>'bank_fee','')::numeric,
      nullif(p_payment->>'payment_method',''), nullif(p_payment->>'reference',''), nullif(p_payment->>'notes',''),
      coalesce(nullif(p_payment->>'position','')::int,0)) returning id into v_id;
    return json_build_object('success', true, 'id', v_id);
  end if;
end; $function$;

CREATE OR REPLACE FUNCTION public.client_get_payments(p_client_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_client clients%rowtype; v_units json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select * into v_client from clients where (lower(email)=app_email() or app_email()=any(extra_emails)) and is_active=true limit 1;
  if v_client.id is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.project_name), '[]'::json) into v_units from (
    select cp.id as client_project_id, p.name as project_name, cp.unit_number, cp.investment_currency as currency,
      (select json_agg(json_build_object('id',pay.id,'label',pay.label,'amount',pay.amount,'currency',pay.currency,
          'due_date',pay.due_date,'paid_at',pay.paid_at,'received',pay.received,'received_amount',case when pay.received and coalesce(pay.bank_fee,0)<>0 then coalesce(pay.received_amount,pay.amount)+pay.bank_fee else pay.received_amount end,
          'payment_method',pay.payment_method,'reference',pay.reference,'position',pay.position) order by pay.position, pay.due_date)
       from client_payments pay where pay.client_project_id=cp.id) as payments
    from client_projects cp join projects p on p.id::text=cp.project_id::text
    where cp.client_id=v_client.id and exists (select 1 from client_payments pay where pay.client_project_id=cp.id)
      and (jsonb_typeof(cp.holder_participants) is distinct from 'array' or jsonb_array_length(cp.holder_participants)=0
           or exists (select 1 from jsonb_array_elements(cp.holder_participants) e where lower(e->>'email')=app_email()))
  ) t;
  return json_build_object('success',true,'units',v_units);
end $function$;

-- ===== Gastos (pagos que hace Andreas a constructores y por terrenos) — solo admins =====
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'constructor' check (kind in ('constructor','terreno','otro')),
  project_id uuid references public.projects(id) on delete set null,
  service_contact_id uuid references public.service_contacts(id) on delete set null,
  payee text,
  concept text not null,
  amount numeric not null check (amount >= 0),
  currency text not null default 'IDR',
  due_date date,
  paid_date date,
  status text not null default 'pendiente' check (status in ('pendiente','pagado')),
  notes text,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
drop policy if exists exp_admin_all on public.expenses;
create policy exp_admin_all on public.expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.expenses from anon, public;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expenses to service_role;

-- Adjuntos (facturas/recibos) en bucket PRIVADO; solo admins; se ven con enlace firmado.
insert into storage.buckets (id, name, public, file_size_limit)
values ('expenses', 'expenses', false, 26214400)
on conflict (id) do update set public = false;
drop policy if exists expenses_admin_read on storage.objects;
drop policy if exists expenses_admin_insert on storage.objects;
drop policy if exists expenses_admin_update on storage.objects;
drop policy if exists expenses_admin_delete on storage.objects;
create policy expenses_admin_read on storage.objects for select to authenticated
  using (bucket_id = 'expenses' and public.is_admin());
create policy expenses_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expenses' and public.is_admin());
create policy expenses_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'expenses' and public.is_admin()) with check (bucket_id = 'expenses' and public.is_admin());
create policy expenses_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expenses' and public.is_admin());
