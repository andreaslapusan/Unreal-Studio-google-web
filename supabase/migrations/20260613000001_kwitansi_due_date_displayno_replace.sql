-- Recibís (kwitansis): mejoras 2026-06-13
--  * due_date congelada en el recibí al emitirlo (solo nuevos; los viejos NULL).
--  * display_no ("DS-01") guardado, para que el PDF del cliente muestre el mismo
--    número que la web (antes salía "Nº 1").
--  * RE-EMITIR un recibí REEMPLAZA el anterior del mismo pago (un recibí vigente
--    por pago) — evita duplicados y que el cliente vea una fecha antigua.
--  * client_get_kwitansis / admin_list_kwitansis devuelven el ÚLTIMO por pago y
--    exponen project_name/unit_number (nombre de archivo "DS-02 - Unreal Studio").

alter table public.kwitansis add column if not exists due_date date;
alter table public.kwitansis add column if not exists display_no text;

create or replace function public.admin_create_kwitansi(p_user_id text, p_kwitansi json)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_user admin_users%rowtype; v_no int; v_id uuid; v_due date; v_pay uuid;
begin
  select * into v_user from admin_users
  where is_active = true and (lower(trim(username)) = lower(trim(coalesce(app_email(),''))))
  limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;

  v_pay := nullif(p_kwitansi->>'client_payment_id','')::uuid;

  lock table kwitansis in share row exclusive mode;
  select coalesce(max(no_seq), 0) + 1 into v_no from kwitansis;
  select pay.due_date into v_due from client_payments pay where pay.id = v_pay;

  if v_pay is not null then
    delete from kwitansis where client_payment_id = v_pay;  -- re-emitir = sustituir
  end if;

  insert into kwitansis (
    no_seq, display_no, client_project_id, client_payment_id, received_from, amount, currency,
    for_payment, place, kwitansi_date, due_date, html, created_by
  ) values (
    v_no,
    nullif(p_kwitansi->>'display_no',''),
    nullif(p_kwitansi->>'client_project_id','')::uuid,
    v_pay,
    coalesce(p_kwitansi->>'received_from',''),
    coalesce(nullif(p_kwitansi->>'amount','')::numeric, 0),
    coalesce(nullif(p_kwitansi->>'currency',''), 'IDR'),
    coalesce(p_kwitansi->>'for_payment',''),
    coalesce(nullif(p_kwitansi->>'place',''), 'Bali'),
    coalesce(nullif(p_kwitansi->>'kwitansi_date','')::date, current_date),
    v_due,
    p_kwitansi->>'html',
    v_user.id
  ) returning id into v_id;

  return json_build_object('success', true, 'id', v_id, 'no_seq', v_no);
end; $function$;

create or replace function public.client_get_kwitansis()
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_client uuid; v_rows json;
begin
  if app_email() is null then return json_build_object('success',false,'error','no session'); end if;
  select id into v_client from clients where lower(email)=app_email() and is_active=true limit 1;
  if v_client is null then return json_build_object('success',false,'error','not a client'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.kwitansi_date desc, t.no_seq desc), '[]'::json) into v_rows
  from (
    select distinct on (coalesce(k.client_payment_id::text, k.id::text))
           k.id, k.no_seq, k.display_no, k.client_payment_id, k.for_payment, k.amount, k.currency,
           k.kwitansi_date, k.due_date, k.html, k.drive_url, k.received_from, k.place,
           pr.name as project_name, cp.unit_number
    from kwitansis k
    join client_projects cp on cp.id = k.client_project_id
    left join projects pr on pr.id::text = cp.project_id::text
    left join client_payments pay on pay.id = k.client_payment_id
    where cp.client_id = v_client
      and k.signed_at is not null
      and (k.client_payment_id is null or pay.received = true)
    order by coalesce(k.client_payment_id::text, k.id::text), k.created_at desc
  ) t;
  return json_build_object('success', true, 'kwitansis', v_rows);
end; $function$;

create or replace function public.admin_list_kwitansis(p_user_id text, p_client_id text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare v_user admin_users%rowtype; v_rows json;
begin
  select * into v_user from admin_users
  where is_active = true and (lower(trim(username)) = lower(trim(coalesce(app_email(),''))))
  limit 1;
  if v_user.id is null then return json_build_object('success', false, 'error', 'Unauthorized'); end if;
  select coalesce(json_agg(row_to_json(t) order by t.no_seq desc), '[]'::json) into v_rows from (
    select distinct on (coalesce(kw.client_payment_id::text, kw.id::text))
           kw.id, kw.no_seq, kw.display_no, kw.received_from, kw.amount, kw.currency, kw.for_payment,
           kw.kwitansi_date, kw.due_date, kw.sent_to_email, kw.sent_at, kw.client_payment_id
    from kwitansis kw
    join client_projects cp on cp.id = kw.client_project_id
    where cp.client_id = p_client_id::uuid
    order by coalesce(kw.client_payment_id::text, kw.id::text), kw.created_at desc
  ) t;
  return json_build_object('success', true, 'kwitansis', v_rows);
end; $function$;
