-- Self-check de 20261106213000_admin_save_client_stale_card.sql (+ 20261106220500, paso e). Reproduce el bug del 6-nov (una ficha
-- de cliente abierta ANTES de otros cambios los revertía al guardar) sobre el cliente DEMO (App Review),
-- dentro de una transacción que SIEMPRE se deshace (rollback): no cambia datos reales ni manda correos
-- (admin_save_client no envía nada y aquí no cambia ningún email → ni siquiera llama a ensure_auth_user).
-- Correr ENTERO por la Management API. Si algo no cuadra lanza excepción (HTTP 400); si cuadra devuelve 'OK'.
-- Con el admin_save_client anterior el paso a) guardaba y revertía la pausa de correos, el teléfono y is_active.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
  'email', (select lower(trim(username)) from admin_users where is_active order by username limit 1))::text, true);

do $$
declare
  v_id uuid := (select id from clients where email = 'demo.cliente@unrealstudiobali.com');
  v_card jsonb;   -- la ficha tal como la cargó el admin al abrirla
  v_auto boolean; -- pausa de correos puesta por OTRA vía mientras la ficha seguía abierta
  r jsonb;
  c clients%rowtype;
  h_old jsonb; h_new jsonb; h_typed jsonb;
begin
  assert v_id is not null, 'no está el cliente DEMO';
  select x into v_card from jsonb_array_elements((admin_list_clients('')->'clients')::jsonb) x where x->>'id' = v_id::text;
  assert v_card ? 'updated_at', 'admin_list_clients no devuelve updated_at';

  -- Mientras la ficha está abierta: otra vía cambia la pausa de correos (su RPC) y el teléfono.
  v_auto := not (v_card->>'auto_emails_enabled')::boolean;
  perform admin_set_client_auto_emails('', v_id, v_auto);
  update clients set phone = '+00 000 stale-card-test' where id = v_id;

  -- a) UI vieja: la ficha ENTERA sin versión → rechazada sin escribir (antes: revertía todo lo de arriba).
  r := admin_save_client('', (v_card || '{"notes":"stale-card test"}')::json)::jsonb;
  assert r->>'error' = 'conflict', 'ficha entera vieja no rechazada: ' || r::text;
  select * into c from clients where id = v_id;
  assert c.auto_emails_enabled = v_auto and c.phone = '+00 000 stale-card-test' and c.notes is not distinct from v_card->>'notes',
    'la ficha vieja escribió algo';

  -- b) UI nueva: solo lo cambiado (notas) + versión cargada → se guarda y NO pisa los cambios de otros.
  r := admin_save_client('', json_build_object('id', v_id, 'expected_updated_at', v_card->'updated_at',
         'base', json_build_object('notes', v_card->'notes'), 'notes', 'stale-card test'))::jsonb;
  assert (r->>'success')::boolean, 'guardar solo notas falló: ' || r::text;
  select * into c from clients where id = v_id;
  assert c.notes = 'stale-card test', 'no guardó las notas';
  assert c.auto_emails_enabled = v_auto, 'la ficha vieja revirtió la pausa de correos';
  assert c.phone = '+00 000 stale-card-test', 'la ficha vieja revirtió el teléfono';
  assert c.status is not distinct from v_card->>'status' and c.is_active = (v_card->>'is_active')::boolean, 'tocó status/is_active';

  -- c) La misma ficha vieja cambiando el teléfono (que otro ya cambió) → conflicto ["phone"], nada escrito.
  r := admin_save_client('', json_build_object('id', v_id, 'expected_updated_at', v_card->'updated_at',
         'base', json_build_object('phone', v_card->'phone'), 'phone', '+00 typed'))::jsonb;
  assert r->>'error' = 'conflict' and r->'fields' = '["phone"]'::jsonb, 'teléfono en conflicto no rechazado: ' || r::text;
  assert (select phone from clients where id = v_id) = '+00 000 stale-card-test', 'el conflicto escribió el teléfono';

  -- d) Tras «Recargar» (versión fresca) el mismo cambio sí se guarda.
  select x into v_card from jsonb_array_elements((admin_list_clients('')->'clients')::jsonb) x where x->>'id' = v_id::text;
  r := admin_save_client('', json_build_object('id', v_id, 'expected_updated_at', v_card->'updated_at',
         'base', json_build_object('phone', v_card->'phone'), 'phone', '+00 typed'))::jsonb;
  assert (r->>'success')::boolean and (select phone from clients where id = v_id) = '+00 typed', 'tras recargar no guardó: ' || r::text;

  -- e) Con la ficha abierta, el titular cambia su contraseña del portal (client_change_password: password_hash/_plain,
  --    temp_password → null, must_change_password → false) y elige otro idioma (client_set_my_language → preferred_language).
  --    La ficha vieja cambia otro dato del titular (nombre; ya no manda idioma/teléfono si no se tocan los del 1er titular)
  --    → se guarda SIN conflicto y conserva la contraseña nueva, el idioma y el teléfono del cliente.
  h_old := jsonb_build_array(jsonb_build_object('name', 'DEMO', 'email', 'demo.cliente@unrealstudiobali.com', 'phone', '', 'lang', 'es',
             'password_plain', 'pw-old', 'password_hash', 'hash-old', 'temp_password', 'pw-old', 'must_change_password', true));
  update clients set holders = h_old where id = v_id;
  select x into v_card from jsonb_array_elements((admin_list_clients('')->'clients')::jsonb) x where x->>'id' = v_id::text;
  h_new := jsonb_build_array((h_old->0) || '{"password_hash":"hash-new","password_plain":"pw-new","temp_password":null,"must_change_password":false}'::jsonb);
  update clients set holders = h_new, preferred_language = 'ro' where id = v_id;
  h_typed := jsonb_set(h_old, '{0,name}', '"DEMO renamed"');
  r := admin_save_client('', json_build_object('id', v_id, 'expected_updated_at', v_card->'updated_at',
         'base', json_build_object('holders', v_card->'holders'), 'holders', h_typed))::jsonb;
  assert (r->>'success')::boolean, 'contraseña del titular cambiada en el portal = conflicto: ' || r::text;
  select * into c from clients where id = v_id;
  assert c.holders->0->>'name' = 'DEMO renamed', 'no guardó el nombre del titular';
  assert c.holders->0 @> '{"password_plain":"pw-new","password_hash":"hash-new","temp_password":null,"must_change_password":false}'::jsonb,
    'la ficha revirtió la contraseña del titular: ' || c.holders::text;
  assert c.preferred_language = 'ro' and c.phone = '+00 typed', 'pisó el idioma elegido en el portal o el teléfono';

  -- f) Pero si otro cambió un dato de verdad de ese titular (su teléfono), la misma ficha vieja sigue en conflicto.
  update clients set holders = jsonb_set(holders, '{0,phone}', '"+00 other"') where id = v_id;
  r := admin_save_client('', json_build_object('id', v_id, 'expected_updated_at', v_card->'updated_at',
         'base', json_build_object('holders', v_card->'holders'), 'holders', h_typed))::jsonb;
  assert r->>'error' = 'conflict' and r->'fields' = '["holders"]'::jsonb, 'titular cambiado por otro no rechazado: ' || r::text;
  assert (select holders->0->>'phone' from clients where id = v_id) = '+00 other', 'el conflicto escribió los titulares';
end $$;

select 'OK' as result;
rollback;
