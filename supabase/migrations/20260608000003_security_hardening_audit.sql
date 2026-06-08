-- Endurecimiento de seguridad tras la auditoría 2026-06-08 (aplicado en vivo).
-- 1) ensure_auth_user: NUNCA debe ser llamable desde fuera (solo internamente por
--    funciones SECURITY DEFINER como admin_save_client). Estaba expuesta a anon →
--    permitía resetear la contraseña de cualquiera (toma de control de cuentas).
revoke execute on function public.ensure_auth_user(text, text) from anon, authenticated, public;

-- 2) IDOR: las RPC de datos de cliente recibían p_client_id y lo confiaban →
--    cualquiera (incluso sin login) podía leer los datos de otro cliente.
--    Ahora DERIVAN el cliente de la sesión (auth.email()) e ignoran p_client_id,
--    y se revoca anon (exigir sesión). client_get_kwitansis ya derivaba de auth.email().
--    (Los cuerpos completos endurecidos se aplicaron en vivo; ver client_get_dashboard/
--    client_get_payments/client_get_units/client_change_password que resuelven el
--    cliente por lower(email)=lower(auth.email()).)
revoke execute on function public.client_get_dashboard(text) from anon;
revoke execute on function public.client_get_payments(text) from anon;
revoke execute on function public.client_get_units(uuid) from anon;
revoke execute on function public.client_change_password(text, text, text) from anon;
revoke execute on function public.client_get_kwitansis() from anon;
