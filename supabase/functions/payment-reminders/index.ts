/**
 * payment-reminders — cron diario. Secuencia de recordatorios de pago por cada
 * pago no recibido, en hora de Bali (UTC+8):
 *   · 7 días antes  (b7)
 *   · 2 días antes  (b2)
 *   · el día del vencimiento (due)
 *   · 3 días después (a3) — invita a contactar al equipo para evitar penalizaciones
 *   · 7, 14, 21… días después (a7, a14…) — cada 7 días hasta que se marque pagado
 *
 * Cada etapa se envía UNA vez: se registra en client_payments.reminder_stages_sent.
 * Solo a clientes con email real (no "@pendiente."). Protegido por service-role
 * o CRON_SECRET.
 */
// @ts-nocheck — runtime Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const FROM_DEFAULT = "Unreal Studio <no.reply@unrealstudiobali.com>";
const PORTAL_BASE = Deno.env.get("PORTAL_BASE") ?? "https://unrealstudiobali.com";
const BALI_TZ = "Asia/Makassar";

function smtpConfigured(): boolean {
  return Boolean(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS"));
}
async function sendMail(msg: { to: string; subject: string; html: string }): Promise<void> {
  const host = Deno.env.get("SMTP_HOST"); const user = Deno.env.get("SMTP_USER"); const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) throw new Error("SMTP not configured");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? FROM_DEFAULT;
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from, to: msg.to, replyTo: "hello@unrealstudiobali.com", subject: msg.subject, html: msg.html });
  } finally { await client.close(); }
}

const fmtMoney = (n: number, c: string) => {
  try { return new Intl.NumberFormat(c === "IDR" ? "id-ID" : "es-ES", { style: "currency", currency: c || "IDR", maximumFractionDigits: 0, useGrouping: "always" }).format(n); }
  catch { return `${c} ${n}`; }
};
const fmtDate = (s: string) => {
  try { return new Date(s + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return s; }
};
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function baliToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BALI_TZ }); // YYYY-MM-DD
}
function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd + "T12:00:00Z") - Date.parse(fromYmd + "T12:00:00Z")) / 86400000);
}

// Devuelve la etapa aplicable hoy (o null) y los textos correspondientes.
function stageFor(daysUntil: number): { key: string; subject: string; lead: string; when: string; tone: "calm" | "alert" } | null {
  const plural = (n: number, s: string, p: string) => (Math.abs(n) === 1 ? s : p);
  if (daysUntil === 7) return { key: "b7", subject: "Tu próximo pago vence en 7 días", lead: "Te recordamos que se acerca la fecha límite de tu próximo pago.", when: "Quedan 7 días para la fecha límite.", tone: "calm" };
  if (daysUntil === 2) return { key: "b2", subject: "Tu próximo pago vence en 2 días", lead: "Tu próximo pago está muy próximo a su fecha límite.", when: "Quedan 2 días para la fecha límite.", tone: "calm" };
  if (daysUntil === 0) return { key: "due", subject: "Tu pago vence hoy", lead: "Hoy es la fecha límite para que el importe quede recibido por Unreal Studio. Si tienes cualquier dificultad para completarlo, ponte en contacto con nuestro equipo cuanto antes para que podamos ayudarte y evitar posibles penalizaciones por demora.", when: "La fecha límite es hoy.", tone: "alert" };
  if (daysUntil === -3) return { key: "a3", subject: "Tu pago ha vencido — estamos para ayudarte", lead: "Tu pago venció hace 3 días y aún no nos consta recibido. Si tienes cualquier dificultad o duda, por favor ponte en contacto con nuestro equipo cuanto antes; te ayudaremos a regularizarlo y a evitar posibles penalizaciones por demora.", when: "Lleva 3 días de retraso.", tone: "alert" };
  if (daysUntil <= -7 && Math.abs(daysUntil) % 7 === 0) {
    const n = Math.abs(daysUntil);
    return { key: `a${n}`, subject: `Tu pago lleva ${n} días vencido`, lead: `Tu pago lleva ${n} ${plural(n, "día", "días")} vencido y aún no nos consta recibido. Te pedimos que regularices la situación lo antes posible. Si necesitas ayuda, escríbenos y lo resolvemos juntos.`, when: `Lleva ${n} días de retraso.`, tone: "alert" };
  }
  return null;
}

