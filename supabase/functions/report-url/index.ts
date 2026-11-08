// report-url — enlace FIRMADO de 10 min a un reporte de obra del bucket PRIVADO `reports`.
// Quién puede verlo lo decide la BD (can_read_report) con la sesión de quien llama; la caducidad
// la fija esta fn (nunca el cliente). Body: { path: "property-updates/<project_id>/<fichero>" }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const TTL = 600;
const PATH_RE = /^property-updates\/[0-9a-f-]{36}\/[^\/]+(\/[^\/]+)?$/i;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const { path } = await req.json().catch(() => ({}));
  if (typeof path !== "string" || !PATH_RE.test(path) || path.includes("..")) return json({ error: "bad path" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "login required" }, 401);
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ok, error } = await asCaller.rpc("can_read_report", { p_name: path });
  if (error || ok !== true) return json({ error: "forbidden" }, 403);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error: signErr } = await admin.storage.from("reports").createSignedUrl(path, TTL);
  if (signErr || !data?.signedUrl) return json({ error: "not found" }, 404);
  return json({ url: data.signedUrl, expires_in: TTL });
});
