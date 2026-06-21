/**
 * payment-reminders — cron diario. Secuencia de recordatorios de pago por cada
 * pago no recibido, en hora de Bali (UTC+8), EN EL IDIOMA DEL CLIENTE:
 *   7d antes (b7), 2d antes (b2), día del vencimiento (due), 3d después (a3),
 *   y luego cada 7 días (a7, a14…) hasta que se marque pagado.
 * Cada etapa se envía una vez (reminder_stages_sent). Solo a emails reales.
 */
// @ts-nocheck — runtime Deno
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const FROM_DEFAULT = "Unreal Studio <no.reply@unrealstudiobali.com>";
const PORTAL_BASE = Deno.env.get("PORTAL_BASE") ?? "https://unrealstudiobali.com";
const BALI_TZ = "Asia/Makassar";

const TR = {"es": {"b7_subject": "Tu próximo pago vence en 7 días", "b7_lead": "Te recordamos que se acerca la fecha límite de tu próximo pago.", "b7_when": "Quedan 7 días para la fecha límite.", "b2_subject": "Tu próximo pago vence en 2 días", "b2_lead": "Tu próximo pago está muy próximo a su fecha límite.", "b2_when": "Quedan 2 días para la fecha límite.", "due_subject": "Tu pago vence hoy", "due_lead": "Hoy es la fecha límite para que el importe quede recibido por Unreal Studio. Si tienes cualquier dificultad para completarlo, ponte en contacto con nuestro equipo cuanto antes para que podamos ayudarte y evitar posibles penalizaciones por demora.", "due_when": "La fecha límite es hoy.", "a3_subject": "Tu pago ha vencido — estamos para ayudarte", "a3_lead": "Tu pago venció hace 3 días y aún no nos consta recibido. Si tienes cualquier dificultad o duda, por favor ponte en contacto con nuestro equipo cuanto antes; te ayudaremos a regularizarlo y a evitar posibles penalizaciones por demora.", "a3_when": "Lleva 3 días de retraso.", "aN_subject": "Tu pago lleva {{n}} días vencido", "aN_lead": "Tu pago lleva {{n}} días vencido y aún no nos consta recibido. Te pedimos que regularices la situación lo antes posible. Si necesitas ayuda, escríbenos y lo resolvemos juntos.", "aN_when": "Lleva {{n}} días de retraso.", "hi": "Hola {{name}},", "paymentFor": "Pago correspondiente a {{project}} — {{label}}.", "deadlineLabel": "Fecha límite para que el importe sea recibido por Unreal Studio:", "recommendation": "Por los tiempos de las transferencias internacionales, te recomendamos iniciar el pago con varios días de margen para que llegue a tiempo. Si ya lo has realizado, puedes ignorar este mensaje. ¡Gracias!", "cta": "Ver mi portal", "obraTitle": "Avance de obra", "obraProgress": "Progreso de construcción:", "obraPhotos": "Ver las últimas fotos de obra →", "footer": "¿Dudas? Responde a este correo: hello@unrealstudiobali.com"}, "en": {"b7_subject": "Your next payment is due in 7 days", "b7_lead": "We remind you that the deadline for your next payment is approaching.", "b7_when": "There are 7 days left until the deadline.", "b2_subject": "Your next payment is due in 2 days", "b2_lead": "Your next payment is very close to its deadline.", "b2_when": "There are 2 days left until the deadline.", "due_subject": "Your payment is due today", "due_lead": "Today is the deadline for the amount to be received by Unreal Studio. If you have any difficulty completing it, please contact our team as soon as possible so we can help you and avoid possible late penalties.", "due_when": "The deadline is today.", "a3_subject": "Your payment is overdue — we're here to help", "a3_lead": "Your payment was due 3 days ago and we still haven't received it. If you have any difficulty or doubt, please contact our team as soon as possible; we'll help you regularize it and avoid possible late penalties.", "a3_when": "It's been 3 days overdue.", "aN_subject": "Your payment has been overdue for {{n}} days", "aN_lead": "Your payment has been overdue for {{n}} days and we still haven't received it. We ask you to regularize the situation as soon as possible. If you need help, write to us and we'll resolve it together.", "aN_when": "It's been {{n}} days overdue.", "hi": "Hello {{name}},", "paymentFor": "Payment for {{project}} — {{label}}.", "deadlineLabel": "Deadline for the amount to be received by Unreal Studio:", "recommendation": "Due to international transfer times, we recommend starting the payment with several days of margin so it arrives on time. If you've already done it, you can ignore this message. Thanks!", "cta": "View my portal", "obraTitle": "Construction progress", "obraProgress": "Construction progress:", "obraPhotos": "View the latest construction photos →", "footer": "Doubts? Reply to this email: hello@unrealstudiobali.com"}, "ro": {"b7_subject": "Următorul tău plată expiră în 7 zile", "b7_lead": "Îți reamintim că se apropie termenul limită pentru următorul tău plată.", "b7_when": "Mai sunt 7 zile până la termenul limită.", "b2_subject": "Următorul tău plată expiră în 2 zile", "b2_lead": "Următorul tău plată este foarte aproape de termenul limită.", "b2_when": "Mai sunt 2 zile până la termenul limită.", "due_subject": "Plata ta expiră astăzi", "due_lead": "Astăzi este termenul limită pentru a primi suma de către Unreal Studio. Dacă întâmpini dificultăți în a o finaliza, te rog să ne contactezi cât mai curând posibil pentru a te ajuta și a evita eventualele penalități pentru întârziere.", "due_when": "Termenul limită este astăzi.", "a3_subject": "Plata ta a expirat — suntem aici pentru a te ajuta", "a3_lead": "Plata ta a expirat acum 3 zile și încă nu am primit confirmarea. Dacă ai întâmpinat dificultăți sau ai dubii, te rog să ne contactezi cât mai curând posibil; te vom ajuta să regularizezi situația și să eviți eventualele penalități pentru întârziere.", "a3_when": "Sunt 3 zile de întârziere.", "aN_subject": "Plata ta a expirat de {{n}} zile", "aN_lead": "Plata ta a expirat de {{n}} zile și încă nu am primit confirmarea. Te rugăm să regularizezi situația cât mai curând posibil. Dacă ai nevoie de ajutor, scrie-ne și o să rezolvăm împreună.", "aN_when": "Sunt {{n}} zile de întârziere.", "hi": "Salut {{name}},", "paymentFor": "Plată pentru {{project}} — {{label}}.", "deadlineLabel": "Termenul limită pentru a primi suma de către Unreal Studio:", "recommendation": "Din cauza timpilor de transfer internațional, te recomandăm să inițiezi plata cu câteva zile înainte pentru a ajunge la timp. Dacă ai făcut deja plata, poți ignora acest mesaj. Mulțumim!", "cta": "Vizualizează portalul meu", "obraTitle": "Stadiul lucrărilor", "obraProgress": "Progresul construcției:", "obraPhotos": "Vizualizează ultimele fotografii de pe șantier →", "footer": "Întrebări? Răspunde la acest e-mail: hello@unrealstudiobali.com"}, "id": {"b7_subject": "Pembayaran Anda Jatuh Tempo dalam 7 Hari", "b7_lead": "Kami mengingatkan Anda bahwa batas waktu pembayaran Anda sudah dekat.", "b7_when": "Tersisa 7 hari hingga batas waktu.", "b2_subject": "Pembayaran Anda Jatuh Tempo dalam 2 Hari", "b2_lead": "Pembayaran Anda sudah sangat dekat dengan batas waktu.", "b2_when": "Tersisa 2 hari hingga batas waktu.", "due_subject": "Pembayaran Anda Jatuh Tempo Hari Ini", "due_lead": "Hari ini adalah batas waktu untuk pembayaran Anda diterima oleh Unreal Studio. Jika Anda mengalami kesulitan, hubungi tim kami secepatnya agar kami dapat membantu Anda dan menghindari denda keterlambatan.", "due_when": "Batas waktu adalah hari ini.", "a3_subject": "Pembayaran Anda Telah Jatuh Tempo — Kami Siap Membantu", "a3_lead": "Pembayaran Anda telah jatuh tempo 3 hari yang lalu dan belum kami terima. Jika Anda mengalami kesulitan atau keraguan, hubungi tim kami secepatnya; kami akan membantu Anda menyelesaikannya dan menghindari denda keterlambatan.", "a3_when": "Telah 3 hari keterlambatan.", "aN_subject": "Pembayaran Anda Telah Jatuh Tempo Selama {{n}} Hari", "aN_lead": "Pembayaran Anda telah jatuh tempo selama {{n}} hari dan belum kami terima. Kami meminta Anda untuk menyelesaikan masalah ini secepat mungkin. Jika Anda membutuhkan bantuan, tulis kepada kami dan kita selesaikan bersama.", "aN_when": "Telah {{n}} hari keterlambatan.", "hi": "Halo {{name}},", "paymentFor": "Pembayaran untuk {{project}} — {{label}}.", "deadlineLabel": "Batas waktu untuk pembayaran diterima oleh Unreal Studio:", "recommendation": "Karena waktu transfer internasional, kami sarankan Anda untuk memulai pembayaran beberapa hari sebelumnya agar dapat diterima tepat waktu. Jika Anda sudah melakukan pembayaran, Anda dapat mengabaikan pesan ini. Terima kasih!", "cta": "Lihat Portal Saya", "obraTitle": "Perkembangan Proyek", "obraProgress": "Progres konstruksi:", "obraPhotos": "Lihat foto-foto proyek terbaru →", "footer": "Pertanyaan? Balas surel ini: hello@unrealstudiobali.com"}};
function tr(lang, key, vars) {
  const L = (lang || "es").slice(0, 2);
  let s = (TR[L] && TR[L][key]) || TR.es[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll("{{" + k + "}}", String(vars[k]));
  return s;
}

function smtpConfigured() { return Boolean(Deno.env.get("SMTP_HOST") && Deno.env.get("SMTP_USER") && Deno.env.get("SMTP_PASS")); }
async function sendMail(msg) {
  const host = Deno.env.get("SMTP_HOST"); const user = Deno.env.get("SMTP_USER"); const pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) throw new Error("SMTP not configured");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");
  const from = Deno.env.get("MAIL_FROM") ?? FROM_DEFAULT;
  const UNSUB = { "List-Unsubscribe": "<mailto:hello@unrealstudiobali.com?subject=unsubscribe>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  const toText = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try { await client.send({ from, to: msg.to, replyTo: "hello@unrealstudiobali.com", subject: msg.subject, content: toText(msg.html) || msg.subject, html: msg.html, headers: UNSUB }); }
  finally { await client.close(); }
}

const fmtMoney = (n, c) => { try { return new Intl.NumberFormat(c === "IDR" ? "id-ID" : "es-ES", { style: "currency", currency: c || "IDR", maximumFractionDigits: 0, useGrouping: "always" }).format(n); } catch { return `${c} ${n}`; } };
const fmtDate = (s, lang) => { try { return new Date(s + "T00:00:00").toLocaleDateString((lang || "es").slice(0,2), { day: "2-digit", month: "long", year: "numeric" }); } catch { return s; } };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function baliToday() { return new Date().toLocaleDateString("en-CA", { timeZone: BALI_TZ }); }
function daysBetween(a, b) { return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000); }

