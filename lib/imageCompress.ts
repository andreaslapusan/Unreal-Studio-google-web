/**
 * Client-side image compression before upload.
 *
 * Why: a typical phone photo from a WhatsApp screenshot or DSLR weighs 4-12 MB
 * as JPEG and 8-15 MB as PNG. Uploading them raw bloats Storage, blocks page
 * load via the proxy, and forces wsrv.nl to do heavy work on every render.
 * Compress at the client to keep originals reasonable.
 *
 * What this does:
 *   1. Read the file into an Image
 *   2. Scale down so the longest side is at most `maxDim` px (default 1600)
 *   3. Re-encode as WebP at the target quality (default 0.82)
 *   4. Return a new File (so existing upload code keeps working)
 *
 * If the input is already smaller than maxDim AND already WebP, return as-is —
 * no point re-encoding (would lose quality for nothing).
 *
 * SVG and animated GIF are passed through untouched (canvas would freeze them
 * to a single frame and rasterise the SVG, both undesirable).
 */

export interface CompressOpts {
  /** Longest side in pixels after scaling. Default 1600. */
  maxDim?: number;
  /** WebP encoding quality 0-1. Default 0.82. */
  quality?: number;
  /** If true, skip compression for files already below this byte size. Default 200_000 (200KB). */
  skipUnder?: number;
}

const PASS_THROUGH_TYPES = new Set(["image/svg+xml", "image/gif"]);

export async function compressImage(file: File, opts: CompressOpts = {}): Promise<File> {
  const { maxDim = 1600, quality = 0.82, skipUnder = 200_000 } = opts;

  if (PASS_THROUGH_TYPES.has(file.type)) return file;
  if (file.size <= skipUnder && file.type === "image/webp") return file;
  if (!file.type.startsWith("image/")) return file;

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const targetW = Math.round(img.naturalWidth * scale);
  const targetH = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob = await canvasToBlob(canvas, "image/webp", quality);
  if (!blob) return file;

  // If compression made it bigger (rare, e.g. small line-art PNGs become bigger as WebP),
  // keep the original.
  if (blob.size >= file.size && file.type === "image/webp") return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("Image decode failed"));
    img.onload = () => resolve(img);
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
