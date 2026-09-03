-- Autoservicio de vacaciones del empleado (portal Empleados) + candado anti-solape.
--
-- Contexto: `employee_vacations` la lee/escribe el empleado desde su portal. El
-- gating de identidad va por app_email() (email real de la sesión, del JWT:
-- real_email del metadata o auth.email()), NO por un id que envíe el cliente
-- (no forjable). El admin aprueba/rechaza en components/admin/VacationManager.tsx
-- (política ev_update_admin, exclusiva de admin/team).
--
-- Tres RPC SECURITY DEFINER — TODA la lógica se valida en servidor, la UI solo
-- da feedback:
--   1) employee_request_vacation  → crear solicitud (rechaza si SE SOLAPA con otra
--      del mismo empleado; excluye las rechazadas).
--   2) employee_update_vacation   → editar fechas/tipo/nota de una PROPIA solicitud
--      (excluye la propia y las rechazadas del chequeo de solape); si estaba
--      'aprobada' vuelve a 'pendiente' (re-aprobación admin).
--   3) employee_cancel_vacation   → borrar una PROPIA solicitud.
--
-- Regla de solape (dos rangos [a1,a2] y [b1,b2] se solapan si a1<=b2 y a2>=b1):
--     nueva.start <= otra.end  AND  nueva.end >= otra.start

-- 1) CREAR ------------------------------------------------------------------
create or replace function public.employee_request_vacation(
  p_start_date date,
  p_end_date   date,
  p_type       text,
  p_note       text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_type  text;
  v_id    uuid;
begin
  v_email := app_email();
  if v_email is null then
    return json_build_object('success', false, 'error', 'no session');
  end if;

  if p_start_date is null or p_end_date is null then
    return json_build_object('success', false, 'error', 'dates required');
  end if;
  if p_end_date < p_start_date then
    return json_build_object('success', false, 'error', 'end before start');
  end if;

  -- Normalizar tipo a los valores conocidos; por defecto 'vacaciones'.
  v_type := case lower(coalesce(p_type, ''))
              when 'baja' then 'baja'
              when 'personal' then 'personal'
              else 'vacaciones'
            end;

  -- Candado anti-solape: otra solicitud del MISMO empleado que pise estas fechas
  -- (excluidas las rechazadas).
  if exists (
    select 1 from employee_vacations v
    where lower(v.employee_email) = v_email
      and v.status <> 'rechazada'
      and p_start_date <= v.end_date
      and p_end_date   >= v.start_date
  ) then
    return json_build_object('success', false, 'error', 'overlap');
  end if;

  insert into employee_vacations(
    employee_id, employee_email, employee_name, start_date, end_date, type, status, note
  )
  select e.id, v_email, coalesce(e.full_name, v_email), p_start_date, p_end_date, v_type, 'pendiente',
         nullif(btrim(coalesce(p_note, '')), '')
  from (select id, full_name from employees where lower(email) = v_email and active = true limit 1) e
  returning id into v_id;

  -- Si no había fila de empleado (aún sin registro en `employees`), insertar igual
  -- con el email de sesión como identidad.
  if v_id is null then
    insert into employee_vacations(
      employee_id, employee_email, employee_name, start_date, end_date, type, status, note
    ) values (
      null, v_email, v_email, p_start_date, p_end_date, v_type, 'pendiente',
      nullif(btrim(coalesce(p_note, '')), '')
    )
    returning id into v_id;
  end if;

  return json_build_object('success', true, 'id', v_id);
end;
$$;

-- 2) EDITAR -----------------------------------------------------------------
create or replace function public.employee_update_vacation(
  p_id         uuid,
  p_start_date date,
  p_end_date   date,
  p_type       text,
  p_note       text default null
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_type  text;
  v_row   employee_vacations%rowtype;
  v_new_status text;
begin
  v_email := app_email();
  if v_email is null then
    return json_build_object('success', false, 'error', 'no session');
  end if;

  -- Solo su PROPIA solicitud (gating por email de sesión, no por el id que envía).
  select * into v_row from employee_vacations
   where id = p_id and lower(employee_email) = v_email
   limit 1;
  if v_row.id is null then
    return json_build_object('success', false, 'error', 'not found or not yours');
  end if;

  if p_start_date is null or p_end_date is null then
    return json_build_object('success', false, 'error', 'dates required');
  end if;
  if p_end_date < p_start_date then
    return json_build_object('success', false, 'error', 'end before start');
  end if;

  v_type := case lower(coalesce(p_type, ''))
              when 'baja' then 'baja'
              when 'personal' then 'personal'
              else 'vacaciones'
            end;

  -- Candado anti-solape excluyendo la propia fila y las rechazadas.
  if exists (
    select 1 from employee_vacations v
    where lower(v.employee_email) = v_email
      and v.id <> p_id
      and v.status <> 'rechazada'
      and p_start_date <= v.end_date
      and p_end_date   >= v.start_date
  ) then
    return json_build_object('success', false, 'error', 'overlap');
  end if;

  -- Si estaba aprobada y la edita, vuelve a pendiente (re-aprobación admin).
  -- Si estaba rechazada, al reeditarla vuelve a pendiente también.
  v_new_status := case when v_row.status in ('aprobada', 'rechazada') then 'pendiente' else v_row.status end;

  update employee_vacations
     set start_date = p_start_date,
         end_date   = p_end_date,
         type       = v_type,
         note       = nullif(btrim(coalesce(p_note, '')), ''),
         status     = v_new_status
   where id = p_id;

  return json_build_object('success', true, 'status', v_new_status);
end;
$$;

-- 3) CANCELAR (borrar) ------------------------------------------------------
create or replace function public.employee_cancel_vacation(
  p_id uuid
) returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_count int;
begin
  v_email := app_email();
  if v_email is null then
    return json_build_object('success', false, 'error', 'no session');
  end if;

  delete from employee_vacations
   where id = p_id and lower(employee_email) = v_email;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return json_build_object('success', false, 'error', 'not found or not yours');
  end if;
  return json_build_object('success', true);
end;
$$;

-- Permisos: los portales usan la clave anon con sesión Supabase Auth (rol
-- authenticated). El SECURITY DEFINER hace el trabajo; concedemos EXECUTE.
grant execute on function public.employee_request_vacation(date, date, text, text) to anon, authenticated;
grant execute on function public.employee_update_vacation(uuid, date, date, text, text) to anon, authenticated;
grant execute on function public.employee_cancel_vacation(uuid) to anon, authenticated;
