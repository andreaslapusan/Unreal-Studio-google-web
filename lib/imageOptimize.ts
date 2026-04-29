/**
 * Image delivery optimisation.
 *
 * The Unreal Studio Bali catalogue stores hero shots as raw PNG/JPG in Supabase
 * Storage. Some are 7+ MB each, which murders LCP on mobile (Lighthouse mobile
 * Performance: 43, LCP 27s on the home page).
 *
 * Supabase's image transformation endpoint (`/storage/v1/render/image/...`) is
 * gated behind a paid add-on we don't have, so we proxy through wsrv.nl — a
 * free public image CDN run by Weserv that:
 *   - converts to WebP/AVIF on the fly
 *   - resizes to the requested width
 *   - serves with Cloudflare caching
 *
 * Same-origin caching headers stay intact because wsrv.nl forwards them.
 *
 * Usage:
 *   <img src={imgSrc(project.hero, 1200)} />
 *   <img src={imgSrc(project.hero, 800)} srcSet={imgSrcSet(project.hero, [400,800,1200])} sizes="(max-width: 768px) 100vw, 50vw" />
 *
 * If wsrv.nl is ever down or blocked, fall back to the original URL by setting
 * `bypassOptimizer = true` via env or feature flag.
 */

const WSRV_BASE = "https://wsrv.nl/";

export interface ImgOpts {
  /** Target rendered width in CSS pixels. wsrv.nl will preserve aspect ratio. */
  width?: number;
  /** JPEG/WebP quality 1-100. Default 78 — visually indistinguishable from 100 for photos. */
  quality?: number;
  /** Output format. Default 'webp'. wsrv supports webp, avif, jpg, png. */
  format?: "webp" | "avif" | "jpg" | "png";
  /** Skip the proxy entirely (debugging or fallback). */
  bypass?: boolean;
}

/**
 * Wrap an image URL with the wsrv.nl optimization proxy.
 * Returns the original URL untouched when:
 *  - input is empty
 *  - input is a data: URL or already proxied
 *  - bypass flag is set
 */
export function imgSrc(url: string | null | undefined, widthOrOpts: number | ImgOpts = 1200): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.includes("wsrv.nl")) return url;

  const opts: ImgOpts =
    typeof widthOrOpts === "number" ? { width: widthOrOpts } : widthOrOpts;

  if (opts.bypass) return url;

  const lower = url.toLowerCase();

  const params = new URLSearchParams();
  params.set("url", url);
  if (opts.width) params.set("w", String(opts.width));
  params.set("q", String(opts.quality ?? 78));
  // The catalogue is now physically WebP after the storage conversion script
  // ran — the proxy only needs to resize. Skip the format coercion when the
  // source is already WebP/AVIF so wsrv just hands back a re-sized version.
  if (opts.format) {
    params.set("output", opts.format);
  } else if (!/\.(webp|avif)$/i.test(lower)) {
    params.set("output", "webp");
  }
  // Avoid wsrv re-encoding to a worse format for already-tiny SVG
  if (lower.endsWith(".svg")) params.set("output", "png");

  return `${WSRV_BASE}?${params.toString()}`;
}

/**
 * Generate a srcSet string with multiple widths for responsive images.
 *
 *   <img
 *     src={imgSrc(url, 800)}
 *     srcSet={imgSrcSet(url, [400, 800, 1200, 1600])}
 *     sizes="(max-width: 640px) 100vw, 50vw"
 *   />
 */
export function imgSrcSet(url: string | null | undefined, widths: number[], opts: ImgOpts = {}): string {
  if (!url) return "";
  return widths.map((w) => `${imgSrc(url, { ...opts, width: w })} ${w}w`).join(", ");
}
