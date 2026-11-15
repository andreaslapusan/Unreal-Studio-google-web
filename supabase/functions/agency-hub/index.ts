// @ts-nocheck — runtime Deno
/**
 * agency-hub — every server step of the agency funnel in one function (plan items 4, 5, 6, 13, 17, 18, 22, 24).
 * Plan names → action: agency-approve = "approve", send-agency-welcome = "welcome",
 * notify-agency-event = "event", login nudges = "reminders", agreement PDF = "agreement", email change = "update_email".
 * Auth: DB triggers send x-agency-hook (Vault agency_hook_secret = env AGENCY_HOOK_SECRET); the cron sends
 * x-cron-secret; admin/agency calls send their Supabase JWT. verify_jwt=false like the other functions.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { T, L, fill } from "./texts.ts";
import { agreementPdf } from "./agreement.ts";

const SITE = "https://unrealstudiobali.com";
const SEG = { es: "portal-agencias", en: "agencies", ro: "agentii", id: "agensi" };
const BOOKING = "https://calendar.google.com/calendar/appointments/schedules/AcZssZ30yCSnZcY5nFY2a9CRvTHKW0Xb5soq6RzIGZUIJWv5v5dvr9CxvlpY5egfenML59rpfxbcJ-ol";
const LOCALE = { es: "es-ES", en: "en-GB", ro: "ro-RO", id: "id-ID" };
const env = (k) => Deno.env.get(k) ?? "";
const SB_URL = env("SUPABASE_URL");
const db = createClient(SB_URL, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const synthEmail = (email) => { const e = String(email).trim().toLowerCase(); const at = e.indexOf("@"); return at < 0 ? e : `${e.slice(0, at)}+ust-agencias@${e.slice(at + 1)}`; };
const portalUrl = (lang) => `${SITE}/${L(lang)}/${SEG[L(lang)]}`;
const money = (n, cur, lang) => { try { return new Intl.NumberFormat(LOCALE[L(lang)], { style: "currency", currency: cur || "EUR", maximumFractionDigits: 0 }).format(Number(n)); } catch { return `${n} ${cur}`; } };

// ───────── mail + telegram ─────────
const BROWN = "#3F2305", ALMOND = "#F3E5D8";
const P = (s) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px;color:${BROWN};">${s}</p>`;
const H1 = (s) => `<h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;margin:0 0 14px;color:${BROWN};">${s}</h1>`;
const BTN = (href, label) => `<p style="text-align:center;margin:24px 0;"><a href="${href}" style="background:${BROWN};color:#fff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:12px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:14px;">${esc(label)}</a></p>`;
const LINK = (label, href) => P(`<strong>${esc(label)}:</strong><br><a href="${href}" style="color:${BROWN};word-break:break-all;">${esc(href)}</a>`);
const wrap = (subject, inner) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:${ALMOND};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ALMOND};padding:28px 16px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td align="center" style="padding:8px 0 20px;"><span style="font-family:'DM Serif Display',Georgia,serif;font-size:26px;font-weight:700;color:${BROWN};">Unreal Studio Bali</span></td></tr><tr><td style="background:#fff;border-radius:18px;padding:34px 32px;font-family:Manrope,Arial,sans-serif;color:${BROWN};">${inner}</td></tr><tr><td align="center" style="padding:20px 24px 6px;font-family:Manrope,Arial,sans-serif;font-size:12px;color:rgba(63,35,5,.55);">Bali · Madrid &nbsp;·&nbsp; <a href="mailto:hello@unrealstudiobali.com" style="color:${BROWN};">hello@unrealstudiobali.com</a> &nbsp;·&nbsp; <a href="${SITE}/privacidad" style="color:${BROWN};">Privacy</a></td></tr></table></td></tr></table></body></html>`;

async function sendMail(to, subject, inner, attachments = []) {
  const host = env("SMTP_HOST"), user = env("SMTP_USER"), pass = env("SMTP_PASS");
  if (!host || !user || !pass) return { ok: false, error: "transport_not_configured" };
  const port = Number(env("SMTP_PORT") || "465");
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from: env("MAIL_FROM") || "Unreal Studio <no.reply@unrealstudiobali.com>", to, replyTo: "hello@unrealstudiobali.com", subject, html: wrap(subject, inner), attachments });
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
  finally { try { await client.close(); } catch { /* closed */ } }
}