function stageFor(daysUntil, lang) {
  if (daysUntil === 7) return { key: "b7", subject: tr(lang,"b7_subject"), lead: tr(lang,"b7_lead"), when: tr(lang,"b7_when"), tone: "calm" };
  if (daysUntil === 2) return { key: "b2", subject: tr(lang,"b2_subject"), lead: tr(lang,"b2_lead"), when: tr(lang,"b2_when"), tone: "calm" };
  if (daysUntil === 0) return { key: "due", subject: tr(lang,"due_subject"), lead: tr(lang,"due_lead"), when: tr(lang,"due_when"), tone: "alert" };
  if (daysUntil === -3) return { key: "a3", subject: tr(lang,"a3_subject"), lead: tr(lang,"a3_lead"), when: tr(lang,"a3_when"), tone: "alert" };
  if (daysUntil <= -7 && Math.abs(daysUntil) % 7 === 0) { const n = Math.abs(daysUntil); return { key: `a${n}`, subject: tr(lang,"aN_subject",{n}), lead: tr(lang,"aN_lead",{n}), when: tr(lang,"aN_when",{n}), tone: "alert" }; }
  return null;
}

function reminderHtml(r, st, lang) {
  const unit = r.unit_number ? ` · ${esc(r.unit_number)}` : "";
  const name = esc(r.client_name || "");
  const alert = st.tone === "alert";
  const obra = (typeof r.completion_percent === "number" || r.construction_update_url)
    ? `<div style="background:#fff;border:1px solid rgba(63,35,5,.12);border-radius:12px;padding:18px 20px;margin:18px 0"><div style="font-size:11px;letter-spacing:1.5px;color:rgba(63,35,5,.5);text-transform:uppercase;margin-bottom:8px">${tr(lang,"obraTitle")}</div>${typeof r.completion_percent === "number" ? `<div style="font-size:13px;margin-bottom:8px">${tr(lang,"obraProgress")} <b>${r.completion_percent}%</b></div><div style="height:8px;background:rgba(63,35,5,.1);border-radius:99px;overflow:hidden;margin-bottom:4px"><div style="height:100%;width:${Math.max(0, Math.min(100, r.completion_percent))}%;background:#3F2305"></div></div>` : ""}${r.construction_update_url ? `<div style="margin-top:12px"><a href="${esc(r.construction_update_url)}" style="color:#3F2305;font-weight:700;font-size:13px">${tr(lang,"obraPhotos")}</a></div>` : ""}</div>` : "";
  return `
<div style="max-width:600px;margin:0 auto;background:#F3E5D8;padding:30px;font-family:Manrope,Arial,sans-serif;color:#3F2305">
  <div style="text-align:center;margin-bottom:22px">
    <div style="font-family:'DM Serif Display',Georgia,serif;font-size:24px;font-weight:700;color:#3F2305;letter-spacing:.3px">Unreal Studio Bali</div>
    <div style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:13px;color:rgba(63,35,5,.55);margin-top:2px">Beyond the Ordinary, Inside the Unreal</div>
  </div>
  <div style="background:#fff;border-radius:16px;padding:32px 30px">
    <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:23px;margin:0 0 10px">${tr(lang,"hi",{name})}</h1>
    <p style="font-size:15px;line-height:1.7;color:rgba(63,35,5,.85);margin:0 0 6px">${st.lead}</p>
    <p style="font-size:15px;line-height:1.7;color:rgba(63,35,5,.85);margin:0 0 4px">${tr(lang,"paymentFor",{project:`<b>${esc(r.project_name || "")}${unit}</b>`, label: esc(r.payment_label || "")})}</p>
    <div style="background:${alert ? "#fbeaea" : "#F3E5D8"};border-radius:12px;padding:18px 20px;margin:20px 0;text-align:center">
      <div style="font-size:12px;letter-spacing:1px;color:rgba(63,35,5,.6);text-transform:uppercase">${esc(r.payment_label || "")}</div>
      <div style="font-size:30px;font-weight:800;margin:6px 0">${fmtMoney(Number(r.amount), r.currency || "IDR")}</div>
      <div style="font-size:13px;color:rgba(63,35,5,.7)">${tr(lang,"deadlineLabel")}</div>
      <div style="font-size:16px;font-weight:700;margin-top:2px">${fmtDate(r.due_date, lang)}</div>
      <div style="font-size:13px;font-weight:700;margin-top:8px;color:${alert ? "#c0392b" : "#3F2305"}">${st.when}</div>
    </div>
    <p style="font-size:13px;line-height:1.6;color:rgba(63,35,5,.7);margin:0 0 4px">${tr(lang,"recommendation")}</p>
    ${obra}
    <div style="text-align:center;margin-top:26px"><a href="${PORTAL_BASE}/cliente" style="display:inline-block;background:#3F2305;color:#fff;text-decoration:none;padding:13px 28px;border-radius:99px;font-weight:700;font-size:14px">${tr(lang,"cta")}</a></div>
  </div>
  <div style="text-align:center;font-size:11px;color:rgba(63,35,5,.5);margin-top:16px">Unreal Studio · Bali, Indonesia<br>${tr(lang,"footer")}</div>
</div>`.replace(/>\s+</g, "><").replace(/<p style="(?![^"]*text-align)/g,'<p style="text-align:justify;').trim();
}

