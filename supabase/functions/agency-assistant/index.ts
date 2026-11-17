// Help assistant for the agency portal (17-nov-2026). FREE only: Groq free tier (GROQ_API_KEY secret), no paid AI.
// Answers in the agency's language using ONLY the curated knowledge below + its allowed projects (web data).
// Never: team names, ROI figures, units left, commission ranges, due-diligence / own-lawyer talk.
// Can't answer / quota exhausted / error → "I'll pass this to the team" + admin notification. Every turn is logged
// (agency_assistant_messages, admin-readable). Rate limit per agency: 20/hour, 60/day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

const env = (k: string) => Deno.env.get(k) ?? "";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const LANGS = ["es", "en", "ro", "id"] as const;
const LANG_NAME: Record<string, string> = { es: "Spanish", en: "English", ro: "Romanian", id: "Indonesian" };
const HANDOFF: Record<string, string> = {
  es: "Esto prefiero pasárselo al equipo para darte una respuesta exacta. Te contestan muy pronto.",
  en: "I'll pass this to the team so you get an exact answer. They'll get back to you shortly.",
  ro: "Prefer să transmit asta echipei, ca să primești un răspuns exact. Îți răspund în curând.",
  id: "Saya teruskan ini ke tim agar Anda mendapat jawaban yang tepat. Mereka akan segera membalas.",
};
const LIMIT: Record<string, string> = {
  es: "Has hecho muchas preguntas seguidas. Te paso con el equipo para seguir.",
  en: "You've asked a lot of questions in a row. I'm passing you to the team to continue.",
  ro: "Ai pus multe întrebări la rând. Te transfer echipei ca să continuăm.",
  id: "Anda sudah mengajukan banyak pertanyaan berturut-turut. Saya teruskan ke tim untuk melanjutkan.",
};
// post-filter: anything like this in a draft answer → hand off instead of sending it
const FORBIDDEN = /(andreas|marcelino|sergio|emma|\broi\b|rentabilidad|yield|abogad|lawyer|due diligence|diligen|avocat|pengacara|units? (left|available)|unidades (disponibles|quedan)|\d+\s*%\s*(-|–|to|a)\s*\d+\s*%)/i;

const KNOWLEDGE = `
ABOUT: Unreal Studio is an architecture studio and developer with its operational base in Bali (Uluwatu) and an office in Madrid. It designs, builds and sells its own turnkey villas, lofts and studios for foreign buyers who buy to rent out. Direct architect and builder, not an intermediary.
OFFER TO AGENCIES: only the projects listed under PROJECTS (all in the Uluwatu area of Bali). Many other finished Unreal projects are sold out; photos at unrealstudiobali.com.
PRICES: always the website price; fixed price. Any discount or price variation is decided by the team (hand off).
COMMISSION: the agency's own commission is in its agreement (given below as AGENCY_TERMS). It is calculated on the agreed sale price. Unreal pays the full commission within 14 days of receiving at least 30% initial payment from the buyer, also when the rest is paid in instalments. Never quote ranges or other agencies' terms; negotiation of commission → hand off.
PROCESS: 1) the agency registers its buyer (name + WhatsApp) in the portal ("My clients") BEFORE the buyer contacts Unreal → the buyer is protected for the agency for 12 months. 2) Unreal Studio handles the whole sale: contract, legal process and formalisation, start to finish. 3) Payments go to the company account; payment details are given at signing. Payment plans are the ones in each project's brochure; the more advanced the construction, the more is paid upfront.
CALLS: by default everything in writing is fastest (time difference). A closing call with the sales team is available when a buyer has seen everything and wants to move forward (the agency can request it in "Requests").
PORTAL: Projects (prices, brochures, photos, plans, project pack), Availability, Sales material, My clients (register buyers), Requests (call, visit, presentation, reserve a unit), Commissions (estimated), Statistics (visits to the agency's link), Legal agreements (download the collaboration agreement template, upload it signed, download the countersigned version; request a project agreement for a client), My agency (data, logo, personal referral link), Help.
PERSONAL LINK: each agency has its own short referral link (My agency / Home). Visitors who arrive through it are attributed to the agency for 12 months.
LEASEHOLD: properties are sold as leasehold, a consolidated legal formula granting the right to use and exploit the property for the contract term (years per project are on its page).
NOT OFFERED: guaranteed rental income, buy-back, guaranteed capital gain, contacting previous buyers, company accounts. Never promise returns.
`;

async function allowedProjects(partnerId: string) {
  const [{ data: cfg }, { data: acc }, { data: ps }] = await Promise.all([
    db.from("agency_config").select("value").eq("key", "agency_projects").maybeSingle(),
    db.from("agency_project_access").select("project_id, is_active").eq("partner_id", partnerId),
    db.from("projects").select("id, name, location, status, completion_percent, investor_price, price_currency, years_contract, completion_date, completion_date_en, completion_date_id, payment_plan_off_plan, payment_plan_off_plan_en, payment_plan_off_plan_id, payment_plan_off_plan_ro, description_en, is_hidden, visibility_status"),
  ]);
  const pats = Array.isArray(cfg?.value) && cfg.value.length ? cfg.value.map((x: unknown) => String(x).toLowerCase()) : null;
  const ov = new Map((acc ?? []).map((a) => [a.project_id, a.is_active]));
  return (ps ?? []).filter((p) => !p.is_hidden && p.visibility_status !== "sold_out")
    .filter((p) => ov.has(p.id) ? ov.get(p.id) : (!pats || pats.some((k: string) => p.name.toLowerCase().includes(k))));
}