// shortcut: the E2E (item 27) names its throwaway agency "E2E …" so Andreas's Telegram is not pinged by test runs.
const isTest = (name) => /^E2E /.test(String(name ?? ""));

async function tg(text, agencyName = "") {
  if (isTest(agencyName)) return true;
  const tok = env("TG_BOT_TOKEN"), chat = env("TG_CHAT_ID");
  if (!tok || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: String(text).slice(0, 4000), disable_web_page_preview: true }) });
    return r.ok;
  } catch { return false; }
}

// ───────── outreach token (item 8): base64url(json).base64url(hmac-sha256) ─────────
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
async function verifyRef(token, email) {
  const secret = env("AGENCY_REF_SECRET");
  if (!token || !secret || !String(token).includes(".")) return null;
  const [body, sig] = String(token).split(".");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64u(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  if (want.length !== sig?.length) return null;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  try {
    const p = JSON.parse(unb64u(body));
    if (!p.exp || p.exp * 1000 < Date.now()) return null;
    if (String(p.email || "").toLowerCase() !== String(email || "").toLowerCase()) return null;
    return p;
  } catch { return null; }
}
const TIERS = { world: { market: "world" }, es5: { market: "es", close_pct: 5, referral_pct: 3 }, es3: { market: "es", close_pct: 3, referral_pct: 3 } };

// ───────── auto-approval rules (item 6) ─────────
const FREE = new Set("gmail.com googlemail.com yahoo.com yahoo.es yahoo.co.uk yahoo.fr ymail.com hotmail.com hotmail.es hotmail.co.uk hotmail.fr outlook.com outlook.es live.com live.co.uk msn.com icloud.com me.com mac.com aol.com gmx.com gmx.de gmx.net gmx.es web.de mail.com mail.ru yandex.com yandex.ru proton.me protonmail.com zoho.com libero.it orange.fr free.fr laposte.net wanadoo.fr t-online.de qq.com 163.com 126.com terra.com.br uol.com.br bol.com.br yahoo.co.id rocketmail.com tutanota.com".split(" "));
const DISPOSABLE = /(mailinator|guerrillamail|10minutemail|tempmail|temp-mail|yopmail|trashmail|sharklasers|getnada|dispostable|maildrop|throwaway|fakeinbox|mohmal|emailondeck|mintemail|spamgourmet)/i;
async function dnsHas(name, type) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    return j.Status === 0 && Array.isArray(j.Answer) && j.Answer.length > 0;
  } catch { return false; }
}
async function autoCheck(app) {
  const reasons = [];
  const email = String(app.email).toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const { data: bl } = await db.from("agency_config").select("value").eq("key", "blacklist").maybeSingle();
  if ((bl?.value?.emails ?? []).map((x) => String(x).toLowerCase()).includes(email) || (bl?.value?.domains ?? []).map((x) => String(x).toLowerCase()).includes(domain)) reasons.push("blacklisted");
  const { data: dup } = await db.from("listing_partners").select("id").eq("email", email).eq("status", "approved").is("deleted_at", null).maybeSingle();
  if (dup) reasons.push("already_partner");
  if (!app.accepted_terms_at) reasons.push("terms_not_accepted");
  const ref = await verifyRef(app.ref_token, email);
  if (ref) return { ok: reasons.length === 0, instant: true, reasons, ref };
  if (app.ref_token) reasons.push("invalid_or_expired_token");
  if (FREE.has(domain)) reasons.push("free_email_domain");
  if (DISPOSABLE.test(domain)) reasons.push("disposable_email");
  if (!(await dnsHas(domain, "MX"))) reasons.push("no_mx");
  let host = "";
  try { host = app.website ? new URL(/^https?:\/\//i.test(app.website) ? app.website : `https://${app.website}`).hostname : ""; } catch { host = ""; }
  if (!host) reasons.push("no_website");
  else if (!(await dnsHas(host, "A")) && !(await dnsHas(host, "AAAA")) && !(await dnsHas(host, "CNAME"))) reasons.push("website_not_resolving");
  return { ok: reasons.length === 0, instant: false, reasons, ref: null };
}

// ───────── account ─────────
async function ensureUser(partner) {
  if (partner.user_id) return partner.user_id;
  const synth = synthEmail(partner.email);
  let { data: uid } = await db.rpc("auth_user_id_by_email", { p_email: synth });
  if (!uid) {
    const { data, error } = await db.auth.admin.createUser({ email: synth, email_confirm: true, app_metadata: { real_email: partner.email, portal: "agencias" } });
    if (error) throw new Error(`create_user: ${error.message}`);
    uid = data.user.id;
  }
  const { error: le } = await db.rpc("link_partner_user", { p_partner: partner.id, p_user: uid, p_email: partner.email });
  if (le) throw new Error(`link_user: ${le.message}`);
  const { data: again } = await db.from("listing_partners").select("user_id").eq("id", partner.id).single();
  if (again?.user_id !== uid) throw new Error("link_user: account belongs to a staff user");
  return uid;
}

async function recoveryLink(uid) {
  const { data: u, error } = await db.auth.admin.getUserById(uid);
  if (error || !u?.user?.email) throw new Error(`get_user: ${error?.message ?? "no email"}`);
  const { data, error: le } = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email, options: { redirectTo: `${SITE}/auth/reset?portal=agencias` } });
  if (le || !data?.properties?.action_link) throw new Error(`generate_link: ${le?.message ?? "no link"}`);
  return data.properties.action_link;
}