function authorized(req) {
  const auth = req.headers.get("Authorization") ?? "";
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (svc && auth === `Bearer ${svc}`) return true;
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return true;
  return false;
}

Deno.serve(async (req) => {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data, error } = await supabase.rpc("payment_reminders_candidates");
  if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
  const candidates = data?.payments ?? [];
  if (!smtpConfigured()) return new Response(JSON.stringify({ success: false, error: "transport_not_configured", candidates: candidates.length }), { status: 503 });
  // Independencia total entre titulares: 1 correo SEPARADO por titular, cada uno
  // con SU nombre. holders [{name,email}] si existen; si no, email principal +
  // extra_emails (con el nombre de la ficha). Dedupe por email.
  const titularsOf = (r) => {
    const out = [];
    const fb = r?.lang || "es";
    const hs = Array.isArray(r?.client_holders) ? r.client_holders : null;
    const holderByEmail = (em) => (hs || []).find((h) => (h?.email || "").trim().toLowerCase() === em);
    // Participantes de ESTA propiedad definidos => el recordatorio va SOLO a esos
    // emails, tomándolos VERBATIM (aunque ya no casen con un holder), nunca a nadie.
    const hp = Array.isArray(r?.holder_participants) && r.holder_participants.length ? r.holder_participants : null;
    if (hp) {
      for (const x of hp) { const em = (x?.email || "").trim(); if (!em || !em.includes("@")) continue; const h = holderByEmail(em.toLowerCase()); out.push({ name: (h?.name || r?.client_name || "").trim(), email: em, lang: (h?.lang || fb) }); }
    } else if (hs && hs.length) {
      for (const h of hs) { const em = (h?.email || "").trim(); if (em && em.includes("@")) out.push({ name: (h?.name || r?.client_name || "").trim(), email: em, lang: (h?.lang || fb) }); }
    }
    if (!out.length && !hp) {
      const pe = (r?.client_email || "").trim(); if (pe && pe.includes("@")) out.push({ name: (r?.client_name || "").trim(), email: pe, lang: fb });
      for (const e of (r?.client_extra_emails || [])) { const em = (e || "").trim(); if (em && em.includes("@")) out.push({ name: (r?.client_name || "").trim(), email: em, lang: fb }); }
    }
    const seen = new Set();
    return out.filter((x) => { const k = x.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  const today = baliToday();
  let sent = 0; const failed = [];
  for (const r of candidates) {
    const daysUntil = daysBetween(today, String(r.due_date).slice(0, 10));
    const stKey = stageFor(daysUntil, r.lang || "es");
    if (!stKey) continue;
    const already = r.reminder_stages_sent || [];
    if (already.includes(stKey.key)) continue;
    let anySent = false;
    for (const tt of titularsOf(r)) {
      // Cada titular en SU idioma (subject + cuerpo).
      const tlang = ["es","en","ro","id"].includes(tt.lang) ? tt.lang : (r.lang || "es");
      const st = stageFor(daysUntil, tlang);
      try {
        await sendMail({ to: tt.email, subject: `${st.subject} · Unreal Studio`, html: reminderHtml({ ...r, client_name: tt.name }, st, tlang) });
        sent++; anySent = true;
      } catch (e) { failed.push(`${r.payment_id} ${tt.email}: ${String(e)}`); }
    }
    // La etapa se marca una vez por pago (no por destinatario) si al menos uno salió.
    if (anySent) { try { await supabase.rpc("payment_reminder_mark_stage", { p_payment_id: r.payment_id, p_stage: stKey.key }); } catch (e) { failed.push(`mark ${r.payment_id}: ${String(e)}`); } }
  }
  return new Response(JSON.stringify({ success: true, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
