/**
 * Import photos from a Google Drive folder link. The web can't read Drive, so
 * it queues a request (request_drive_import RPC); a server-side job (the bot,
 * which has Drive access) downloads the images, uploads them to Supabase
 * Storage and writes the resulting public URLs back. We poll drive_import_get
 * and return the URLs so the caller can add them to its gallery state.
 */
import { supabase } from "./supabase";

export interface DriveImportResult { urls: string[]; error?: string; cancelled?: boolean }

/**
 * Extrae un link de CARPETA de Google Drive de un texto arbitrario (p.ej. un
 * mensaje de WhatsApp pegado con texto alrededor del link). Devuelve la URL
 * limpia de la carpeta, o null si el texto NO contiene una carpeta de Drive
 * válida (link de fichero suelto, otro dominio, o sin link) → así el editor
 * puede avisar "link no válido" antes de encolar nada.
 */
export function extractDriveFolder(text: string): string | null {
  if (!text) return null;
  const urls = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const raw of urls) {
    const u = raw.replace(/[).,]+$/, ""); // quita puntuación final pegada
    if (!/\.google\.com/i.test(u)) continue;
    // carpeta: /folders/<id>  ·  /drive/u/0/folders/<id>  ·  ?id=<id> (folderview/open)
    if (/\/folders\/[-\w]{10,}/.test(u)) return u;
    if (/[?&]id=[-\w]{10,}/.test(u) && /(folderview|open|\/drive\/)/i.test(u)) return u;
  }
  return null;
}

export async function runDriveImport(
  mode: "admin" | "intake",
  token: string | null,
  folderUrl: string,
  onStatus?: (s: string) => void,
  onProgress?: (uploaded: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<DriveImportResult> {
  if (shouldCancel?.()) return { urls: [], cancelled: true };
  onStatus?.("queued");
  const { data, error } = await supabase.rpc("request_drive_import", {
    p_mode: mode, p_token: token, p_folder_url: folderUrl,
  });
  if (error || !data?.ok) return { urls: [], error: data?.error || error?.message || "request_failed" };
  const id = data.id;
  // Poll up to ~5 min (bot cron runs every minute). Reportamos progreso real
  // (subidas/total) para pintar la barra de avance.
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    if (shouldCancel?.()) return { urls: [], cancelled: true };
    const { data: st } = await supabase.rpc("drive_import_get", { p_id: id });
    if (!st) continue;
    onStatus?.(st.status);
    if (typeof st.total === "number" && st.total > 0) onProgress?.(st.uploaded || 0, st.total);
    if (st.status === "done") { onProgress?.(st.count ?? (Array.isArray(st.urls) ? st.urls.length : 0), st.total || st.count || 0); return { urls: Array.isArray(st.urls) ? st.urls : [] }; }
    if (st.status === "error") return { urls: [], error: st.error || "import_error" };
  }
  return { urls: [], error: "timeout" };
}