async function loadPartner(id) {
  const { data, error } = await db.from("listing_partners").select("*").eq("id", id).single();
  if (error) throw new Error(`partner: ${error.message}`);
  return data;
}

const commissionLine = (t, p) => (Number(p.commission_close_pct) === Number(p.commission_referral_pct) || p.commission_referral_pct == null
  ? fill(t.commissionOne, { close: p.commission_close_pct })
  : fill(t.commissionTwo, { close: p.commission_close_pct, referral: p.commission_referral_pct }));

async function partnerPdf(p) {
  const { data: app } = p.application_id ? await db.from("listing_partner_applications").select("accepted_terms_at, terms_version").eq("id", p.application_id).maybeSingle() : { data: null };
  return agreementPdf({ lang: p.lang, agency: p.agency_name, email: p.email, country: p.country, close: Number(p.commission_close_pct ?? 5), referral: Number(p.commission_referral_pct ?? p.commission_close_pct ?? 3), acceptedAt: app?.accepted_terms_at, version: app?.terms_version });
}

const toB64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

async function welcome(partnerId, kind = "welcome") {
  const p = await loadPartner(partnerId);
  if (p.status !== "approved" || p.deleted_at) return { ok: false, error: "partner_not_active" };
  const uid = await ensureUser(p);
  const link = await recoveryLink(uid);
  const lang = L(p.lang), t = T[lang];
  const personal = `${SITE}/proyectos?utm_source=lister&utm_partner=${encodeURIComponent(p.personal_link_slug ?? p.id)}`;
  const kit = `${SITE}/agencias/dashboard?view=kit`;
  const reminder = kind === "reminder";
  const subject = reminder ? t.reminderSubject : t.welcomeSubject;
  const inner = (reminder ? H1(esc(t.reminderHeading)) + P(esc(fill(t.reminderP1, { agency: p.agency_name }))) : H1(esc(fill(t.welcomeHeading, { agency: p.agency_name }))) + P(esc(t.welcomeP1)))
    + P(esc(t.welcomeStep)) + BTN(link, t.welcomeButton)
    + LINK(t.portal, portalUrl(lang)) + P(`<strong>${esc(commissionLine(t, p))}</strong>`)
    + LINK(t.personalLink, personal) + LINK(t.kit, kit)
    + (p.market === "es" ? LINK(t.booking, BOOKING) : "")
    + (reminder ? "" : P(esc(t.agreementNote)))
    + `<p style="font-size:12px;line-height:1.6;color:rgba(63,35,5,.55);margin:18px 0 0;">${esc(t.footer)}</p>`;
  // denomailer mangles raw Uint8Array content (3-byte attachment): send it base64-encoded
  const attachments = reminder ? [] : [{ filename: `Unreal-Studio-${(p.personal_link_slug ?? "agency")}.pdf`, content: toB64(await partnerPdf(p)), encoding: "base64", contentType: "application/pdf" }];
  const r = await sendMail(p.email, subject, inner, attachments);
  if (r.ok && !reminder) await db.from("listing_partners").update({ welcomed_at: new Date().toISOString() }).eq("id", p.id);
  return r;
}

