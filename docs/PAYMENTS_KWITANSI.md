# Pagos de cliente + Kwitansi (Fase 3/4)

Automatiza el seguimiento de pagos del cliente, el **recordatorio automático 7 días
antes** (con update de obra) y el **envío manual de kwitansi** desde el admin.

## Piezas

| Capa | Archivo | Qué hace |
|------|---------|----------|
| DB | `supabase/migrations/20260607000001_client_payments.sql` | tabla `client_payments` + RPCs (ya aplicada en prod) |
| DB | `supabase/migrations/20260607000002_kwitansi_and_reminders.sql` | tabla `kwitansis`, RPCs de kwitansi y `payment_reminders_due()` (aplicada en prod) |
| Front admin | `components/admin/ClientPaymentsPanel.tsx` | calendario de pagos por cliente (alta/edita/borra, check "recibido") + botón **Enviar kwitansi** (preview, descargar/imprimir, crear y enviar) |
| Front admin | botón 💳 en cada tarjeta de cliente (`pages/AdminDashboard.tsx`) | abre el panel |
| Front cliente | `components/ClientPaymentsSection.tsx` (en `ClientDashboard.tsx`) | calendario de pagos read-only; fecha = límite para que Unreal **reciba** |
| Generador | `lib/kwitansi.ts` | HTML del recibo igual al modelo (No / Telah terima dari / Uang sejumlah (terbilang) / Untuk pembayaran / Rp), colores Unreal |
| Email | `supabase/functions/send-client-email` | mailer genérico (lo usa el botón de kwitansi) |
| Cron | `supabase/functions/payment-reminders` | diario: paga que vence en 7 días, no recibida, no avisada → email recordatorio + update de obra; marca `reminder_sent_at` (idempotente) |
| Transporte | `supabase/functions/_shared/smtp.ts` | SMTP por env, desde `hello@unrealstudiobali.com` |

## Deploy

1. **Migraciones**: ya aplicadas en prod (`rnielxgackkshnatvagj`). Quedan versionadas en el repo.
2. **Edge functions**:
   ```bash
   supabase functions deploy send-client-email
   supabase functions deploy payment-reminders
   ```
3. **Secrets** (cuando Andreas dé la contraseña del buzón `hello@`, por canal seguro, NO por chat):
   ```bash
   supabase secrets set \
     SMTP_HOST=smtp.ionos.com SMTP_PORT=465 \
     SMTP_USER=hello@unrealstudiobali.com SMTP_PASS='<app-password>' \
     MAIL_FROM='Unreal Studio <hello@unrealstudiobali.com>' \
     PORTAL_BASE=https://unrealstudiobali.com CRON_SECRET='<aleatorio>'
   ```
   Sin estos secrets, los envíos devuelven `transport_not_configured` (no rompen nada).
4. **Programar el cron** (diario, p.ej. 09:00 Bali). Con pg_cron + pg_net:
   ```sql
   select cron.schedule('payment-reminders-daily', '0 1 * * *', $$  -- 01:00 UTC = 09:00 WITA
     select net.http_post(
       url := 'https://rnielxgackkshnatvagj.supabase.co/functions/v1/payment-reminders',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
     ); $$);
   ```
   (o un workflow n8n con un nodo Cron que llame a la función con el header `x-cron-secret`).

## Notas
- El recordatorio enmarca la fecha como **límite para recibir** (no para enviar) y sugiere
  iniciar la transferencia con margen.
- El update de obra del email sale del último `field_reports` del proyecto + `completion_percent`.
- La kwitansi se numera sola (secuencial) y se archiva en `kwitansis` (con HTML) al crearla.
