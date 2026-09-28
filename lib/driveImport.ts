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
): Promise<DriveImportResult> {
  onStatus?.("queued");
  const { data, error } = await supabase.rpc("request_drive_import", {
    p_mode: mode, p_token: token, p_folder_url: folderUrl,
  });
  if (error || !data?.ok) return { urls: [], error: data?.error || error?.message || "request_failed" };
  const id = data.id;
  // Poll up to ~3 min (bot cron runs every minute).
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const { data: st } = await supabase.rpc("drive_import_get", { p_id: id });
    if (!st) continue;
    onStatus?.(st.status);
    if (st.status === "done") return { urls: Array.isArray(st.urls) ? st.urls : [] };
    if (st.status === "error") return { urls: [], error: st.error || "import_error" };
  }
  return { urls: [], error: "timeout" };
}