// ───────── approve (items 4, 6) ─────────
async function approve(appId, mode, opts, by) {
  const { data: app, error } = await db.from("listing_partner_applications").select("*").eq("id", appId).single();
  if (error) return { ok: false, error: `application: ${error.message}` };
  let o = { ...(opts ?? {}), by };
  if (mode === "auto") {
    if (app.status !== "pending") return { ok: true, status: app.status, skipped: true };
    const chk = await autoCheck(app);
    await db.from("listing_partner_applications").update({ auto_check: { ...chk, ref: chk.ref ? { src: chk.ref.src, tier: chk.ref.tier, campaign: chk.ref.campaign } : null, at: new Date().toISOString() } }).eq("id", appId);
    if (!chk.ok) {
      const sent = await tg(`🟡 Agencia pendiente de revisión (no se aprobó sola)\n\n${app.agency_name} · ${app.email}\n${app.country ?? "—"} · ${app.website ?? "sin web"}\nMotivo: ${chk.reasons.join(", ")}\n\nAdmin → Agencias → Solicitudes.`, app.agency_name);
      if (sent) await db.from("listing_partner_applications").update({ notified_at: new Date().toISOString() }).eq("id", appId);
      return { ok: true, status: "pending", reasons: chk.reasons };
    }
    if (chk.ref && TIERS[chk.ref.tier]) o = { ...TIERS[chk.ref.tier], ...o };
    o.by = chk.instant ? "auto:token" : "auto:rules";
  }
  const { data: res, error: re } = await db.rpc("approve_partner_application", { p_app: appId, p_opts: o });
  if (re) return { ok: false, error: `approve: ${re.message}` };
  if (!["approved", "already_approved"].includes(res?.status)) return { ok: false, error: res?.status ?? "approve_failed" };
  let mail;
  try { mail = await welcome(res.partner_id); } catch (e) { mail = { ok: false, error: String(e?.message ?? e) }; }
  if (mode === "auto") {
    await tg(`✅ Agencia aprobada sola (${o.by})\n\n${app.agency_name} · ${app.email}\n${mail.ok ? "Email de bienvenida enviado." : "⚠️ Email de bienvenida FALLÓ: " + mail.error}`, app.agency_name);
    await db.from("listing_partner_applications").update({ notified_at: new Date().toISOString() }).eq("id", appId);
  }
  return { ok: mail.ok, status: "approved", partner_id: res.partner_id, email_sent: mail.ok, error: mail.ok ? undefined : `email: ${mail.error}` };
}

