// @ts-nocheck — runtime Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const BROWN = "#3F2305"; const ALMOND = "#F3E5D8";
const TR = {"es": {"subject": "Restablece tu contraseña · Unreal Studio", "heading": "Restablece tu contraseña", "p1": "Has solicitado restablecer la contraseña de tu portal de Unreal Studio.", "p2": "Pulsa el botón para crear una nueva. El enlace caduca en 1 hora.", "button": "Crear nueva contraseña", "footer": "Si no has sido tú, ignora este correo: tu contraseña no cambiará."}, "en": {"subject": "Reset your password · Unreal Studio", "heading": "Reset your password", "p1": "You have requested to reset the password for your Unreal Studio portal.", "p2": "Click the button to create a new one. The link expires in 1 hour.", "button": "Create new password", "footer": "If it wasn't you, ignore this email: your password won't change."}, "ro": {"subject": "Resetează parola · Unreal Studio", "heading": "Resetează parola", "p1": "Ai solicitat resetarea parolei pentru portalul tău Unreal Studio.", "p2": "Apasă butonul pentru a crea o nouă parolă. Linkul expiră în 1 oră.", "button": "Creează o nouă parolă", "footer": "Dacă nu ai fost tu, ignoră acest e-mail: parola ta nu se va schimba."}, "id": {"subject": "Atur Ulang Kata Sandi Anda · Unreal Studio", "heading": "Atur Ulang Kata Sandi Anda", "p1": "Anda telah meminta untuk mengatur ulang kata sandi portal Unreal Studio Anda.", "p2": "Klik tombol untuk membuat yang baru. Tautan ini akan kedaluwarsa dalam 1 jam.", "button": "Buat Kata Sandi Baru", "footer": "Jika bukan Anda, abaikan surel ini: kata sandi Anda tidak akan berubah."}};
function tr(lang, key){ const L=(lang||"es").slice(0,2); return (TR[L]&&TR[L][key])||TR.es[key]||key; }
function brandWrap(subject, inner){ return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,300&family=DM+Serif+Display&family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet"><title>${subject}</title></head><body style="margin:0;padding:0;background:${ALMOND};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ALMOND};padding:28px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:8px 0 2px;"><span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN};">Unreal Studio</span></td></tr><tr><td align="center" style="padding:0 0 20px;"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:14px;color:rgba(63,35,5,.55);">Beyond the Ordinary, Inside the Unreal</span></td></tr><tr><td style="background:#fff;border-radius:18px;padding:34px 32px;font-family:Manrope,Arial,sans-serif;color:${BROWN};">${inner}</td></tr><tr><td align="center" style="padding:20px 24px 6px;font-family:Manrope,Arial,sans-serif;"><div style="font-size:12px;color:rgba(63,35,5,.55);">Bali, Indonesia &nbsp;·&nbsp; <a href="mailto:hello@unrealstudiobali.com" style="color:${BROWN};text-decoration:none;font-weight:600;">hello@unrealstudiobali.com</a></div><div style="font-size:10px;color:rgba(63,35,5,.4);line-height:1.8;margin-top:10px;">© 2026 Unreal Studio · Bali</div></td></tr></table></td></tr></table></body></html>`; }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success:false, error:"Method not allowed" }, 405);
  let p; try { p = await req.json(); } catch { return json({ success:false, error:"Bad JSON" }, 400); }
  const email=(p.email||"").trim().toLowerCase();
  const lang=(p.lang||"es");
  if (!email || !email.includes("@")) return json({ success:false, error:"email required" }, 400);
  const redirectTo = p.redirectTo || "https://unrealstudiobali.com/auth/reset";
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const portal = String(p.portal||"").toLowerCase();
  const member = await (async () => { try {
    if (portal==="cliente"){ const {data}=await supabase.from("clients").select("id").ilike("email",email).limit(1); return !!(data&&data.length); }
    if (["empleados","equipo","manager"].includes(portal)){ const {data}=await supabase.from("employees").select("id").ilike("email",email).eq("active",true).limit(1); return !!(data&&data.length); }
    if (portal==="admin"){ const {data}=await supabase.from("admin_users").select("id").ilike("username",email).eq("is_active",true).limit(1); return !!(data&&data.length); }
    if (portal==="agencias"){ const {data}=await supabase.from("listing_partners").select("id").ilike("email",email).limit(1); return !!(data&&data.length); }
    return false; } catch { return false; } })();
  if (!member) return json({ success:false, error:"no_account" });
  let link="";
  try { const { data, error } = await supabase.auth.admin.generateLink({ type:"recovery", email, options:{ redirectTo } });
    if (error || !data?.properties?.action_link) return json({ success:true });
    link = data.properties.action_link; } catch { return json({ success:true }); }
  const host=Deno.env.get("SMTP_HOST"), user=Deno.env.get("SMTP_USER"), pass=Deno.env.get("SMTP_PASS");
  if (!host||!user||!pass) return json({ success:false, error:"transport_not_configured" }, 503);
  const port=Number(Deno.env.get("SMTP_PORT")??"465"); const from=Deno.env.get("MAIL_FROM")??"Unreal Studio <no.reply@unrealstudiobali.com>";
  const subject = tr(lang,"subject");
  const inner = `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;margin:0 0 14px;color:${BROWN};">${tr(lang,"heading")}</h1><p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:${BROWN};">${tr(lang,"p1")}</p><p style="font-size:15px;line-height:1.6;margin:0 0 4px;color:${BROWN};">${tr(lang,"p2")}</p><p style="text-align:center;margin:28px 0 8px;"><a href="${link}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:14px;">${tr(lang,"button")}</a></p><p style="font-size:12px;line-height:1.6;color:rgba(63,35,5,.55);margin:18px 0 0;">${tr(lang,"footer")}</p>`;
  const client = new SMTPClient({ connection:{ hostname:host, port, tls:port===465, auth:{ username:user, password:pass } } });
  try { await client.send({ from, to:email, replyTo:"hello@unrealstudiobali.com", subject, html: brandWrap(subject, inner) }); }
  catch (e) { try { await client.close(); } catch {} return json({ success:false, error:String(e) }, 502); }
  try { await client.close(); } catch {}
  return json({ success:true });
});
