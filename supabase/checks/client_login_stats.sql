-- Self-check de 20261106200000_client_login_events.sql. Solo lectura; correr entero por la
-- Management API (una sola transacción). Lanza excepción si algo no cuadra; si cuadra devuelve
-- la tabla de comparación (sin nombres, solo el prefijo del id del cliente).
--  · logins_7d / logins_30d de admin_list_clients == recuento directo en client_login_events
--    para los 3 clientes con más accesos (sesión admin simulada SOLO en esta transacción).
--  · anon no ejecuta la RPC ni lee la tabla; un cliente normal recibe Unauthorized y 0 filas.
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'email', (select lower(trim(username)) from admin_users where is_active order by username limit 1))::text, true);

create temp table _chk on commit drop as
with rpc as (
  select (x->>'id')::uuid as client_id, (x->>'logins_7d')::int as rpc_7d, (x->>'logins_30d')::int as rpc_30d
  from json_array_elements(public.admin_list_clients('')->'clients') x)
select p.client_id,
  rpc.rpc_7d, (select count(*) from client_login_events e where e.client_id = p.client_id and e.at > now() - interval '7 days')::int as direct_7d,
  rpc.rpc_30d, (select count(*) from client_login_events e where e.client_id = p.client_id and e.at > now() - interval '30 days')::int as direct_30d
from (select client_id from client_login_events group by 1 order by count(*) desc, 1 limit 3) p
left join rpc using (client_id);

do $$
declare v_client text;
begin
  if (select count(*) from _chk) <> 3 then raise exception 'esperaba 3 clientes, hay %', (select count(*) from _chk); end if;
  if exists (select 1 from _chk where rpc_7d is distinct from direct_7d or rpc_30d is distinct from direct_30d) then
    raise exception 'RPC distinta del recuento directo: %', (select json_agg(_chk) from _chk);
  end if;
  begin
    execute 'set local role anon';
    perform public.admin_list_clients('');
    raise exception 'anon ejecutó admin_list_clients';
  exception when insufficient_privilege then null;
  end;
  begin
    execute 'set local role anon';
    perform 1 from public.client_login_events;
    raise exception 'anon leyó client_login_events';
  exception when insufficient_privilege then null;
  end;
  select lower(c.email) into v_client from clients c
  where not exists (select 1 from admin_users a where lower(trim(a.username)) = lower(c.email))
  order by c.created_at limit 1;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'email', v_client)::text, true);
  execute 'set local role authenticated';
  if (public.admin_list_clients('')->>'success')::boolean then raise exception 'un cliente normal recibió admin_list_clients'; end if;
  if exists (select 1 from public.client_login_events) then raise exception 'un cliente normal ve client_login_events'; end if;
  execute 'reset role';
end $$;

select left(client_id::text, 8) as client, rpc_7d, direct_7d, rpc_30d, direct_30d, 'OK' as result from _chk;