// ───────── events (items 13, 22, 12) ─────────
const fmtDate = (iso, lang) => new Date(iso).toLocaleString(LOCALE[L(lang)], { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });
async function event(table, ev, id) {
  const mark = (tbl) => db.from(tbl).update({ notified_at: new Date().toISOString() }).eq("id", id);
  if (table === "listing_partner_applications" && ev === "rejected") {
    const { data: a } = await db.from("listing_partner_applications").select("*").eq("id", id).single();
    const t = T[L(a.lang)];
    const inner = H1(esc(t.rejectSubject.split(" · ")[0])) + P(esc(fill(t.rejectP1, { agency: a.agency_name }))) + (a.reject_reason ? P(esc(fill(t.rejectReason, { reason: a.reject_reason }))) : "") + P(esc(t.rejectP2));
    return sendMail(a.email, t.rejectSubject, inner);
  }
  if (table === "agency_lead_collisions") {
    const { data: c } = await db.from("agency_lead_collisions").select("*, listing_partners(agency_name)").eq("id", id).single();
    const ok = await tg(`⚠️ Choque de registro de cliente\n\n${c.listing_partners?.agency_name ?? "?"} intentó registrar a ${c.client_name ?? "—"} (${[c.client_email, c.client_phone].filter(Boolean).join(" · ")}), que ya existe (${c.matched === "client" ? "cliente de Unreal" : "registrado por otra agencia o por ella misma"}). A la agencia solo se le dijo "ya registrado".`, c.listing_partners?.agency_name);
    if (ok) await mark("agency_lead_collisions");
    return { ok };
  }
  const leadCols = "id, client_name, client_email, client_phone, budget, created_at, status, agency_id, properties(name)";
  if (table === "agency_leads") {
    const { data: l } = await db.from("agency_leads").select(leadCols).eq("id", id).single();
    const p = await loadPartner(l.agency_id);
    const t = T[L(p.lang)];
    if (ev === "created") {
      const ok = await tg(`🤝 ${p.agency_name} registra cliente\n\n${l.client_name} · ${[l.client_email, l.client_phone].filter(Boolean).join(" · ")}\nProyecto: ${l.properties?.name ?? "—"} · ${l.budget ?? ""}\n\nAdmin → Agencias → Clientes registrados.`, p.agency_name);
      if (ok) await mark("agency_leads");
      if (p.is_demo) return { ok };
      return sendMail(p.email, fill(t.leadSubject, { client: l.client_name }), H1(esc(t.leadHeading)) + P(esc(fill(t.leadP1, { client: l.client_name, agency: p.agency_name, date: fmtDate(l.created_at, p.lang) }))));
    }
    if (p.is_demo) return { ok: true, skipped: "demo" };
    const won = ev === "won";
    return sendMail(p.email, fill(won ? t.leadWonSubject : t.leadLostSubject, { client: l.client_name }), P(esc(fill(won ? t.leadWonP1 : t.leadLostP1, { client: l.client_name }))));
  }
  if (table === "agency_requests") {
    const { data: r } = await db.from("agency_requests").select("*, agency_leads(client_name), property_units(unit_name)").eq("id", id).single();
    const p = await loadPartner(r.agency_id);
    const t = T[L(p.lang)];
    if (ev === "created") {
      const ok = await tg(`📅 Solicitud de agencia: ${T.es.types[r.type] ?? r.type}\n\n${p.agency_name} · cliente: ${r.agency_leads?.client_name ?? "—"}${r.property_units?.unit_name ? " · unidad " + r.property_units.unit_name : ""}\nFecha preferida: ${r.preferred_date ?? "—"}\n${r.notes ?? ""}\n\nAdmin → Agencias → Solicitudes.`, p.agency_name);
      if (ok) await mark("agency_requests");
      return { ok };
    }
    if (p.is_demo) return { ok: true, skipped: "demo" };
    const type = t.types[r.type] ?? r.type;
    const body = ev === "scheduled" ? fill(t.requestScheduledP1, { type, date: r.preferred_date ? fill(t.on, { date: r.preferred_date }) : "" }) : fill(t.requestDoneP1, { type });
    return sendMail(p.email, fill(t.requestSubject, { type }), P(esc(body)));
  }
  if (table === "agency_commissions") {
    const { data: c } = await db.from("agency_commissions").select("*, agency_leads(client_name), property_units(unit_name)").eq("id", id).single();
    const p = await loadPartner(c.partner_id);
    if (p.is_demo) return { ok: true, skipped: "demo" };
    const t = T[L(p.lang)];
    const kind = t.kinds[c.kind];
    const body = fill(t.commissionP1, { kind, client: c.agency_leads?.client_name ?? "", unit: c.property_units?.unit_name ? fill(t.unitWord, { unit: c.property_units.unit_name }) : "", price: money(c.sale_price, c.currency, p.lang), pct: c.pct, amount: money(c.amount, c.currency, p.lang), status: t.statuses[c.status] ?? c.status });
    return sendMail(p.email, fill(t.commissionSubject, { kind, client: c.agency_leads?.client_name ?? "" }), P(esc(body)));
  }
  return { ok: false, error: "unknown_event" };
}

