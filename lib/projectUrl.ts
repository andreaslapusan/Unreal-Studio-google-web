/**
 * Build SEO-friendly project URLs.
 *
 * Canonical slug in DB stays short ("golf-bay-lofts-1bd"), but the URL we
 * link to from listings + share + sitemap appends the location to give
 * Google more context, e.g. /proyecto/golf-bay-lofts-1bd-balangan-uluwatu.
 *
 * ProjectDetail.tsx accepts both forms — exact match first, then strips the
 * trailing location segments and re-queries — so old short links keep
 * working and new shares get the SEO boost.
 */

interface ProjectLike {
  slug: string;
  location?: string | null;
  zone?: string | null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // strip accents
    .replace(/[^a-z0-9]+/g, "-")            // non-alnum → dash
    .replace(/^-+|-+$/g, "")                // trim dashes
    .replace(/-+/g, "-");
}

/**
 * Extract the meaningful location parts from a project's location string.
 * Drops the country (Bali / Indonesia) since the whole site is Bali.
 *
 * "Balangan, Uluwatu, Bali" → ["balangan", "uluwatu"]
 * "Canggu" → ["canggu"]
 * "Tibubiu, Tabanan, Bali" → ["tibubiu", "tabanan"]
 * "Uluwatu" → ["uluwatu"]
 */
function locationParts(project: ProjectLike): string[] {
  const raw = project.location ?? "";
  const parts = raw
    .split(",")
    .map((p) => slugify(p))
    .filter((p) => p && p !== "bali" && p !== "indonesia");
  return parts;
}

/**
 * Compute the SEO slug for a project: <db_slug>-<loc1>-<loc2>...
 * Returns the bare DB slug if no location info is available.
 */
export function projectSeoSlug(project: ProjectLike): string {
  const locs = locationParts(project);
  if (locs.length === 0) return project.slug;
  // If the slug already ends with the first location, don't duplicate.
  const slug = project.slug;
  const firstLocSuffix = `-${locs[0]}`;
  if (slug.endsWith(firstLocSuffix) || slug.includes(firstLocSuffix + "-")) {
    return slug;
  }
  return `${slug}-${locs.join("-")}`;
}

/**
 * Build a project URL ready for <Link to>, including any UTM string.
 */
export function projectPath(project: ProjectLike): string {
  return `/proyecto/${projectSeoSlug(project)}`;
}

/**
 * Inverse: given the URL slug (which may include the location suffix), find
 * which DB slug it maps to. Used by ProjectDetail to resolve old short links
 * AND new SEO links against the same canonical row.
 *
 * Strategy: take the URL slug. Try exact match. If miss, progressively trim
 * trailing dash-segments and re-check against the candidate set. The first
 * candidate that matches a known DB slug wins.
 */
export function resolveCanonicalSlug(urlSlug: string, knownDbSlugs: string[]): string | null {
  if (knownDbSlugs.includes(urlSlug)) return urlSlug;
  let working = urlSlug;
  while (working.includes("-")) {
    working = working.slice(0, working.lastIndexOf("-"));
    if (knownDbSlugs.includes(working)) return working;
  }
  return null;
}
