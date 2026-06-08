-- Fix: las RPC de pagos/kwitansi autorizaban SOLO con el id de admin legacy
-- (p_user_id, que el front sacaba del token _ust_sh_ en localStorage). Tras
-- migrar el login a Supabase Auth ese token ya no existe → p_user_id llegaba
-- vacío → "Unauthorized" → el panel mostraba "este cliente no tiene unidades
-- asignadas" aunque sí las tuviera.
--
-- Ahora autorizan con CUALQUIERA de los dos: el p_user_id legacy O el email de
-- la sesión Supabase Auth (auth.email() == admin_users.username). Compatible
-- hacia atrás y funciona con el login nuevo.

create or replace function public.admin_list_client_payments(p_user_id text, p_client_id text)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user admin_users%rowtype; v_units json;
begin
  select * into v_user from admin_users
  where is_active = true
    and (id::text = p_user_id or lower(trim(username)) = lower(trim(coalesce(auth.email(),''))))
  limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  select json_agg(row_to_json(u) order by u.project_name) into v_units from (
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

create or replace function public.admin_save_client_payment(p_user_id text, p_payment json)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user admin_users%rowtype; v_id uuid; v_cp uuid;
begin
  select * into v_user from admin_users
  where is_active = true
    and (id::text = p_user_id or lower(trim(username)) = lower(trim(coalesce(auth.email(),''))))
  limit 1;
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

create or replace function public.admin_delete_client_payment(p_user_id text, p_payment_id uuid)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user admin_users%rowtype;
begin
  select * into v_user from admin_users
  where is_active = true
    and (id::text = p_user_id or lower(trim(username)) = lower(trim(coalesce(auth.email(),''))))
  limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;
  delete from client_payments where id = p_payment_id;
  return json_build_object('success', true);
end;
$function$;

create or replace function public.admin_create_kwitansi(p_user_id text, p_kwitansi json)
 returns json language plpgsql security definer set search_path to 'public'
as $function$
declare v_user admin_users%rowtype; v_no int; v_id uuid;
begin
  select * into v_user from admin_users
  where is_active = true
    and (id::text = p_user_id or lower(trim(username)) = lower(trim(coalesce(auth.email(),''))))
  limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

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
