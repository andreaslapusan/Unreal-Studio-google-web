/**
 * payment-reminders — scheduled (cron) job. Run daily.
 *
 * Finds client payments due in exactly 7 days that are not yet received and not
 * yet reminded, then emails each client a gentle reminder from
 * hello@unrealstudiobali.com. The email frames the due date as the deadline for
 * Unreal to RECEIVE the funds, and includes the latest obra (construction)
 * update for that unit's project so the message doubles as a progress note.
 *
 * Idempotent: stamps client_payments.reminder_sent_at after a successful send,
 * so re-runs never double-mail. Schedule via pg_cron / Supabase scheduled
 * functions (see supabase/functions/payment-reminders/README in deploy notes).
 *
 * Invoke protection: requires either the service-role bearer token or a
 * matching CRON_SECRET header — it must not be publicly triggerable.
 */
// @ts-nocheck — Deno runtime types not in the Vite tsconfig
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const FROM_DEFAULT = "Unreal Studio <no.reply@unrealstudiobali.com>";
function smtpConfigured(): boolean {
  return Boolean(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}
async function sendMail(msg: { to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
  const host = Deno.env.get("SMTP_HOST"); const user = Deno.env.get("SMTP_USER"); const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) throw new Error("SMTP not configured");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? FROM_DEFAULT;
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from, to: msg.to, replyTo: msg.replyTo ?? "hello@unrealstudiobali.com", subject: msg.subject, html: msg.html });
  } finally { await client.close(); }
}

const PORTAL_BASE = Deno.env.get("PORTAL_BASE") ?? "https://unrealstudiobali.com";
const DAYS_BEFORE = Number(Deno.env.get("REMINDER_DAYS_BEFORE") ?? "7");

const fmtMoney = (n: number, c: string) => {
  try {
    return new Intl.NumberFormat(c === "IDR" ? "id-ID" : "es-ES",
      { style: "currency", currency: c || "IDR", maximumFractionDigits: 0, useGrouping: "always" }).format(n);
  } catch { return `${c} ${n}`; }
};
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return s; }
};
const esc = (s: string) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function reminderHtml(r: any): string {
  const logo = `${PORTAL_BASE}/img/Logos/logo-06.png`;
  const unit = r.unit_number ? ` · Unidad ${esc(r.unit_number)}` : "";
  const obra = (r.last_report_comment || typeof r.completion_percent === "number" || r.construction_update_url)
    ? `
    <div style="background:#fff;border:1px solid rgba(63,35,5,.12);border-radius:12px;padding:18px 20px;margin:18px 0">
      <div style="font-size:11px;letter-spacing:1.5px;color:rgba(63,35,5,.5);text-transform:uppercase;margin-bottom:8px">Avance de obra</div>
      ${typeof r.completion_percent === "number" ? `
      <div style="font-size:13px;margin-bottom:8px">Progreso de construcción: <b>${r.completion_percent}%</b></div>
      <div style="height:8px;background:rgba(63,35,5,.1);border-radius:99px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:${Math.max(0, Math.min(100, r.completion_percent))}%;background:#3F2305"></div></div>` : ""}
      ${r.last_report_comment ? `<div style="font-size:14px;line-height:1.6;color:#3F2305">“${esc(r.last_report_comment)}”</div>` : ""}
      ${r.construction_update_url ? `<div style="margin-top:12px"><a href="${esc(r.construction_update_url)}" style="color:#3F2305;font-weight:700;font-size:13px">Ver últimas fotos de obra →</a></div>` : ""}
    </div>` : "";

  return `
<div style="max-width:600px;margin:0 auto;background:#F3E5D8;padding:30px;font-family:Manrope,Arial,sans-serif;color:#3F2305">
  <div style="text-align:center;margin-bottom:22px">
    <div style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;color:#3F2305;letter-spacing:.3px">Unreal Studio</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:13px;color:rgba(63,35,5,.55);margin-top:2px">Beyond the Ordinary, Inside the Unreal</div>
  </div>
  <div style="background:#fff;border-radius:16px;padding:32px 30px">
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;margin:0 0 6px">Hola ${esc(r.client_name || "")},</h1>
    <p style="font-size:15px;line-height:1.7;color:rgba(63,35,5,.85);margin:0 0 4px">
      Te escribimos como recordatorio amable de tu próximo pago para
      <b>${esc(r.project_name || "tu proyecto")}${unit}</b>.
    </p>

    <div style="background:#F3E5D8;border-radius:12px;padding:18px 20px;margin:20px 0;text-align:center">
      <div style="font-size:12px;letter-spacing:1px;color:rgba(63,35,5,.6);text-transform:uppercase">${esc(r.payment_label || "Pago")}</div>
      <div style="font-size:30px;font-weight:800;margin:6px 0">${fmtMoney(Number(r.amount), r.currency || "IDR")}</div>
      <div style="font-size:13px;color:rgba(63,35,5,.7)">Fecha límite para que el importe esté <b>recibido</b> por Unreal Studio:</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${fmtDate(r.due_date)}</div>
    </div>

    <p style="font-size:13px;line-height:1.6;color:rgba(63,35,5,.7);margin:0 0 4px">
      Ten en cuenta que, por los tiempos de las transferencias internacionales,
      conviene iniciar el pago con unos días de margen para que llegue a tiempo.
      Si ya lo has realizado, ignora este mensaje — ¡gracias!
    </p>

    ${obra}

    <div style="text-align:center;margin-top:26px">
      <a href="${PORTAL_BASE}/cliente" style="display:inline-block;background:#3F2305;color:#fff;text-decoration:none;padding:13px 28px;border-radius:99px;font-weight:700;font-size:14px">Ver mi portal</a>
    </div>
  </div>
  <div style="text-align:center;font-size:11px;color:rgba(63,35,5,.5);margin-top:16px">
    Unreal Studio · Bali, Indonesia<br>¿Dudas? Responde a este correo: hello@unrealstudiobali.com
  </div>
</div>`.trim();
}

function authorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (svc && auth === `Bearer ${svc}`) return true;
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("payment_reminders_due", { p_days_before: DAYS_BEFORE });
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });

  const due: any[] = data?.payments ?? [];
  if (!due.length) return new Response(JSON.stringify({ success: true, sent: 0, note: "none due" }), { headers: { "Content-Type": "application/json" } });

  if (!smtpConfigured()) {
    return new Response(JSON.stringify({ success: false, error: "transport_not_configured", due: due.length }), { status: 503 });
  }

  let sent = 0; const failed: string[] = [];
  for (const r of due) {
    try {
      await sendMail({
        to: r.client_email,
        subject: `Recordatorio de pago · ${r.project_name ?? "Unreal Studio"} (vence ${fmtDate(r.due_date)})`,
        html: reminderHtml(r),
      });
      await supabase.from("client_payments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.payment_id);
      sent++;
    } catch (e) {
      failed.push(`${r.payment_id}: ${String(e)}`);
    }
  }
  return new Response(JSON.stringify({ success: true, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
