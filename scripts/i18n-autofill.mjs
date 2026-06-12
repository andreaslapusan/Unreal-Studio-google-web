/**
 * i18n-autofill — rellena automáticamente las traducciones que falten.
 *
 * Fuente de verdad: locales/es.json. Para cada idioma destino (en, ro, id), si a
 * una clave le falta su traducción, se traduce con IA (Groq) y se escribe. Así el
 * desarrollo solo mantiene ESPAÑOL y el resto se rellena solo.
 *
 * Uso:  GROQ_API_KEY=... node scripts/i18n-autofill.mjs
 * Si no hay GROQ_API_KEY, no traduce (no rompe el build); solo informa.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('locales');
const BASE = 'es';
const TARGETS = ['en', 'ro', 'id'];
const LANG_NAME = { en: 'English', ro: 'Romanian', id: 'Indonesian' };
const GROQ_KEY = process.env.GROQ_API_KEY;
const MODEL = 'llama-3.3-70b-versatile';

const read = (l) => JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8'));
const write = (l, o) => fs.writeFileSync(path.join(DIR, `${l}.json`), JSON.stringify(o, null, 2) + '\n');

// flatten / unflatten dot-paths
function flat(o, p = '', out = {}) {
  for (const [k, v] of Object.entries(o)) {
    const kk = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, kk, out);
    else out[kk] = v;
  }
  return out;
}
function setDeep(o, dotted, val) {
  const parts = dotted.split('.');
  let cur = o;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

async function translateBatch(entries, lang) {
  // entries: [[key, text], ...] → returns { key: translated }
  const payload = Object.fromEntries(entries);
  const sys = `You are a professional UI translator for a real-estate investment platform (Unreal Studio, Bali).
Translate the VALUES of this JSON from Spanish to ${LANG_NAME[lang]}. Rules:
- Keep the SAME JSON keys, translate only the values.
- Preserve ALL interpolation placeholders EXACTLY: {{like_this}}, {n}, %s, and any HTML tags.
- Keep it concise and natural for UI (buttons, labels, messages). Do not add quotes or commentary.
- Return ONLY a valid JSON object with the same keys and translated values.`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sys }, { role: 'user', content: JSON.stringify(payload) }],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function main() {
  const baseFlat = flat(read(BASE));
  let totalMissing = 0;
  for (const lang of TARGETS) {
    const target = read(lang);
    const tFlat = flat(target);
    const missing = Object.keys(baseFlat).filter((k) => typeof tFlat[k] === 'undefined' && typeof baseFlat[k] === 'string');
    if (!missing.length) { console.log(`[${lang}] completo`); continue; }
    totalMissing += missing.length;
    console.log(`[${lang}] faltan ${missing.length} claves`);
    if (!GROQ_KEY) { console.log('  (sin GROQ_API_KEY → no se traduce)'); continue; }
    // batches de 40
    for (let i = 0; i < missing.length; i += 40) {
      const chunk = missing.slice(i, i + 40).map((k) => [k, baseFlat[k]]);
      try {
        const out = await translateBatch(chunk, lang);
        for (const [k] of chunk) if (out[k] != null) setDeep(target, k, String(out[k]));
        console.log(`  ${lang}: +${Object.keys(out).length} (${i + chunk.length}/${missing.length})`);
      } catch (e) { console.error('  batch falló:', String(e).slice(0, 120)); }
    }
    write(lang, target);
  }
  console.log(totalMissing ? `Total claves rellenadas/pendientes: ${totalMissing}` : 'Todo traducido.');
}
main().catch((e) => { console.error(e); process.exit(0); /* no romper build */ });
