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

// Iconos de redes como SVG inline (los clientes tipo Apple Mail los renderizan).
const IG_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${BROWN}" style="vertical-align:middle"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`;
const WA_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${BROWN}" style="vertical-align:middle"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

// Plantilla de marca. `inner` es SOLO el contenido (h1 + párrafos + botón).
function brandWrap(subject: string, inner: string): string {
  const year = "2026";
  return `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,300&family=DM+Serif+Display&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:${ALMOND};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ALMOND};padding:28px 16px;">
 <tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
   <!-- Cabecera: marca + lema -->
   <tr><td align="center" style="padding:8px 0 2px;">
     <span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN};letter-spacing:.3px;">Unreal Studio</span>
   </td></tr>
   <tr><td align="center" style="padding:0 0 22px;">
     <span style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:14px;color:rgba(63,35,5,.55);">Beyond the Ordinary, Inside the Unreal</span>
   </td></tr>
   <!-- Tarjeta de contenido -->
   <tr><td style="background:#ffffff;border-radius:18px;padding:34px 32px;font-family:Manrope,Arial,sans-serif;color:${BROWN};">
     ${inner}
   </td></tr>
   <!-- Footer ligero: iconos de redes + 1 línea de contacto + legal mínimo -->
   <tr><td align="center" style="padding:20px 24px 6px;font-family:Manrope,Arial,sans-serif;">
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="border-top:1px solid rgba(63,35,5,.14);font-size:0;line-height:0;">&nbsp;</td></tr>
     </table>
     <div style="margin:16px 0 12px;">
       <a href="https://instagram.com/unrealstudiobali" style="text-decoration:none;display:inline-block;margin:0 6px;">${IG_ICON}</a>
     </div>
     <div style="font-size:12px;color:rgba(63,35,5,.55);">
       Bali, Indonesia &nbsp;·&nbsp; <a href="mailto:hello@unrealstudiobali.com" style="color:${BROWN};text-decoration:none;font-weight:600;">hello@unrealstudiobali.com</a>
     </div>
     <div style="font-size:10px;color:rgba(63,35,5,.4);line-height:1.8;margin-top:10px;">
       Correo de solo envío · no respondas a este mensaje.<br>
       Para cambiar el idioma, entra en tu portal de cliente.<br>
       © ${year} Unreal Studio · Bali
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
