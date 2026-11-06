-- Self-check de las notas de clientes de agencia (agency_lead_notes, migración 20261106210000).
-- Correr entero por la Management API. Todo lo que escribe va dentro de un bloque que SIEMPRE
-- se deshace (excepción centinela 'zz-rollback'): no deja filas. Si algo no cuadra lanza
-- excepción; si cuadra devuelve OK y leftovers = 0.
--  · admin: añade una nota del Equipo Unreal ('unreal') a un cliente de la agencia demo y la borra;
--    no puede colgarla de otra agencia (lead de A con agency_id de B).
--  · agencia demo: ve la nota del Equipo Unreal, pero no escribe notas 'unreal', no borra,
--    no escribe en clientes de otra agencia ni lee notas de otra agencia
--    (lead + nota temporales de otra agencia creados dentro del bloque).
do $$
declare
  v_admin uuid := (select p.user_id from profiles p join auth.users u on u.id = p.user_id
                   where p.role = 'admin' and lower(u.email) = 'smoke_admin@unrealstudiobali.com');
  v_demo uuid; v_demo_user uuid; v_lead uuid; v_other uuid; v_other_lead uuid; n int;
begin
  select id, user_id into v_demo, v_demo_user from listing_partners where email = 'demo.agencia@unrealstudiobali.com';
  select id into v_lead from agency_leads where agency_id = v_demo order by created_at limit 1;
  select id into v_other from listing_partners where id <> v_demo order by created_at limit 1;
  if v_admin is null or v_demo_user is null or v_lead is null or v_other is null then
    raise exception 'faltan datos de prueba (admin smoke, agencia demo con clientes, otra agencia)';
  end if;
  begin
    -- otra agencia: cliente + nota temporales (como postgres; notified_at para que nadie avise)
    insert into agency_leads (agency_id, client_name, notified_at) values (v_other, 'zz-check', now()) returning id into v_other_lead;
    insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_other_lead, v_other, 'unreal', 'zz-check other');

    -- admin (Equipo Unreal)
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_lead, v_demo, 'unreal', 'zz-check admin');
    begin
      insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_lead, v_other, 'unreal', 'zz-check');
      raise exception 'el admin colgó una nota de un cliente de la demo en otra agencia';
    exception when insufficient_privilege then null; end;

    -- agencia demo
    perform set_config('request.jwt.claims', json_build_object('sub', v_demo_user, 'role', 'authenticated')::text, true);
    if not exists (select 1 from agency_lead_notes where body = 'zz-check admin' and author = 'unreal') then
      raise exception 'la agencia no ve la nota del Equipo Unreal';
    end if;
    if exists (select 1 from agency_lead_notes where agency_id <> v_demo) then raise exception 'la agencia ve notas de otra agencia'; end if;
    begin
      insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_lead, v_demo, 'unreal', 'zz-check');
      raise exception 'la agencia escribió una nota del Equipo Unreal';
    exception when insufficient_privilege then null; end;
    begin
      insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_other_lead, v_demo, 'agency', 'zz-check');
      raise exception 'la agencia escribió en un cliente de otra agencia';
    exception when insufficient_privilege then null; end;
    begin
      insert into agency_lead_notes (lead_id, agency_id, author, body) values (v_other_lead, v_other, 'agency', 'zz-check');
      raise exception 'la agencia escribió como otra agencia';
    exception when insufficient_privilege then null; end;
    delete from agency_lead_notes where body = 'zz-check admin';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'la agencia borró una nota del Equipo Unreal'; end if;

    -- el admin borra su nota
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    delete from agency_lead_notes where body = 'zz-check admin';
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'el admin no pudo borrar su nota (% filas)', n; end if;
    execute 'reset role';
    raise exception 'zz-rollback';
  exception when raise_exception then
    if sqlerrm <> 'zz-rollback' then raise; end if;
  end;
end $$;

select 'OK' as result, (select count(*) from agency_lead_notes where body like 'zz-check%') as leftovers;
