/**
 * gen-icons.mjs — inyecta en index.html el SUBSET de Material Symbols con todos los
 * iconos usados. Une lo escaneado del codigo con una BASELINE embebida (asi NUNCA
 * sale vacio, ni aunque el escaneo falle en algun entorno). Idempotente: limpia el
 * icon_names anterior antes de inyectar. Corre en prebuild (tambien en Docker).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = ["ac_unit", "active", "add", "add_photo_alternate", "analytics", "apartment", "architecture", "archivos", "arrow_back", "arrow_downward", "arrow_forward", "article", "auto", "badge", "beach_access", "bed", "bolt", "button", "calculate", "calendar_month", "calendar_today", "campaign", "chair", "chat", "check_circle", "chevron_left", "chevron_right", "cifrada", "cleaning_services", "close", "completado", "concierge", "construction", "deck", "delete", "description", "desktop_windows", "done", "download", "edit", "electrical_services", "email", "emoji_objects", "event", "event_note", "expand_less", "expand_more", "fitness_center", "folder", "general", "groups", "handshake", "help", "hidden", "history", "home_work", "image", "info", "instagram", "invisible", "key", "kitchen", "language", "late_checkin", "lazy", "link", "local_bar", "local_laundry_service", "local_parking", "location_on", "lock", "lock_reset", "login", "logout", "lunch_dining", "mail", "manual", "map", "meeting", "menu", "mode_fan_off", "movie", "name", "none", "north_east", "open_in_new", "other", "outdoor_grill", "pago", "palette", "park", "payments", "pending", "person", "person_add", "picture_as_pdf", "play_arrow", "play_circle", "pool", "post_add", "print", "priority_high", "progress_activity", "public", "radio_button_unchecked", "receipt_long", "refresh", "restart_alt", "right", "schedule", "search", "security", "sell", "send", "sentiment_dissatisfied", "settings", "share", "shield", "shower", "sort", "spa", "sports_esports", "stamp", "straighten", "submit", "supabase", "text", "transparent", "trending_down", "two_wheeler", "upload_file", "vacaciones", "vacation_request", "video", "videocam", "visibility", "visibility_off", "warehouse", "warning", "water", "waving_hand", "web_form_contacto", "weekend", "welcome", "wifi", "zoom_in"];

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!/node_modules|dist|\.git/.test(p)) walk(p, acc); }
    else if (/\.(tsx?|jsx?)$/.test(e)) acc.push(p);
  }
  return acc;
}

const ICON_RE = /material-symbols-(?:outlined|rounded|sharp)/;
const BAD = new Set('outlined rounded sharp admin all always approved aprobada asc brand checkin client_login clients cobros compra config currency custom days_off desc desarrollo employees environment featured floating_fab generic inactive labels list long main marketing narrow notice numeric password pdf pendiente portal product project_main recibido rejected sending session short smooth agencias agencias_registrar blogs contact cta_floating cta_mobile_menu cta_navbar dashboard faqs gallery floor_plans logo notifications projects users calendar arquitectura cliente'.split(/\s+/));
const icons = new Set(BASELINE);
for (const f of walk('pages').concat(walk('components'))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/material-symbols-(?:outlined|rounded|sharp)[^>]*>\s*([a-z0-9_]+)\s*</g)) icons.add(m[1]);
  for (const line of s.split('\n')) { if (!ICON_RE.test(line)) continue; for (const m of line.matchAll(/['"]([a-z][a-z0-9_]{2,})['"]/g)) icons.add(m[1]); }
  for (const m of s.matchAll(/icon:\s*['"]([a-z0-9_]+)['"]/g)) icons.add(m[1]);
}
const list = [...icons].filter((i) => !BAD.has(i) && !/\d{2,}/.test(i)).sort();
const names = list.join(',');
let html = readFileSync('index.html', 'utf8');
html = html.replace(/&icon_names=[a-z0-9_,]*/g, ''); // limpia anterior
html = html.replace(/(family=Material\+Symbols\+Outlined:[^&"]*)(&display=block)/g, `$1&icon_names=${names}$2`);
writeFileSync('index.html', html);
console.log(`icons -> subset de ${list.length} iconos inyectado`);