function reminderHtml(r: any, st: ReturnType<typeof stageFor>): string {
  const unit = r.unit_number ? ` · Unidad ${esc(r.unit_number)}` : "";
  const name = esc(r.client_name || "");
  const alert = st!.tone === "alert";
  const obra = (typeof r.completion_percent === "number" || r.construction_update_url)
    ? `
    <div style="background:#fff;border:1px solid rgba(63,35,5,.12);border-radius:12px;padding:18px 20px;margin:18px 0">
      <div style="font-size:11px;letter-spacing:1.5px;color:rgba(63,35,5,.5);text-transform:uppercase;margin-bottom:8px">Avance de obra</div>
      ${typeof r.completion_percent === "number" ? `
      <div style="font-size:13px;margin-bottom:8px">Progreso de construcción: <b>${r.completion_percent}%</b></div>
      <div style="height:8px;background:rgba(63,35,5,.1);border-radius:99px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:${Math.max(0, Math.min(100, r.completion_percent))}%;background:#3F2305"></div></div>` : ""}
      ${r.construction_update_url ? `<div style="margin-top:12px"><a href="${esc(r.construction_update_url)}" style="color:#3F2305;font-weight:700;font-size:13px">Ver las últimas fotos de obra →</a></div>` : ""}
    </div>` : "";

  return `
<div style="max-width:600px;margin:0 auto;background:#F3E5D8;padding:30px;font-family:Manrope,Arial,sans-serif;color:#3F2305">
  <div style="text-align:center;margin-bottom:22px">
    <div style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;color:#3F2305;letter-spacing:.3px">Unreal Studio</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:13px;color:rgba(63,35,5,.55);margin-top:2px">Beyond the Ordinary, Inside the Unreal</div>
  </div>
  <div style="background:#fff;border-radius:16px;padding:32px 30px">
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:23px;margin:0 0 10px">Hola ${name},</h1>
    <p style="font-size:15px;line-height:1.7;color:rgba(63,35,5,.85);margin:0 0 6px">
      ${st!.lead}
    </p>
    <p style="font-size:15px;line-height:1.7;color:rgba(63,35,5,.85);margin:0 0 4px">
      Pago correspondiente a <b>${esc(r.project_name || "tu proyecto")}${unit}</b>${r.payment_label ? ` — ${esc(r.payment_label)}` : ""}.
    </p>

    <div style="background:${alert ? "#fbeaea" : "#F3E5D8"};border-radius:12px;padding:18px 20px;margin:20px 0;text-align:center">
      <div style="font-size:12px;letter-spacing:1px;color:rgba(63,35,5,.6);text-transform:uppercase">${esc(r.payment_label || "Pago")}</div>
      <div style="font-size:30px;font-weight:800;margin:6px 0">${fmtMoney(Number(r.amount), r.currency || "IDR")}</div>
      <div style="font-size:13px;color:rgba(63,35,5,.7)">Fecha límite para que el importe sea recibido por Unreal Studio:</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${fmtDate(r.due_date)}</div>
      <div style="font-size:13px;font-weight:700;margin-top:8px;color:${alert ? "#c0392b" : "#3F2305"}">${st!.when}</div>
    </div>

    <p style="font-size:13px;line-height:1.6;color:rgba(63,35,5,.7);margin:0 0 4px">
      Por los tiempos de las transferencias internacionales, te recomendamos iniciar el pago con varios días de margen para que llegue a tiempo. Si ya lo has realizado, puedes ignorar este mensaje. ¡Gracias!
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
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data, error } = await supabase.rpc("payment_reminders_candidates");
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  const candidates: any[] = data?.payments ?? [];

  if (!smtpConfigured()) {
    return new Response(JSON.stringify({ success: false, error: "transport_not_configured", candidates: candidates.length }), { status: 503 });
  }

  const today = baliToday();
  let sent = 0; const failed: string[] = [];
  for (const r of candidates) {
    const daysUntil = daysBetween(today, String(r.due_date).slice(0, 10));
    const st = stageFor(daysUntil);
    if (!st) continue;
    const already: string[] = r.reminder_stages_sent || [];
    if (already.includes(st.key)) continue;
    try {
      await sendMail({ to: r.client_email, subject: `${st.subject} · Unreal Studio`, html: reminderHtml(r, st) });
      await supabase.rpc("payment_reminder_mark_stage", { p_payment_id: r.payment_id, p_stage: st.key });
      sent++;
    } catch (e) {
      failed.push(`${r.payment_id}: ${String(e)}`);
    }
  }
  return new Response(JSON.stringify({ success: true, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