function projectFacts(ps: any[], lang: string) {
  const pick = (p: any, base: string) => p[`${base}_${lang}`] || p[`${base}_en`] || p[base] || "";
  return ps.map((p) => [
    `- ${p.name.replace(/\s*-\s*\d+\s*bd$/i, "")} (${p.name})`,
    `  location: ${p.location ?? ""}; status: ${p.status ?? ""}${typeof p.completion_percent === "number" ? ` (${p.completion_percent}% built)` : ""}; estimated delivery: ${pick(p, "completion_date")}`,
    `  price from: ${p.investor_price ? `${Number(p.investor_price).toLocaleString("de-DE")} ${p.price_currency || "EUR"}` : "on request"}; lease term: ${p.years_contract ?? "—"} years`,
    `  payment plan: ${String(pick(p, "payment_plan_off_plan")).replace(/\s+/g, " ").slice(0, 400) || "see brochure"}`,
    `  summary: ${String(p.description_en ?? "").replace(/\s+/g, " ").slice(0, 300)}`,
  ].join("\n")).join("\n");
}

async function groq(messages: unknown[]) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("GROQ_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-oss-120b", reasoning_effort: "low", temperature: 0.2, max_completion_tokens: 700, messages }),
  });
  if (!r.ok) throw new Error(`groq_${r.status}`);
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: null };
  if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: p } = await db.from("listing_partners").select("id, agency_name, lang, commission_close_pct, commission_referral_pct, is_demo")
    .eq("user_id", u.user.id).eq("status", "approved").is("deleted_at", null).maybeSingle();
  if (!p) return json({ ok: false, error: "forbidden" }, 403);

  let b: any; try { b = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const question = String(b?.message ?? "").trim().slice(0, 1000);
  if (!question) return json({ ok: false, error: "empty" }, 400);
  const lang = (LANGS as readonly string[]).includes(String(b?.lang ?? "").slice(0, 2)) ? String(b.lang).slice(0, 2) : (p.lang && (LANGS as readonly string[]).includes(p.lang) ? p.lang : "en");
  const history = (Array.isArray(b?.history) ? b.history : []).slice(-6)
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 1000) }));

  const log = async (answer: string | null, handoff: boolean, error: string | null = null) => {
    await db.from("agency_assistant_messages").insert({ partner_id: p.id, lang, question, answer, handoff, error });
    if (handoff && !p.is_demo) await db.rpc("notify", { p_type: "agency_assistant_handoff", p_title: p.agency_name, p_body: question.slice(0, 300), p_severity: "info", p_entity_type: "listing_partner", p_entity_id: p.id, p_actor_name: p.agency_name, p_actor_email: null, p_metadata: { error } });
  };

  // rate limit (free tier + abuse): 20/hour, 60/day per agency
  const since = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
  const [{ count: h1 }, { count: d1 }] = await Promise.all([
    db.from("agency_assistant_messages").select("id", { count: "exact", head: true }).eq("partner_id", p.id).gte("created_at", since(1)),
    db.from("agency_assistant_messages").select("id", { count: "exact", head: true }).eq("partner_id", p.id).gte("created_at", since(24)),
  ]);
  if ((h1 ?? 0) >= 20 || (d1 ?? 0) >= 60) { await log(LIMIT[lang], true, "rate_limit"); return json({ ok: true, answer: LIMIT[lang], handoff: true }); }

  const terms = `AGENCY_TERMS (this agency only): ${p.commission_close_pct ?? "—"}% if the agency closes the sale; ${p.commission_referral_pct ?? "—"}% if Unreal closes it (agency only introduces the buyer).`;
  const system = [
    `You are the help assistant inside the Unreal Studio agency portal, talking to the real-estate agency "${p.agency_name}".`,
    `Always answer in ${LANG_NAME[lang]}, short (2-5 sentences), warm and professional, no emojis.`,
    "Use ONLY the facts in KNOWLEDGE, AGENCY_TERMS and PROJECTS. Never invent numbers, dates, availability or legal statements.",
    "Never mention people's names from the team (say 'the team'). Never give ROI/yield figures, units left, commission ranges or other agencies' terms.",
    "Never suggest due diligence, lawyers or legal checks: say Unreal Studio handles the whole legal process.",
    "If the answer is not fully covered by these facts, or it needs a decision (discounts, commission changes, a specific unit, legal/tax case, meetings), reply with exactly: [[HANDOFF]]",
    `KNOWLEDGE:\n${KNOWLEDGE}`,
    terms,
    `PROJECTS:\n${projectFacts(await allowedProjects(p.id), lang)}`,
  ].join("\n");

  try {
    const draft = await groq([{ role: "system", content: system }, ...history, { role: "user", content: question }]);
    if (!draft || draft.includes("[[HANDOFF]]") || FORBIDDEN.test(draft)) {
      await log(draft || null, true, draft && FORBIDDEN.test(draft) ? "filtered" : null);
      return json({ ok: true, answer: HANDOFF[lang], handoff: true });
    }
    await log(draft, false);
    return json({ ok: true, answer: draft, handoff: false });
  } catch (e) {
    await log(null, true, String((e as Error)?.message ?? e));
    return json({ ok: true, answer: HANDOFF[lang], handoff: true });
  }
});
