// @ts-nocheck — runtime Deno
//
// notify-report — avisa por email a los clientes asignados a un proyecto cuando
// se sube un REPORTE DE OBRA. Lo dispara la RPC employee_post_construction_report
// vía net.http_post (fire-and-forget) con { project_id, report_date }.
//
// Un cliente con 2 propiedades recibe un email por cada reporte (uno por
// propiedad), porque el aviso va por proyecto.
//
// ⚠️ INTERRUPTOR DE SEGURIDAD: solo envía de verdad si el secret
// REPORT_NOTIFY_ENABLED == "true". Mientras esté apagado, NO manda nada a
// clientes (respeta el "no enviar a clientes hasta el super OK de Andreas");
// devuelve cuántos avisaría. Para activarlo: set secret REPORT_NOTIFY_ENABLED=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const BROWN = "#3F2305"; const ALMOND = "#F3E5D8";

// Segmento del portal de CLIENTE por idioma (homogéneo con la web).
const CLIENT_SEG = { es: "clientes", en: "clients", ro: "clienti", id: "klien" };
const LANGS = ["es", "en", "ro", "id"];

const TR = {
  es: { subject: "Nuevo reporte de obra disponible · {project}", hi: "Hola {name},", body: "Ya está disponible un nuevo reporte de obra de tu propiedad en {project}. Puedes consultarlo y descargarlo desde tu portal de cliente.", unit: "Propiedad: {unit}", cta: "Ver mi reporte", footer: "¿Dudas? Responde a este correo: hello@unrealstudiobali.com" },
  en: { subject: "New construction report available · {project}", hi: "Hello {name},", body: "A new construction report for your property at {project} is now available. You can view and download it from your client portal.", unit: "Property: {unit}", cta: "View my report", footer: "Questions? Just reply to this email: hello@unrealstudiobali.com" },
  ro: { subject: "Nou raport de construcție disponibil · {project}", hi: "Bună {name},", body: "Un nou raport de construcție pentru proprietatea ta din {project} este acum disponibil. Îl poți vedea și descărca din portalul tău de client.", unit: "Proprietate: {unit}", cta: "Vezi raportul meu", footer: "Întrebări? Răspunde la acest e-mail: hello@unrealstudiobali.com" },
  id: { subject: "Laporan konstruksi baru tersedia · {project}", hi: "Halo {name},", body: "Laporan konstruksi baru untuk properti Anda di {project} kini tersedia. Anda dapat melihat dan mengunduhnya dari portal klien Anda.", unit: "Properti: {unit}", cta: "Lihat laporan saya", footer: "Ada pertanyaan? Balas saja email ini: hello@unrealstudiobali.com" },
};
function tr(lang, key, vars = {}) {
  const L = (lang || "es").slice(0, 2);
  let s = (TR[L] && TR[L][key]) || TR.es[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll("{" + k + "}", v);
  return s;
}
function brandWrap(subject, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,300&family=DM+Serif+Display&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet"><title>${subject}</title></head><body style="margin:0;padding:0;background:${ALMOND};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ALMOND};padding:28px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:8px 0 2px;"><span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN};">Unreal Studio Bali</span></td></tr><tr><td align="center" style="padding:0 0 20px;"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:14px;color:rgba(63,35,5,.55);">Beyond the Ordinary, Inside the Unreal</span></td></tr><tr><td style="background:#fff;border-radius:18px;padding:34px 32px;font-family:Manrope,Arial,sans-serif;color:${BROWN};">${String(inner).replace(/>\s+</g,"><").replace(/<p style="(?![^"]*text-align)/g,'<p style="text-align:justify;').trim()}</td></tr><tr><td align="center" style="padding:20px 24px 6px;font-family:Manrope,Arial,sans-serif;"><div style="font-size:12px;color:rgba(63,35,5,.55);">Bali, Indonesia &nbsp;·&nbsp; <a href="mailto:hello@unrealstudiobali.com" style="color:${BROWN};text-decoration:none;font-weight:600;">hello@unrealstudiobali.com</a></div><div style="font-size:10px;color:rgba(63,35,5,.4);line-height:1.8;margin-top:10px;">© 2026 Unreal Studio · Bali</div></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  let p; try { p = await req.json(); } catch { return json({ success: false, error: "Bad JSON" }, 400); }
  const projectId = String(p.project_id || "").trim();
  if (!projectId) return json({ success: false, error: "project_id required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: proj } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  const projectName = proj?.name || "tu proyecto";

  // Clientes asignados a ese proyecto (cada asignación = una propiedad).
  const { data: cps } = await supabase
    .from("client_projects")
    .select("unit_number, clients(name,email,preferred_language,status,is_active)")
    .eq("project_id", projectId);
  const recipients = (cps || [])
    // Solo clientes ACTIVOS: nunca avisar a DRAFT ni a INACTIVOS.
    .filter((r) => {
      const eff = r.clients?.status || (r.clients?.is_active === false ? "inactive" : "active");
      return eff === "active";
    })
    .map((r) => ({ name: r.clients?.name || "", email: (r.clients?.email || "").trim(), lang: r.clients?.preferred_language || "es", unit: r.unit_number }))
    .filter((c) => c.email && c.email.includes("@"));

  // Interruptor de seguridad: si está apagado, no envía (solo informa).
  const enabled = String(Deno.env.get("REPORT_NOTIFY_ENABLED") || "").toLowerCase() === "true";
  if (!enabled) return json({ success: true, skipped: true, reason: "REPORT_NOTIFY_ENABLED!=true", would_notify: recipients.length, project: projectName });

  const host = Deno.env.get("SMTP_HOST"), user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) return json({ success: false, error: "transport_not_configured" }, 503);
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? "Unreal Studio <no.reply@unrealstudiobali.com>";

  // Anti-spam: List-Unsubscribe + versión texto-plano.
  const UNSUB = { "List-Unsubscribe": "<mailto:hello@unrealstudiobali.com?subject=unsubscribe>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const toText = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

  let sent = 0; const errors = [];
  for (const c of recipients) {
    const L = LANGS.includes((c.lang || "es").slice(0, 2)) ? (c.lang || "es").slice(0, 2) : "es";
    const portalUrl = `https://unrealstudiobali.com/${L}/${CLIENT_SEG[L]}`;
    const subject = tr(L, "subject", { project: projectName });
    const inner = [
      `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;font-weight:700;margin:0 0 14px;color:${BROWN};">${subject}</h1>`,
      `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN};">${tr(L, "hi", { name: (c.name || "").trim() })}</p>`,
      `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN};">${tr(L, "body", { project: projectName })}</p>`,
      c.unit ? `<p style="font-size:13px;line-height:1.6;margin:0 0 16px;color:rgba(63,35,5,.7);">${tr(L, "unit", { unit: c.unit })}</p>` : "",
      `<p style="text-align:center;margin:8px 0 4px;"><a href="${portalUrl}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:14px;">${tr(L, "cta")}</a></p>`,
      `<p style="font-size:12px;line-height:1.6;color:rgba(63,35,5,.55);margin:18px 0 0;">${tr(L, "footer")}</p>`,
    ].join("");
    const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
    try {
      await client.send({ from, to: c.email, replyTo: "hello@unrealstudiobali.com", subject, content: toText(inner) || subject, html: brandWrap(subject, inner).trim(), headers: UNSUB });
      sent++;
    } catch (e) { errors.push(String(e?.message || e)); }
    finally { try { await client.close(); } catch { /* ignore */ } }
  }
  return json({ success: true, sent, total: recipients.length, errors: errors.slice(0, 3) });
});
