#!/usr/bin/env node
/**
 * Pre-render de Open Graph por proyecto y por idioma.
 *
 * El sitio es un SPA estático servido por nginx. Los crawlers de WhatsApp /
 * Telegram / Facebook NO ejecutan JS, así que solo leen los <meta> del
 * index.html estático → preview genérico en español para TODOS los enlaces.
 *
 * Este script (postbuild) genera, a partir del dist/index.html ya construido,
 * un index.html por cada proyecto × idioma en su ruta real
 * (dist/<locale>/proyecto/<slug>/index.html), con título, descripción, imagen
 * y og:locale CORRECTOS y en el idioma del enlace. nginx ya sirve estos
 * index.html anidados (try_files $uri $uri/ /index.html), así que el crawler
 * recibe el preview bueno y el usuario sigue recibiendo el SPA (que rehidrata
 * normal).
 *
 * Si Supabase falla en build (sin red, proyecto caído) NO rompe el build:
 * avisa y sale 0, dejando el OG genérico.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");
const TEMPLATE = resolve(DIST, "index.html");
const ORIGIN = "https://unrealstudiobali.com";

const SUPABASE_URL = "https://rnielxgackkshnatvagj.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWVseGdhY2trc2huYXR2YWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzE4NTEsImV4cCI6MjA4NjQwNzg1MX0.5X6k4TVLrH1AJMLw797l4LWTy3cROhh-Q4gAPl-GPJY";

// Idiomas con URL propia. 'es' es el x-default (también ruta sin prefijo).
const LOCALES = [
  { code: "es", prefix: "", ogLocale: "es_ES" },
  { code: "es", prefix: "es", ogLocale: "es_ES" },
  { code: "en", prefix: "en", ogLocale: "en_US" },
  { code: "ro", prefix: "ro", ogLocale: "ro_RO" },
  { code: "id", prefix: "id", ogLocale: "id_ID" },
];

// ---- slug SEO: réplica EXACTA de lib/projectUrl.ts (no importable desde .mjs) ----
function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}
function locationParts(loc) {
  return String(loc || "")
    .split(",")
    .map((p) => slugify(p))
    .filter((p) => p && p !== "bali" && p !== "indonesia");
}
function projectSeoSlug(project) {
  const locs = locationParts(project.location);
  const slug = project.slug;
  if (locs.length === 0) return slug;
  const firstLocSuffix = `-${locs[0]}`;
  if (slug.endsWith(firstLocSuffix) || slug.includes(firstLocSuffix + "-")) return slug;
  return `${slug}-${locs.join("-")}`;
}

// ---- helpers ----
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function plain(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")     // quita HTML
    .replace(/\s+/g, " ")
    .trim();
}
function truncate(s, n) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
function localizedDescription(p, code) {
  const raw =
    (code === "en" && p.description_en) ||
    (code === "ro" && p.description_ro) ||
    (code === "id" && p.description_id) ||
    p.description ||
    "";
  return truncate(plain(raw), 200);
}
function ogImage(image) {
  if (!image) return `${ORIGIN}/img/og-image.webp`;
  if (/^https?:\/\//i.test(image)) return image;
  // URL pública directa del bucket. (El endpoint /render/image da 403: las
  // transformaciones no están habilitadas en este plan.)
  return `${SUPABASE_URL}/storage/v1/object/public/images/${image}`;
}

// Reemplaza (o inserta antes de </head>) un <meta property|name="key" content="...">.
function setMeta(html, key, value, attr = "property") {
  const v = esc(value);
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"\\s+content=")[^"]*(")`, "i");
  if (re.test(html)) return html.replace(re, `$1${v}$2`);
  return html.replace(/<\/head>/i, `    <meta ${attr}="${key}" content="${v}">\n  </head>`);
}
function setTitle(html, title) {
  const t = esc(title);
  if (/<title>[^<]*<\/title>/i.test(html)) return html.replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`);
  return html.replace(/<\/head>/i, `    <title>${t}</title>\n  </head>`);
}
// Elimina un <meta property|name="key" ...> (p.ej. dimensiones de imagen que ya no son ciertas).
function removeMeta(html, key) {
  const re = new RegExp(`\\s*<meta\\s+(?:property|name)="${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"[^>]*>`, "i");
  return html.replace(re, "");
}
function setCanonical(html, url) {
  const u = esc(url);
  if (/<link\s+rel="canonical"[^>]*>/i.test(html)) {
    return html.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${u}">`);
  }
  return html.replace(/<\/head>/i, `    <link rel="canonical" href="${u}">\n  </head>`);
}

async function main() {
  if (!existsSync(TEMPLATE)) {
    console.warn("[prerender-og] dist/index.html no existe; nada que hacer.");
    return;
  }
  const template = readFileSync(TEMPLATE, "utf8");

  // ---- HOME por idioma (independiente de Supabase) ----
  // El dominio a secas (/) usa dist/index.html, que ya está en INGLÉS por defecto.
  // Para /es /en /ro /id generamos dist/<prefix>.html con su OG (nginx: try_files
  // $uri.html). Copy estático de marketing (no viene de BD).
  const HOME = [
    { prefix: "en", ogLocale: "en_US", title: "Unreal Studio Bali | Real estate investment in Bali from €75k", desc: "Real estate developer in Bali for international investors. Villas, lofts and apartments in Uluwatu, Canggu and Tabanan from €75,000. Projected ROI 15-28% per year. Remote purchase with POA. Offices in Madrid & Bali.", alt: "Investment villa in Bali — Unreal Studio" },
    { prefix: "es", ogLocale: "es_ES", title: "Unreal Studio Bali | Inversión inmobiliaria en Bali desde 75k€", desc: "Promotor inmobiliario en Bali para inversores españoles. Villas, lofts y apartamentos en Uluwatu, Canggu y Tabanan desde 75.000€. ROI proyectado 15-28% anual. Compra remota con POA. Sede en Madrid + Bali.", alt: "Villa de inversión en Bali — Unreal Studio" },
    { prefix: "ro", ogLocale: "ro_RO", title: "Unreal Studio Bali | Investiții imobiliare în Bali de la 75k€", desc: "Dezvoltator imobiliar în Bali pentru investitori internaționali. Vile, lofturi și apartamente în Uluwatu, Canggu și Tabanan de la 75.000€. ROI estimat 15-28% pe an. Achiziție la distanță cu POA. Birouri în Madrid și Bali.", alt: "Vilă de investiție în Bali — Unreal Studio" },
    { prefix: "id", ogLocale: "id_ID", title: "Unreal Studio Bali | Investasi properti di Bali mulai €75rb", desc: "Pengembang properti di Bali untuk investor internasional. Vila, loft, dan apartemen di Uluwatu, Canggu, dan Tabanan mulai €75.000. Proyeksi ROI 15-28% per tahun. Pembelian jarak jauh dengan POA. Kantor di Madrid & Bali.", alt: "Vila investasi di Bali — Unreal Studio" },
  ];
  let homeCount = 0;
  for (const h of HOME) {
    const url = `${ORIGIN}/${h.prefix}`;
    let html = template;
    html = setTitle(html, h.title);
    html = setMeta(html, "description", h.desc, "name");
    html = setMeta(html, "og:type", "website");
    html = setMeta(html, "og:title", h.title);
    html = setMeta(html, "og:description", h.desc);
    html = setMeta(html, "og:image:alt", h.alt);
    html = setMeta(html, "og:url", url);
    html = setMeta(html, "og:locale", h.ogLocale);
    html = setMeta(html, "twitter:title", h.title, "name");
    html = setMeta(html, "twitter:description", h.desc, "name");
    html = setCanonical(html, url);
    writeFileSync(resolve(DIST, `${h.prefix}.html`), html, "utf8");
    homeCount++;
  }
  console.log(`[prerender-og] Home por idioma: ${homeCount} ficheros (dist/<lang>.html).`);

  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  let projects = [];
  try {
    const { data, error } = await sb
      .from("projects")
      .select("slug,name,location,description,description_en,description_ro,description_id,image");
    if (error) throw error;
    projects = data || [];
  } catch (e) {
    console.warn("[prerender-og] No se pudo leer Supabase, se deja el OG genérico:", e?.message || e);
    return;
  }

  let count = 0;
  for (const p of projects) {
    if (!p.slug) continue;
    const seoSlug = projectSeoSlug(p);
    // Cubrimos el slug SEO (el que comparte la web) y el slug corto (enlaces viejos).
    const slugs = Array.from(new Set([seoSlug, p.slug]));
    const img = ogImage(p.image);

    for (const loc of LOCALES) {
      const desc = localizedDescription(p, loc.code);
      const title = `${p.name} | Unreal Studio Bali`;
      const canonical = `${ORIGIN}${loc.prefix ? "/" + loc.prefix : ""}/proyecto/${seoSlug}`;

      for (const slug of slugs) {
        const url = `${ORIGIN}${loc.prefix ? "/" + loc.prefix : ""}/proyecto/${slug}`;
        let html = template;
        html = setTitle(html, title);
        html = setMeta(html, "description", desc, "name");
        html = setMeta(html, "og:type", "article");
        html = setMeta(html, "og:title", title);
        html = setMeta(html, "og:description", desc);
        html = setMeta(html, "og:image", img);
        html = setMeta(html, "og:image:alt", p.name);
        // Dimensiones del template (1200x630) no aplican a la imagen real del proyecto.
        html = removeMeta(html, "og:image:width");
        html = removeMeta(html, "og:image:height");
        html = setMeta(html, "og:url", url);
        html = setMeta(html, "og:locale", loc.ogLocale);
        html = setMeta(html, "twitter:title", title, "name");
        html = setMeta(html, "twitter:description", desc, "name");
        html = setMeta(html, "twitter:image", img, "name");
        html = setCanonical(html, canonical);

        // Fichero <slug>.html (no carpeta/index.html) para que nginx lo sirva con
        // try_files $uri.html SIN redirigir a barra final.
        const outDir = resolve(DIST, ...(loc.prefix ? [loc.prefix] : []), "proyecto");
        mkdirSync(outDir, { recursive: true });
        writeFileSync(resolve(outDir, `${slug}.html`), html, "utf8");
        count++;
      }
    }
  }
  console.log(`[prerender-og] Generados ${count} index.html (${projects.length} proyectos × ${LOCALES.length} idiomas).`);
}

main().catch((e) => {
  console.warn("[prerender-og] Error no fatal, build continúa:", e?.message || e);
});
