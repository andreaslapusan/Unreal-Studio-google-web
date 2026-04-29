#!/usr/bin/env node
/**
 * Build-time sitemap generation.
 *
 * Pulls live project slugs + blog post slugs from Supabase (anon key — only
 * reads what's already publicly indexable) and writes a fresh public/sitemap.xml
 * so SEO discovers new listings without anyone editing the file.
 *
 * Wired as `prebuild` in package.json so `vite build` always ships a sitemap
 * synced with the catalogue.
 *
 * If the Supabase fetch fails (CI without internet, project down) we fall
 * back to whatever sitemap is currently checked in — better than blowing
 * up the build.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://unrealstudiobali.com";
const OUT = resolve(__dirname, "..", "public", "sitemap.xml");

const SUPABASE_URL = "https://rnielxgackkshnatvagj.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuaWVseGdhY2trc2huYXR2YWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzE4NTEsImV4cCI6MjA4NjQwNzg1MX0.5X6k4TVLrH1AJMLw797l4LWTy3cROhh-Q4gAPl-GPJY";

const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const STATIC_ROUTES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/proyectos", priority: "0.9", changefreq: "weekly" },
  { path: "/inversores", priority: "0.85", changefreq: "weekly" },
  { path: "/agencias", priority: "0.8", changefreq: "weekly" },
  { path: "/blog", priority: "0.7", changefreq: "weekly" },
  { path: "/faq", priority: "0.7", changefreq: "weekly" },
  { path: "/contacto", priority: "0.5", changefreq: "monthly" },
  { path: "/privacidad", priority: "0.3", changefreq: "yearly" },
  { path: "/terminos", priority: "0.3", changefreq: "yearly" },
];

function urlEntry({ path, priority, changefreq, lastmod }) {
  const lm = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>
    <loc>${ORIGIN}${path}</loc>${lm}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function main() {
  const entries = STATIC_ROUTES.map(urlEntry);

  try {
    const { data: projects, error: pErr } = await sb
      .from("projects")
      .select("slug, updated_at, is_hidden")
      .order("sort_order", { ascending: true });
    if (pErr) throw pErr;
    for (const p of projects ?? []) {
      if (p.is_hidden || !p.slug) continue;
      entries.push(
        urlEntry({
          path: `/proyecto/${p.slug}`,
          priority: "0.85",
          changefreq: "weekly",
          lastmod: p.updated_at?.slice(0, 10),
        })
      );
    }
    console.log(`[sitemap] ${(projects ?? []).filter((p) => !p.is_hidden).length} projects`);
  } catch (err) {
    console.warn("[sitemap] could not fetch projects:", err.message ?? err);
  }

  try {
    const { data: blogs, error: bErr } = await sb
      .from("blogs")
      .select("slug, published_date")
      .order("published_date", { ascending: false });
    if (bErr) throw bErr;
    for (const b of blogs ?? []) {
      if (!b.slug) continue;
      entries.push(
        urlEntry({
          path: `/blog/${b.slug}`,
          priority: "0.6",
          changefreq: "monthly",
          lastmod: b.published_date?.slice(0, 10),
        })
      );
    }
    console.log(`[sitemap] ${(blogs ?? []).length} blog posts`);
  } catch (err) {
    console.warn("[sitemap] could not fetch blogs:", err.message ?? err);
  }

  // Bail out if we got nothing extra — keep the existing checked-in sitemap.
  if (entries.length <= STATIC_ROUTES.length && existsSync(OUT)) {
    console.warn("[sitemap] no dynamic entries fetched; preserving existing file");
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
  writeFileSync(OUT, xml, "utf8");
  console.log(`[sitemap] wrote ${entries.length} URLs to ${OUT}`);
}

main().catch((err) => {
  console.error("[sitemap] fatal:", err);
  process.exit(0); // never break the build
});
