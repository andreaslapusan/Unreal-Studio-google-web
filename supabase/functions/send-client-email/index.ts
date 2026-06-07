/**
 * send-client-email — generic client mailer used by the admin panel.
 *
 * Primary use: the manual "Enviar kwitansi" button. The admin builds the
 * kwitansi HTML client-side (lib/kwitansi.ts) and posts it here; this function
 * just delivers it from hello@unrealstudiobali.com. Kept dumb on purpose so
 * there's a single send path and no duplicated receipt logic server-side.
 *
 * Auth: caller must pass the admin user id; we verify it against admin_users
 * (SECURITY DEFINER RPC) before sending — the anon key alone can't mail clients.
 */
// @ts-nocheck — Deno runtime types not in the Vite tsconfig
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendMail, smtpConfigured } from "../_shared/smtp.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  let p: { adminUserId?: string; to?: string; subject?: string; html?: string; kwitansiId?: string };
  try { p = await req.json(); } catch { return json({ success: false, error: "Bad JSON" }, 400); }

  if (!p.adminUserId || !p.to || !p.subject || !p.html) {
    return json({ success: false, error: "adminUserId, to, subject, html required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verify the caller is a real, active admin.
  const { data: admin } = await supabase
    .from("admin_users").select("id").eq("id", p.adminUserId).eq("is_active", true).maybeSingle();
  if (!admin) return json({ success: false, error: "Unauthorized" }, 401);

  if (!smtpConfigured()) {
    return json({ success: false, error: "transport_not_configured",
      hint: "Set SMTP_HOST/SMTP_USER/SMTP_PASS secrets for hello@unrealstudiobali.com" }, 503);
  }

  try {
    await sendMail({ to: p.to, subject: p.subject, html: p.html });
  } catch (e) {
    return json({ success: false, error: String(e) }, 502);
  }

  // Stamp the kwitansi as sent if one was referenced.
  if (p.kwitansiId) {
    await supabase.rpc("admin_mark_kwitansi_sent", { p_user_id: p.adminUserId, p_id: p.kwitansiId, p_email: p.to });
  }
  return json({ success: true });
});
