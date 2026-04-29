/**
 * /equipo/upload — internal form for the construction team to publish
 * progress updates (photos, videos, PDFs). Backed by Supabase.
 */
import React, { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { compressImage } from "../lib/imageCompress";

interface PropertySummary {
  id: string;
  name: string;
}

type Visibility = "all" | "investors-only" | "listers-only";

interface QueuedFile {
  file: File;
  previewUrl?: string;
}

export default function EquipoUpload() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [propertyId, setPropertyId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [pctProgress, setPctProgress] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [visibility, setVisibility] = useState<Visibility>("all");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [submitError, setSubmitError] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      setProperties((data ?? []) as PropertySummary[]);
    })();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  // Strict guard: deny null/unknown roles.
  if (!role || (role !== "admin" && role !== "team")) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">Acceso restringido</h1>
          <p>Solo para equipo interno.</p>
        </div>
      </div>
    );
  }

  const handleFilesAdded = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr: QueuedFile[] = Array.from(incoming).map((f) => ({
      file: f,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setFiles((prev) => [...prev, ...arr]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFilesAdded(e.dataTransfer.files);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !title.trim()) return;
    setSubmitState("submitting");
    setSubmitError("");

    try {
      // 1. Insert update row
      const { data: updateRow, error: insertErr } = await supabase
        .from("property_updates")
        .insert({
          property_id: propertyId,
          title: title.trim(),
          summary: summary.trim() || null,
          pct_progress_at_update: pctProgress ? Number(pctProgress) : null,
          posted_by: user.email ?? user.id,
          visibility,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const updateId = updateRow.id as string;

      // 2. Upload files in parallel. Images get client-side compressed to
      //    WebP (max 1920px, q=0.82) so the construction team can drop raw
      //    DSLR/phone photos straight in without exploding storage size.
      const assets = await Promise.all(
        files.map(async (qf, i) => {
          const isImage = qf.file.type.startsWith("image/");
          const toUpload = isImage
            ? await compressImage(qf.file, { maxDim: 1920, quality: 0.82 })
            : qf.file;
          const ext = toUpload.name.split(".").pop() ?? "bin";
          const path = `property-updates/${propertyId}/${updateId}/${i}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("images")
            .upload(path, toUpload, {
              cacheControl: "3600",
              upsert: false,
              contentType: toUpload.type,
            });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from("images").getPublicUrl(path);

          const assetType = isImage
            ? "image"
            : qf.file.type.startsWith("video/")
            ? "video"
            : qf.file.type === "application/pdf"
            ? "pdf"
            : "other";

          return {
            update_id: updateId,
            asset_type: assetType,
            storage_path: path,
            external_url: pub.publicUrl,
            file_name: qf.file.name,
            file_size: toUpload.size,
            mime_type: toUpload.type,
            position: i,
          };
        })
      );

      if (assets.length) {
        const { error: assetsErr } = await supabase.from("update_assets").insert(assets);
        if (assetsErr) throw assetsErr;
      }

      setSubmitState("ok");
      setTitle("");
      setPctProgress("");
      setSummary("");
      setFiles([]);
      setVisibility("all");
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">Subir update de obra</h1>
          <p className="text-sm opacity-80">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/admin")} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
            Admin
          </button>
          <button onClick={() => void signOut()} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Proyecto *</label>
            <select
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
            >
              <option value="">— Elegir proyecto —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-primary mb-1">Título *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Reporte semana 17"
                className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">% Obra</label>
              <input
                type="number"
                min="0"
                max="100"
                value={pctProgress}
                onChange={(e) => setPctProgress(e.target.value)}
                placeholder="65"
                className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Resumen</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="Esta semana terminamos la cimentación del edificio principal..."
              className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Visibilidad</label>
            <div className="flex gap-3">
              {(["all", "investors-only", "listers-only"] as Visibility[]).map((v) => (
                <label key={v} className="flex items-center gap-2 px-4 py-2 border border-primary/20 rounded-lg cursor-pointer">
                  <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} />
                  <span className="text-sm">
                    {v === "all" ? "Todos" : v === "investors-only" ? "Solo inversores" : "Solo listers"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Archivos</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/30 rounded-2xl p-8 text-center cursor-pointer hover:bg-primary/5 transition"
            >
              <p className="text-primary/70">📎 Arrastra archivos aquí o click para elegir</p>
              <p className="text-xs text-primary/50 mt-1">Fotos, videos, PDFs</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={(e) => handleFilesAdded(e.target.files)}
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {files.map((qf, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-white/60 rounded-lg p-3">
                    <span className="truncate">
                      {qf.file.name}{" "}
                      <span className="text-primary/50">({Math.round(qf.file.size / 1024)} KB)</span>
                    </span>
                    <button type="button" onClick={() => removeFile(i)} className="text-red-500 hover:underline">
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="submit"
            disabled={submitState === "submitting" || !propertyId || !title}
            className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:translate-y-[-2px] transition disabled:opacity-50"
          >
            {submitState === "submitting" ? "Subiendo…" : "Publicar update"}
          </button>

          {submitState === "ok" && (
            <p className="text-green-700 text-sm">✅ Update publicado. Triggers de notificación deben reaccionar.</p>
          )}
          {submitError && <p className="text-red-700 text-sm">{submitError}</p>}
        </form>
      </main>
    </div>
  );
}
