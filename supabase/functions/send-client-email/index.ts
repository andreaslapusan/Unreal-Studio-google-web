/**
 * send-client-email — mailer de cliente con plantilla de marca.
 *
 * Recibe {adminUserId, to, subject, html, kwitansiId?}. Verifica que el emisor
 * sea un admin activo, envuelve el `html` (solo el CONTENIDO) en la plantilla de
 * marca Unreal (cabecera de texto "Unreal Studio" + footer compacto) y lo envía
 * por SMTP (Resend). Las llamadas pasan SOLO el contenido; la marca se añade aquí
 * UNA vez (no duplicar header/footer en el html que se pasa).
 */
// @ts-nocheck — runtime Deno, no en el tsconfig de Vite
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const BROWN = "#3F2305";
const ALMOND = "#F3E5D8";
const PORTAL = "https://unrealstudiobali.com";

// Plantilla de marca. `inner` es SOLO el contenido (h1 + párrafos + botón).
function brandWrap(subject: string, inner: string): string {
  const year = "2026";
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:${ALMOND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ALMOND};padding:28px 16px;">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
   <!-- Cabecera: marca -->
   <tr><td align="center" style="padding:8px 0 22px;">
     <span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN};letter-spacing:.3px;">Unreal Studio</span>
   </td></tr>
   <!-- Tarjeta de contenido -->
   <tr><td style="background:#ffffff;border-radius:18px;padding:34px 32px;font-family:Manrope,Arial,sans-serif;color:${BROWN};">
     ${inner}
   </td></tr>
   <!-- Footer compacto (no una torre de texto): marca + 1 línea de contacto + 1 línea legal -->
   <tr><td align="center" style="padding:22px 24px 6px;font-family:Manrope,Arial,sans-serif;">
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="border-top:1px solid rgba(63,35,5,.14);font-size:0;line-height:0;">&nbsp;</td></tr>
     </table>
     <div style="font-family:'DM Serif Display',Georgia,serif;font-size:16px;color:${BROWN};margin:16px 0 4px;">Unreal Studio</div>
     <div style="font-size:12px;color:rgba(63,35,5,.6);line-height:1.7;">
       Bali, Indonesia &nbsp;·&nbsp; <a href="mailto:hello@unrealstudiobali.com" style="color:${BROWN};text-decoration:none;font-weight:600;">hello@unrealstudiobali.com</a> &nbsp;·&nbsp; <a href="${PORTAL}" style="color:${BROWN};text-decoration:none;">unrealstudiobali.com</a>
     </div>
     <div style="font-size:10px;color:rgba(63,35,5,.38);line-height:1.7;margin-top:10px;">
       Correo de solo envío · no respondas a este mensaje. Para cambiar el idioma, entra en tu portal de cliente.<br>© ${year} Unreal Studio · Bali
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  let p: { adminUserId?: string; to?: string; subject?: string; html?: string; kwitansiId?: string };
  try { p = await req.json(); } catch { return json({ success: false, error: "Bad JSON" }, 400); }
  if (!p.adminUserId || !p.to || !p.subject || !p.html) {
    return json({ success: false, error: "adminUserId, to, subject, html required" }, 400);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: admin } = await supabase
    .from("admin_users").select("id").eq("id", p.adminUserId).eq("is_active", true).maybeSingle();
  if (!admin) return json({ success: false, error: "Unauthorized" }, 401);

  const host = Deno.env.get("SMTP_HOST");
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) return json({ success: false, error: "transport_not_configured" }, 503);
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? "Unreal Studio <no.reply@unrealstudiobali.com>";

  const client = new SMTPClient({
    connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } },
  });
  try {
    await client.send({
      from,
      to: p.to,
      replyTo: "hello@unrealstudiobali.com",
      subject: p.subject,
      html: brandWrap(p.subject, p.html),
    });
  } catch (e) {
    try { await client.close(); } catch { /* ignore */ }
    return json({ success: false, error: String(e) }, 502);
  }
  try { await client.close(); } catch { /* ignore */ }

  if (p.kwitansiId) {
    await supabase.rpc("admin_mark_kwitansi_sent", { p_user_id: p.adminUserId, p_id: p.kwitansiId, p_email: p.to });
  }
  return json({ success: true });
});
