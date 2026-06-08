/**
 * translate-project — auto-traduce el contenido de un proyecto del español a
 * inglés, rumano e indonesio y lo guarda en las columnas *_en/*_ro/*_id.
 *
 * Lo llama el admin tras guardar un proyecto (Andreas: las descripciones se
 * traducen SIEMPRE solas desde el español; nunca a mano). Usa Groq (Whisper no,
 * un LLM) para traducir. Mantiene "leasehold"/"lease" sin traducir.
 *
 * Body: { project_id: string }. Auth: service role o anon (solo traduce, idempotente).
 */
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const FIELDS = ["description","building_permit_status","distance_beach","furnishing","living_room_style",
  "parking","payment_plan_off_plan","structural_warranty","view","water_supply","zoning_type"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = body?.project_id;
  if (!id) return json({ error: "project_id required" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const cols = FIELDS.join(", ");
  const { data: p } = await supabase.from("projects").select(`id, ${cols}`).eq("id", id).maybeSingle();
  if (!p) return json({ error: "not found" }, 404);

  const src = {};
  for (const f of FIELDS) if (p[f] && String(p[f]).trim()) src[f] = p[f];
  if (!Object.keys(src).length) return json({ ok: true, note: "nothing to translate" });

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return json({ error: "GROQ_API_KEY missing" }, 503);

  const prompt = "Eres traductor inmobiliario profesional. Traduce los valores del ESPAÑOL a inglés (en), "
    + "rumano (ro) e indonesio (id). Mantén 'leasehold' y 'lease' SIN traducir; conserva tono y significado; "
    + "devuelve EXACTAMENTE las mismas claves. Responde SOLO JSON {\"en\":{...},\"ro\":{...},\"id\":{...}}.\n\nCampos:\n"
    + JSON.stringify(src);

  let out;
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }], temperature: 0.2,
        response_format: { type: "json_object" } }),
    });
    const j = await r.json();
    out = JSON.parse(j.choices[0].message.content);
  } catch (e) {
    return json({ error: "translation_failed", detail: String(e) }, 502);
  }

  const patch = {};
  for (const lang of ["en", "ro", "id"]) {
    const tr = out[lang] || {};
    for (const f of Object.keys(src)) if (tr[f] && String(tr[f]).trim()) patch[`${f}_${lang}`] = tr[f];
  }
  if (Object.keys(patch).length) await supabase.from("projects").update(patch).eq("id", id);
  return json({ ok: true, updated: Object.keys(patch).length });
});
