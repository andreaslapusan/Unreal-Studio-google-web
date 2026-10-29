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

// Idiomas con URL propia. 'es' es el x-default (las rutas sin prefijo hacen 301 en nginx).
const LOCALES = [
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
// Sufijo de marca solo si el title cabe en 60 caracteres (igual que BlogDetail.tsx).
const withBrand = (t) => (t.length <= 44 ? `${t} | Unreal Studio` : t);
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
    return html.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${u}" data-locale-seo="1">`);
  }
  return html.replace(/<\/head>/i, `    <link rel="canonical" href="${u}" data-locale-seo="1">\n  </head>`);
}


// ---- Contenido real pre-renderizado (crawlers sin JS: Bing, ChatGPT, Perplexity) ----
const LANGS = ["es", "en", "ro", "id"];
const OG_LOCALE = { es: "es_ES", en: "en_US", ro: "ro_RO", id: "id_ID" };
const L10N = Object.fromEntries(
  LANGS.map((c) => [c, JSON.parse(readFileSync(resolve(__dirname, "..", "locales", `${c}.json`), "utf8"))])
);
function tr(code, key, fallback = "") {
  const get = (c) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), L10N[c]);
  const v = get(code) ?? get("es");
  return typeof v === "string" ? v : fallback;
}
function loc(row, field, code) {
  return (code !== "es" && row[`${field}_${code}`]) || row[field] || "";
}
function setLang(html, code) {
  html = html.replace(/<html lang="[^"]*">/i, `<html lang="${code}">`);
  return html.replace(/(<meta http-equiv="content-language" content=")[^"]*(")/i, `$1${code}$2`);
}
// hreflang con la MISMA marca que <LocaleSeo/>: al montar los sustituye por idénticos.
// `tail` es un string (mismo path en los 4 idiomas) o un mapa {es,en,…} (landings: solo los presentes).
const tailsOf = (tail) => (typeof tail === "string" ? Object.fromEntries(LANGS.map((l) => [l, tail])) : tail);
function setAlternates(html, tail) {
  const tails = tailsOf(tail);
  const links = [
    ...Object.entries(tails).map(([l, t]) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}/${l}${t}" data-locale-seo="1">`),
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/es${tails.es ?? Object.values(tails)[0]}" data-locale-seo="1">`,
  ];
  return html.replace(/<\/head>/i, `    ${links.join("\n    ")}\n  </head>`);
}
// data-prerender-ld: <LocaleSeo/> los quita al navegar a otra ruta y las páginas no duplican su JSON-LD.
function addJsonLd(html, objs) {
  const tags = objs
    .filter(Boolean)
    .map((o) => `<script type="application/ld+json" data-prerender-ld="1">${JSON.stringify({ "@context": "https://schema.org", ...o }).replace(/</g, "\\u003c")}</script>`);
  return tags.length ? html.replace(/<\/head>/i, `    ${tags.join("\n    ")}\n  </head>`) : html;
}
function breadcrumb(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  };
}
// El HTML va DENTRO de #root: createRoot lo sustituye al montar y #app-boot lo tapa
// hasta entonces (index.html ignora [data-prerender] al decidir quitar la capa) → sin flash.
function setBody(html, inner) {
  return html.replace(
    '<div id="root"></div>',
    `<div id="root"><div data-prerender="1">${inner}</div></div><noscript><style>#app-boot{display:none}</style></noscript>`
  );
}
function sanitize(h) {
  return String(h || "")
    .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
// Markdown mínimo de public/legal (#, ##, ###, párrafos, **negrita**).
function mdToHtml(md) {
  return md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const m = b.match(/^(#{1,4})\s+(.*)$/);
      const inline = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      if (m && !b.includes("\n")) return `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
      return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}
function navHtml(code) {
  const items = [["", "nav.home"], ["/proyectos", "nav.projects"], ["/blog", "nav.blog"], ["/faq", "nav.faq"], ["/agendar", "nav.scheduleCall"], ["/contacto", "nav.contact"], ["/agencias", "nav.agencies"]];
  return `<header><nav><ul>${items.map(([t, k]) => `<li><a href="/${code}${t}">${esc(tr(code, k))}</a></li>`).join("")}</ul></nav></header>`;
}
function footerHtml(code, tail) {
  const legal = [["/privacidad", "footer.privacy"], ["/terminos", "footer.terms"], ["/aviso-legal", "footer.legalNotice"]];
  // Direcciones completas solo en /contacto (regla de negocio).
  return `<footer><p>Unreal Studio Bali · Madrid · Bali · <a href="mailto:hello@unrealstudiobali.com">hello@unrealstudiobali.com</a> · +34 625 710 770</p><ul>${legal.map(([t, k]) => `<li><a href="/${code}${t}">${esc(tr(code, k))}</a></li>`).join("")}</ul><ul>${Object.entries(tailsOf(tail)).map(([l, t]) => `<li><a href="/${l}${t}" hreflang="${l}">${l.toUpperCase()}</a></li>`).join("")}</ul></footer>`;
}
// Página completa: lang, title, description, OG, canonical, hreflang, JSON-LD y body.
function renderPage(template, { code, tail, title, desc, main, ld = [], ogType = "website", image, canonical }) {
  const url = canonical || `${ORIGIN}/${code}${tailsOf(tail)[code]}`;
  let html = setLang(template, code);
  html = setTitle(html, title);
  html = setMeta(html, "description", desc, "name");
  html = setMeta(html, "og:type", ogType);
  html = setMeta(html, "og:title", title);
  html = setMeta(html, "og:description", desc);
  html = setMeta(html, "og:url", url);
  html = setMeta(html, "og:locale", OG_LOCALE[code]);
  html = setMeta(html, "twitter:title", title, "name");
  html = setMeta(html, "twitter:description", desc, "name");
  if (image) {
    html = setMeta(html, "og:image", image);
    html = setMeta(html, "twitter:image", image, "name");
    html = removeMeta(html, "og:image:width");
    html = removeMeta(html, "og:image:height");
  }
  html = setCanonical(html, url);
  html = setAlternates(html, tail);
  html = addJsonLd(html, ld);
  return setBody(html, `${navHtml(code)}<main>${main}</main>${footerHtml(code, tail)}`);
}
function writeOut(rel, html) {
  const out = resolve(DIST, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
}
function fmtDate(d, code) {
  if (!d) return "";
  try { return new Date(String(d).slice(0, 10)).toLocaleDateString({ es: "es-ES", en: "en-GB", ro: "ro-RO", id: "id-ID" }[code], { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; }
}
// Mismo src/srcSet que el <img> destacado de Home.tsx (imgSrcSet de lib/imageOptimize.ts) →
// el navegador reutiliza el preload. Si cambias uno, cambia el otro.
function renderSrcSet(url, widths) {
  const m = url.match(/^(https:\/\/[^/]+\.supabase\.co\/storage\/v1)\/object\/public\/([^?]+)$/);
  if (!m) return "";
  return widths.map((w) => `${m[1]}/render/image/public/${m[2]}?width=${w}&resize=contain&quality=78 ${w}w`).join(", ");
}

// ---- Landings SEO (content/landings): mismo filtro que lib/landings.ts ----
const LANDING_DIR = resolve(__dirname, "..", "content", "landings");
const LANDING_ALL = JSON.parse(readFileSync(resolve(LANDING_DIR, "index.json"), "utf8"));
const LANDINGS = LANDING_ALL.filter((l) => l.published || process.env.VITE_SEO_DRAFTS === "1");
const landingLangs = (l) => Object.keys(l.slugs).filter((c) => existsSync(resolve(LANDING_DIR, l.id, `${c}.html`)));
const landingTails = (l) => Object.fromEntries(landingLangs(l).map((c) => [c, `/${l.slugs[c]}`]));
const DEAD_LANDING = LANDING_ALL.filter((l) => !LANDINGS.includes(l)).flatMap((l) => Object.entries(l.slugs).map(([c, s]) => `/${c}/${s}`));
const unlinkDead = (h) => h.replace(/<a href="([^"]+)">([\s\S]*?)<\/a>/g, (m, href, txt) => (DEAD_LANDING.includes(href) ? txt : m));
// Enlace a una landing en el idioma (o EN/ES): réplica de landingLink() de lib/landings.ts.
function landingLink(id, code) {
  const l = LANDINGS.find((x) => x.id === id);
  const use = l && [code, "en", "es"].find((c) => landingLangs(l).includes(c));
  return use ? { href: `/${use}/${l.slugs[use]}`, label: l.meta[use].crumb } : null;
}
// Misma lista que components/LandingLinks.tsx (texto visible en home y /proyectos).
const GUIDE_IDS = ["invertir-en-bali", "comprar-sobre-plano-bali", "zonas-uluwatu", "zonas-canggu-pererenan", "zonas-tabanan", "mercado-inmobiliario-bali", "rentabilidad-inversion-bali", "sobre-nosotros"];
function guidesHtml(code) {
  const links = GUIDE_IDS.map((id) => landingLink(id, code)).filter(Boolean);
  return links.length ? `<nav><span>${esc(tr(code, "landings.guidesTitle"))}:</span> ${links.map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join(" · ")}</nav>` : "";
}
// Posts sustituidos por una landing (nginx hace 301): fuera del prerender, sitemap y llms.txt.
const REDIRECTED_POSTS = { "financiar-una-propiedad-en-bali-opciones-para-inversores": "comprar-sobre-plano-bali" };
const isRedirectedPost = (slug) => !!(REDIRECTED_POSTS[slug] && LANDINGS.some((l) => l.id === REDIRECTED_POSTS[slug]));

// Réplica de FINISHED de lib/deliveryDate.ts — mantener sincronizado.
const FINISHED = ["obra finalizada", "finalizado", "entregado", "listo para entrar", "terminad"];
const isFinished = (status) => FINISHED.some((f) => String(status || "").toLowerCase().includes(f));
// Réplica de projectFaq() de pages/ProjectDetail.tsx — mantener sincronizado.
function projectFaq(p, code) {
  const T = (k, v = {}) => tr(code, `projectDetail.faq.${k}`).replace(/\{\{(\w+)\}\}/g, (_, x) => v[x] ?? "");
  const years = Number(p.years_contract) || 0;
  const tenure = String(p.tenure || "");
  const out = [];
  if (years > 0) out.push([T("tenureQ", { name: p.name }), T(/freehold/i.test(tenure) && /leasehold/i.test(tenure) ? "tenureBothA" : "tenureLeaseholdA", { years })]);
  out.push([T("payQ"), T(isFinished(p.status) ? "payDoneA" : "payBuildA")]);
  out.push([T("remoteQ"), T("remoteA")]);
  return out;
}
const faqLd = (pairs) => (pairs.length ? { "@type": "FAQPage", mainEntity: pairs.map(([q, a]) => ({ "@type": "Question", name: plain(q), acceptedAnswer: { "@type": "Answer", text: plain(a) } })) } : null);
const SEO_PROJECTS = JSON.parse(readFileSync(resolve(__dirname, "..", "content", "seo", "projects.json"), "utf8"));
// Solo el idioma exacto (ro/id sin entrada → título/descr. por defecto, sin texto EN).
const seoFor = (p, code) => SEO_PROJECTS[p.slug]?.[code];

async function main() {
  if (!existsSync(TEMPLATE)) {
    console.warn("[prerender-og] dist/index.html no existe; nada que hacer.");
    return;
  }
  let template = readFileSync(TEMPLATE, "utf8");

  // ---- Enlaces de auto-alta (/listing/:token) ----
  // Son enlaces PRIVADOS que Andreas manda a un propietario para que suba su
  // propiedad. NO deben mostrar el preview de marketing del site (ROI, precios)
  // ni indexarse. Generamos dist/listing.html con OG neutro + noindex; nginx lo
  // sirve para cualquier /listing/<token> (la SPA lee el token del path igual).
  {
    const lTitle = "List your property · Unreal Studio Bali";
    const lDesc = "Private link to upload your property (photos, plans and details) for review by Unreal Studio.";
    let html = template;
    html = setTitle(html, lTitle);
    html = setMeta(html, "description", lDesc, "name");
    html = setMeta(html, "robots", "noindex, nofollow", "name");
    html = setMeta(html, "og:type", "website");
    html = setMeta(html, "og:title", lTitle);
    html = setMeta(html, "og:description", lDesc);
    html = setMeta(html, "og:image:alt", "Unreal Studio Bali");
    html = setMeta(html, "og:url", `${ORIGIN}/listing`);
    html = setMeta(html, "twitter:title", lTitle, "name");
    html = setMeta(html, "twitter:description", lDesc, "name");
    html = setCanonical(html, `${ORIGIN}/listing`);
    writeFileSync(resolve(DIST, "listing.html"), html, "utf8");
    console.log("[prerender-og] listing.html (OG neutro + noindex) generado.");
  }

  // 404 real (nginx: rutas /<lang>/<desconocida>) — la SPA pinta su NotFound igual.
  {
    let html = setTitle(template, "404 · Unreal Studio Bali");
    html = setMeta(html, "robots", "noindex, follow", "name");
    writeFileSync(resolve(DIST, "404.html"), html, "utf8");
  }

  // ---- Datos (si Supabase falla, se genera igual con lo que haya: copy estático) ----
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const fetchRows = async (label, q) => {
    try {
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn(`[prerender-og] No se pudo leer ${label}:`, e?.message || e);
      return null;
    }
  };
  const projects = await fetchRows("projects", sb.from("projects")
    .select("slug,name,location,description,description_en,description_ro,description_id,image,gallery,status,tenure,years_contract,is_hidden,is_featured,visibility_status,sort_order,property_type,bedrooms,bathrooms,area_m2,investor_price,price_currency,created_at,updated_at")
    .order("sort_order", { ascending: true }));
  const allBlogs = (await fetchRows("blogs", sb.from("blogs")
    .select("slug,title,title_en,title_ro,title_id,description,description_en,description_ro,description_id,content,content_en,content_ro,content_id,image,tag,published_date,updated_at")
    .eq("is_published", true)
    .order("published_date", { ascending: false }))) || [];
  const blogs = allBlogs.filter((b) => !isRedirectedPost(b.slug));
  const faqs = (await fetchRows("faqs", sb.from("faqs")
    .select("question,answer,language,sort_order")
    .eq("is_published", true)
    .order("sort_order", { ascending: true }))) || [];
  const publicProjects = (projects || []).filter((p) => p.slug && !p.is_hidden);
  const available = publicProjects.filter((p) => p.visibility_status !== "sold_out");
  const projectUrl = (code, p) => `/${code}/proyecto/${projectSeoSlug(p)}`;
  const projectLi = (code, p) =>
    `<li><a href="${projectUrl(code, p)}">${esc(p.name)}</a>${p.location ? ` — ${esc(p.location)}` : ""}${p.visibility_status === "sold_out" ? " (sold out)" : ""}<p>${esc(localizedDescription(p, code))}</p></li>`;
  const blogTitle = (b, code) => loc(b, "title", code);
  const blogLi = (code, b) =>
    `<li><a href="/${code}/blog/${b.slug}">${esc(blogTitle(b, code))}</a> <time datetime="${esc((b.published_date || "").slice(0, 10))}">${esc(fmtDate(b.published_date, code))}</time><p>${esc(truncate(plain(loc(b, "description", code)), 220))}</p></li>`;
  const home = (code) => [tr(code, "nav.home"), `${ORIGIN}/${code}`];

  // ---- HOME por idioma ----
  // El dominio a secas (/) usa dist/index.html (SPA). Para /es /en /ro /id generamos
  // dist/<prefix>.html (nginx: try_files $uri.html). Copy estático de marketing.
  const HOME = [
    { prefix: "en", alt: "Investment villa in Bali — Unreal Studio" },
    { prefix: "es", alt: "Villa de inversión en Bali — Unreal Studio" },
    { prefix: "ro", alt: "Vilă de investiție în Bali — Unreal Studio" },
    { prefix: "id", alt: "Vila investasi di Bali — Unreal Studio" },
  ];
  const eurPrices = available.filter((p) => (p.price_currency || "EUR").toUpperCase() === "EUR" && p.investor_price > 0).map((p) => Number(p.investor_price));
  const minPrice = eurPrices.length ? `${Math.min(...eurPrices).toLocaleString("de-DE")}€` : "90.000€";
  // priceRange del schema Organization (index.html) con el rango real del catálogo disponible.
  if (eurPrices.length) {
    const fmt = (n) => n.toLocaleString("de-DE");
    template = template.replace(/"priceRange":\s*"[^"]*"/, `"priceRange": "€${fmt(Math.min(...eurPrices))} - €${fmt(Math.max(...eurPrices))}"`);
  }
  const featured = available.find((p) => p.is_featured) || available[0];
  // Preload SOLO de la imagen LCP (la destacada) con el mismo srcset/sizes que Home.tsx.
  const lcpSet = featured ? renderSrcSet(ogImage(featured.image), [480, 800, 1000, 1400]) : "";
  const lcpPreload = lcpSet
    ? `<link rel="preload" as="image" imagesrcset="${esc(lcpSet)}" imagesizes="(max-width: 768px) 40vw, 50vw" fetchpriority="high">`
    : "";
  for (const h of HOME) {
    const code = h.prefix;
    const title = tr(code, "home.title");
    const desc = tr(code, "home.metaDescription").replace("{{price}}", minPrice);
    const main = `<h1>${esc(plain(tr(code, "home.heroTitle").replace("{{price}}", minPrice)))}</h1>
<p>${esc(plain(tr(code, "home.heroBody")))}</p>
<section><h2>${esc(tr(code, "nav.projects"))}</h2><ul>${publicProjects.map((p) => projectLi(code, p)).join("")}</ul></section>
${blogs.length ? `<section><h2>${esc(tr(code, "nav.blog"))}</h2><ul>${blogs.slice(0, 3).map((b) => blogLi(code, b)).join("")}</ul></section>` : ""}
${guidesHtml(code)}
<p><a href="/${code}/agendar">${esc(tr(code, "nav.scheduleCall"))}</a></p>`;
    let html = renderPage(template, { code, tail: "", title, desc, main });
    html = setMeta(html, "og:image:alt", h.alt);
    if (lcpPreload) html = html.replace(/<\/head>/i, `    ${lcpPreload}\n  </head>`);
    writeOut(`${code}.html`, html);
  }

  // ---- Páginas estáticas por idioma ----
  let staticCount = 0;
  for (const code of LANGS) {
    const page = (path, title, desc, main, ld = []) => {
      const crumbs = breadcrumb([home(code), [plain(title).split(" | ")[0], `${ORIGIN}/${code}${path}`]]);
      writeOut(`${code}${path}.html`, renderPage(template, { code, tail: path, title, desc, main, ld: [crumbs, ...ld] }));
      staticCount++;
    };
    // /proyectos
    page("/proyectos", tr(code, "projects.title"), tr(code, "projects.metaDescription"),
      `<h1>${esc(tr(code, "projects.heroTitle"))}</h1><p>${esc(tr(code, "projects.metaDescription"))}</p><ul>${publicProjects.map((p) => projectLi(code, p)).join("")}</ul>${guidesHtml(code)}`,
      [{ "@type": "ItemList", itemListElement: publicProjects.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${ORIGIN}${projectUrl(code, p)}` })) }]);
    // /blog
    page("/blog", tr(code, "blog.title"), tr(code, "blog.metaDescription"),
      `<h1>${esc(tr(code, "blog.heroTitle"))}</h1><p>${esc(tr(code, "blog.heroSubtitle"))}</p><ul>${blogs.map((b) => blogLi(code, b)).join("")}</ul>`);
    // /faq (filas del idioma; si no hay, ES — igual que Faq.tsx)
    const fq = faqs.filter((f) => f.language === code).length ? faqs.filter((f) => f.language === code) : faqs.filter((f) => f.language === "es");
    page("/faq", tr(code, "faq.title"), tr(code, "faq.metaDescription"),
      `<h1>${esc(tr(code, "faq.heroTitle"))}</h1><p>${esc(tr(code, "faq.heroSubtitle"))}</p>${fq.map((f) => `<section><h2>${esc(f.question)}</h2><div>${sanitize(f.answer)}</div></section>`).join("\n")}`,
      fq.length ? [{ "@type": "FAQPage", mainEntity: fq.slice(0, 50).map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: plain(f.answer) } })) }] : []);
    // /agendar, /contacto, /agencias
    page("/agendar", tr(code, "booking.title"), tr(code, "contact.metaDescription"),
      `<h1>${esc(tr(code, "booking.heroTitle"))}</h1><p>${esc(tr(code, "booking.heroSubtitle"))}</p>`);
    page("/contacto", tr(code, "contact.title"), tr(code, "contact.metaDescription"),
      `<h1>${esc(`${tr(code, "contact.heroTitle1")} ${tr(code, "contact.heroTitle2")}`.trim())}</h1><p>${esc(tr(code, "contact.heroSubtitle"))}</p><p><a href="mailto:hello@unrealstudiobali.com">hello@unrealstudiobali.com</a> · +34 625 710 770</p>`);
    page("/agencias", tr(code, "agenciasPartnership.title"), tr(code, "agenciasPartnership.metaDescription"),
      `<h1>${esc(`${tr(code, "agenciasPartnership.heroTitle1")} ${tr(code, "agenciasPartnership.heroTitle2")}`)}</h1><p>${esc(tr(code, "agenciasPartnership.heroBody"))}</p>`);
    // Legales (public/legal/<lang>/<doc>.md, fallback ES — igual que LegalPage.tsx)
    for (const doc of ["privacidad", "terminos", "aviso-legal"]) {
      const f = [code, "es"].map((l) => resolve(__dirname, "..", "public", "legal", l, `${doc}.md`)).find((x) => existsSync(x));
      if (!f) continue;
      const md = readFileSync(f, "utf8");
      const h1 = (md.match(/^#\s+(.+)$/m) || [])[1] || doc;
      const firstP = md.split(/\n{2,}/).map((b) => b.trim()).find((b) => b && !b.startsWith("#")) || h1;
      page(`/${doc}`, `${h1} | Unreal Studio Bali`, truncate(plain(firstP.replace(/[*#_]/g, "")), 160), mdToHtml(md));
    }
  }
  console.log(`[prerender-og] Home ×${HOME.length} + estáticas ×${staticCount} (con contenido, hreflang y JSON-LD).`);

  // ---- Blog: un HTML por post e idioma ----
  let blogCount = 0;
  for (const b of blogs) {
    if (!b.slug) continue;
    for (const code of LANGS) {
      const tail = `/blog/${b.slug}`;
      const title = blogTitle(b, code);
      const desc = truncate(plain(loc(b, "description", code)) || title, 200);
      const content = sanitize(loc(b, "content", code));
      const img = b.image ? ogImage(b.image) : undefined;
      const url = `${ORIGIN}/${code}${tail}`;
      const main = `<article><h1>${esc(title)}</h1><p><time datetime="${esc((b.published_date || "").slice(0, 10))}">${esc(fmtDate(b.published_date, code))}</time>${b.tag ? ` · ${esc(b.tag)}` : ""}</p>${content}</article>
<section><h2>${esc(tr(code, "nav.projects"))}</h2><ul>${available.map((p) => `<li><a href="${projectUrl(code, p)}">${esc(p.name)}</a></li>`).join("")}</ul></section>`;
      const ld = [
        breadcrumb([home(code), [tr(code, "nav.blog"), `${ORIGIN}/${code}/blog`], [title, url]]),
        {
          "@type": "BlogPosting",
          headline: truncate(title, 110),
          description: desc,
          image: img ? [img] : undefined,
          datePublished: b.published_date || undefined,
          dateModified: b.updated_at || b.published_date || undefined,
          inLanguage: code,
          wordCount: plain(content).split(" ").filter(Boolean).length,
          author: { "@id": `${ORIGIN}/#organization`, "@type": "Organization", name: "Unreal Studio Bali", url: ORIGIN },
          publisher: { "@id": `${ORIGIN}/#organization` },
          mainEntityOfPage: url,
        },
      ];
      writeOut(`${code}${tail}.html`, renderPage(template, { code, tail, title: withBrand(title), desc, main, ld, ogType: "article", image: img }));
      blogCount++;
    }
  }
  console.log(`[prerender-og] Blog: ${blogCount} ficheros (${blogs.length} posts × ${LANGS.length} idiomas).`);

  // ---- Landings SEO: un HTML por landing e idioma presente (mismo texto que ArticleView) ----
  let landingCount = 0;
  for (const l of LANDINGS) {
    const tails = landingTails(l);
    for (const code of Object.keys(tails)) {
      const m = l.meta[code];
      const url = `${ORIGIN}/${code}${tails[code]}`;
      const content = sanitize(unlinkDead(readFileSync(resolve(LANDING_DIR, l.id, `${code}.html`), "utf8")));
      const img = ogImage(l.image);
      const faqPart = content.split("<!--faq-->")[1] || "";
      const faq = [...faqPart.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((x) => [x[1], x[2]]);
      const zoneProjects = l.zone ? available.filter((p) => String(p.location || "").toLowerCase().includes(l.zone.toLowerCase())) : [];
      const main = `<article><h1>${esc(m.h1)}</h1><p><time datetime="${esc(l.dateModified)}">${esc(fmtDate(l.dateModified, code))}</time></p>${content}</article>`;
      const page = l.type === "Article"
        ? { "@type": "Article", headline: truncate(m.h1, 110), description: m.description, image: [img], dateModified: l.dateModified, inLanguage: code,
            author: { "@id": `${ORIGIN}/#organization` }, publisher: { "@id": `${ORIGIN}/#organization` }, mainEntityOfPage: url }
        : { "@type": l.type, name: m.title, description: m.description, url, inLanguage: code, dateModified: l.dateModified,
            about: { "@id": `${ORIGIN}/#organization` }, publisher: { "@id": `${ORIGIN}/#organization` } };
      const ld = [
        breadcrumb([home(code), [m.crumb, url]]),
        page,
        faqLd(faq),
        zoneProjects.length ? { "@type": "ItemList", itemListElement: zoneProjects.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${ORIGIN}${projectUrl(code, p)}` })) } : null,
      ];
      writeOut(`${code}${tails[code]}.html`, renderPage(template, { code, tail: tails, title: m.title, desc: m.description, main, ld, ogType: "article", image: img }));
      landingCount++;
    }
  }
  console.log(`[prerender-og] Landings: ${landingCount} ficheros (${LANDINGS.length} landings).`);

  // ---- /llms.txt (llmstxt.org): resumen + URLs clave, regenerado en cada build ----
  writeOut("llms.txt", `# Unreal Studio Bali

> Real estate developer in Bali (Indonesia) with offices in Madrid and Bali. Builds and sells leasehold villas, lofts and apartments in Uluwatu, Canggu/Pererenan and Tabanan to international investors, mainly from Spain. Remote purchase with power of attorney (POA). Site in Spanish (/es), English (/en), Romanian (/ro) and Indonesian (/id).

Contact: hello@unrealstudiobali.com · +34 625 710 770 · ${ORIGIN}/es/agendar

## Main pages
- [Home (ES)](${ORIGIN}/es): overview and featured project
- [Projects](${ORIGIN}/es/proyectos): current catalogue of villas, lofts and apartments
- [FAQ](${ORIGIN}/es/faq): leasehold, payments, ownership, buying process
- [Blog](${ORIGIN}/es/blog): guides on investing in Bali
- [Partners / agencies](${ORIGIN}/es/agencias)
- [Legal notice](${ORIGIN}/es/aviso-legal)

## Projects
${publicProjects.map((p) => `- [${p.name}](${ORIGIN}${projectUrl("es", p)})${p.location ? `: ${p.location}` : ""}${p.visibility_status === "sold_out" ? " (sold out)" : ""}`).join("\n")}

## Guides
${LANDINGS.filter((l) => landingLangs(l).includes("es")).map((l) => `- [${l.meta.es.title}](${ORIGIN}/es/${l.slugs.es})`).join("\n")}
${blogs.map((b) => `- [${b.title}](${ORIGIN}/es/blog/${b.slug})`).join("\n")}

## Optional
- [English site](${ORIGIN}/en)
- [Sitemap](${ORIGIN}/sitemap.xml)
`);

  // Sin proyectos (Supabase caído en el build) → fallar el build: mejor mantener el deploy anterior que publicar sin fichas.
  if (!projects?.length) throw new Error('[prerender-og] 0 proyectos desde Supabase: abortando build');
  let count = 0;
  for (const p of projects) {
    if (!p.slug) continue;
    const seoSlug = projectSeoSlug(p);
    // Cubrimos el slug SEO (el que comparte la web) y el slug corto (enlaces viejos).
    const slugs = Array.from(new Set([seoSlug, p.slug]));
    const img = ogImage(p.image);
    const sold = p.visibility_status === "sold_out";

    for (const L of LOCALES) {
      const code = L.code;
      const tail = `/proyecto/${seoSlug}`;
      const seo = seoFor(p, code);
      const desc = seo?.description ?? localizedDescription(p, code);
      const title = seo?.title ?? `${p.name} | Unreal Studio Bali`;
      const faq = projectFaq(p, code);
      // Zona en el breadcrumb solo si hay landing publicada de esa zona en este idioma.
      const zoneLanding = LANDINGS.find((l) => l.zone && landingLangs(l).includes(code) && String(p.location || "").toLowerCase().includes(l.zone.toLowerCase()));
      const canonical = `${ORIGIN}/${code}${tail}`; // sin prefijo → canónica /es
      const facts = [
        p.location && esc(p.location),
        p.property_type && esc(p.property_type),
        p.bedrooms > 0 && `${esc(tr(code, "projectDetail.labelBedrooms"))}: ${p.bedrooms}`,
        p.bathrooms > 0 && `${esc(tr(code, "projectDetail.labelBathrooms"))}: ${p.bathrooms}`,
        p.area_m2 > 0 && `${esc(tr(code, "projectDetail.labelArea"))}: ${p.area_m2} m²`,
      ].filter(Boolean).join(" · ");
      const main = `<article><h1>${esc(p.name)}${seo?.h1sub ? `<span> ${esc(seo.h1sub)}</span>` : ""}</h1><p>${facts}</p><p>${esc(plain(loc(p, "description", code)))}</p>
<section><h2>${esc(tr(code, "projectDetail.faq.faqTitle").replace("{{name}}", p.name))}</h2>${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}</section>
<p><a href="/${code}/agendar">${esc(tr(code, "nav.scheduleCall"))}</a> · <a href="/${code}/proyectos">${esc(tr(code, "nav.projects"))}</a>${zoneLanding ? ` · <a href="/${code}/${zoneLanding.slugs[code]}">${esc(zoneLanding.meta[code].crumb)}</a>` : ""}</p></article>`;
      const ld = [
        breadcrumb([home(code), [tr(code, "nav.projects"), `${ORIGIN}/${code}/proyectos`],
          ...(zoneLanding ? [[zoneLanding.meta[code].crumb, `${ORIGIN}/${code}/${zoneLanding.slugs[code]}`]] : []), [p.name, canonical]]),
        {
          "@type": "RealEstateListing",
          name: p.name,
          description: desc,
          url: canonical,
          image: [img, ...(Array.isArray(p.gallery) ? p.gallery : []).slice(0, 6).map(ogImage)],
          inLanguage: code,
          datePosted: (p.created_at || "").slice(0, 10) || undefined,
          about: {
            "@type": /villa|house/i.test(p.property_type || "") ? "House" : "Apartment",
            name: p.name,
            numberOfBedrooms: p.bedrooms || undefined,
            numberOfBathroomsTotal: p.bathrooms || undefined,
            floorSize: p.area_m2 > 0 ? { "@type": "QuantitativeValue", value: p.area_m2, unitCode: "MTK" } : undefined,
            address: { "@type": "PostalAddress", addressLocality: p.location || "Bali", addressRegion: "Bali", addressCountry: "ID" },
          },
          offers: p.investor_price > 0 ? {
            "@type": "Offer",
            price: Number(p.investor_price),
            priceCurrency: (p.price_currency || "EUR").toUpperCase(),
            availability: `https://schema.org/${sold ? "SoldOut" : /sobre plano/i.test(p.status || "") ? "PreOrder" : "InStock"}`,
            url: canonical,
          } : undefined,
        },
        faqLd(faq),
      ];
      let html = renderPage(template, { code, tail, title, desc, main, ld, ogType: "article", image: img, canonical });
      html = setMeta(html, "og:image:alt", p.name);
      html = setMeta(html, "og:locale", L.ogLocale);

      for (const slug of slugs) {
        const url = `${ORIGIN}${L.prefix ? "/" + L.prefix : ""}/proyecto/${slug}`;
        // Fichero <slug>.html (no carpeta/index.html) para que nginx lo sirva con
        // try_files $uri.html SIN redirigir a barra final.
        writeOut(`${L.prefix ? L.prefix + "/" : ""}proyecto/${slug}.html`, setMeta(html, "og:url", url));
        count++;
      }
    }
  }
  console.log(`[prerender-og] Generados ${count} index.html (${projects.length} proyectos × ${LOCALES.length} idiomas).`);
}

main().catch((e) => {
  console.warn("[prerender-og] Error no fatal, build continúa:", e?.message || e);
});
