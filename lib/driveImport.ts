/**
 * Import photos from a Google Drive folder link. The web can't read Drive, so
 * it queues a request (request_drive_import RPC); a server-side job (the bot,
 * which has Drive access) downloads the images, uploads them to Supabase
 * Storage and writes the resulting public URLs back. We poll drive_import_get
 * and return the URLs so the caller can add them to its gallery state.
 */
import { supabase } from "./supabase";

export interface DriveImportResult { urls: string[]; error?: string; }

export async function runDriveImport(
  mode: "admin" | "intake",
  token: string | null,
  folderUrl: string,
  onStatus?: (s: string) => void,
  onProgress?: (uploaded: number, total: number) => void,
): Promise<DriveImportResult> {
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
    const { data: st } = await supabase.rpc("drive_import_get", { p_id: id });
    if (!st) continue;
    onStatus?.(st.status);
    if (typeof st.total === "number" && st.total > 0) onProgress?.(st.uploaded || 0, st.total);
    if (st.status === "done") { onProgress?.(st.count ?? (Array.isArray(st.urls) ? st.urls.length : 0), st.total || st.count || 0); return { urls: Array.isArray(st.urls) ? st.urls : [] }; }
    if (st.status === "error") return { urls: [], error: st.error || "import_error" };
  }
  return { urls: [], error: "timeout" };
}
