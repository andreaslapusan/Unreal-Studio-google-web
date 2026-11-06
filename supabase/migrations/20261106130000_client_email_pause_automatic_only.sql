-- The per-client switch pauses only AUTOMATIC emails (Andreas, 6-nov-2026). Manual sends from the admin panel
-- still go out after an explicit confirmation: send-client-email skips the check only when manual === true.
comment on column public.clients.auto_emails_enabled is
  'false = pausa los correos AUTOMÁTICOS al cliente (recordatorios de pago, avisos de obra, bienvenida automática). Los envíos manuales del panel salen tras confirmación (send-client-email con manual=true)';