// ───────── login nudges (item 24) ─────────
async function reminders() {
  const { data: rows, error } = await db.rpc("agency_login_nudge_candidates");
  if (error) return { ok: false, error: error.message };
  const done = [];
  for (const r of rows ?? []) {
    if (r.days >= 14 && r.login_reminders === 2) {
      await tg(`⏰ ${r.agency_name} (${r.email}) lleva ${r.days} días aprobada y no ha entrado nunca al portal (2 recordatorios enviados).`);
      await db.from("listing_partners").update({ login_reminders: 3 }).eq("id", r.partner_id);
      done.push([r.email, "alert"]);
    } else if ((r.days >= 7 && r.login_reminders === 1) || (r.days >= 3 && r.login_reminders === 0)) {
      const m = await welcome(r.partner_id, "reminder").catch((e) => ({ ok: false, error: String(e) }));
      if (m.ok) await db.from("listing_partners").update({ login_reminders: r.login_reminders + 1 }).eq("id", r.partner_id);
      done.push([r.email, m.ok ? "reminder" : m.error]);
    }
  }
  return { ok: true, done };
}

// ───────── email change (item 17) ─────────
async function updateEmail(partnerId, email) {
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: "invalid_email" };
  const p = await loadPartner(partnerId);
  if (p.email === e) return { ok: true, unchanged: true };
  const { data: other } = await db.from("listing_partners").select("id").eq("email", e).neq("id", partnerId).maybeSingle();
  if (other) return { ok: false, error: "email_in_use" };
  if (p.user_id) {
    const { data: staff } = await db.from("profiles").select("role").eq("user_id", p.user_id).maybeSingle();
    if (staff?.role && staff.role !== "lister") return { ok: false, error: "staff_account" };
    const { error } = await db.auth.admin.updateUserById(p.user_id, { email: synthEmail(e), email_confirm: true, app_metadata: { real_email: e, portal: "agencias" } });
    if (error) return { ok: false, error: `auth: ${error.message}` };
    await db.from("profiles").update({ email: e }).eq("user_id", p.user_id);
  }
  const { error: ue } = await db.from("listing_partners").update({ email: e }).eq("id", partnerId);
  if (ue) return { ok: false, error: ue.message };
  await db.from("partner_audit").insert({ partner_id: partnerId, action: "email_change", actor: "admin", detail: { from: p.email, to: e } });
  return { ok: true };
}

// ───────── router ─────────
async function caller(req) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  if (!data?.user) return null;
  const userDb = createClient(SB_URL, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: role } = await userDb.rpc("current_role");
  return { user: data.user, role };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  const hook = !!env("AGENCY_HOOK_SECRET") && req.headers.get("x-agency-hook") === env("AGENCY_HOOK_SECRET");
  const cron = !!env("CRON_SECRET") && req.headers.get("x-cron-secret") === env("CRON_SECRET");
  try {
    if (b.action === "event") return hook ? json(await event(b.table, b.event, b.id)) : json({ ok: false, error: "unauthorized" }, 401);
    if (b.action === "reminders") return cron || hook ? json(await reminders()) : json({ ok: false, error: "unauthorized" }, 401);
    if (b.action === "approve" && hook && b.mode === "auto") return json(await approve(b.application_id, "auto", {}, "auto"));
    const who = await caller(req);
    if (!who) return json({ ok: false, error: "unauthorized" }, 401);
    const isAdmin = who.role === "admin";
    const by = String(who.user.app_metadata?.real_email ?? who.user.email ?? "admin");
    if (b.action === "agreement") {
      const q = db.from("listing_partners").select("*").is("deleted_at", null);
      const { data: p } = isAdmin && b.partner_id ? await q.eq("id", b.partner_id).maybeSingle() : await q.eq("user_id", who.user.id).eq("status", "approved").maybeSingle();
      if (!p) return json({ ok: false, error: "not_found" }, 404);
      return new Response(await partnerPdf(p), { headers: { ...cors, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Unreal-Studio-agreement.pdf"` } });
    }
    if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
    if (b.action === "approve") return json(await approve(b.application_id, "admin", b.opts ?? {}, by));
    if (b.action === "welcome") return json(await welcome(b.partner_id));
    if (b.action === "update_email") return json(await updateEmail(b.partner_id, b.email));
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
