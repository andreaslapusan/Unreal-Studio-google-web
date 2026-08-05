-- Endurecimiento RLS: evitar que un empleado se auto-apruebe una vacación.
--
-- La política ev_update_owner permite al dueño editar su solicitud mientras está
-- 'pendiente' (USING: employee_email = app_email() AND status = 'pendiente'), pero
-- su WITH CHECK original solo validaba el email del NEW row, no el status. Eso
-- dejaba que un empleado, con un UPDATE directo desde el navegador (fuera de la UI),
-- pusiera status='aprobada' en su propia solicitud pendiente y se auto-aprobara.
-- La aprobación es exclusiva de admin/team (política ev_update_admin), así que
-- el dueño nunca debe poder cambiar el status: se re-valida 'pendiente' en el CHECK.
alter policy ev_update_owner on employee_vacations
  with check (employee_email = app_email() and status = 'pendiente');
