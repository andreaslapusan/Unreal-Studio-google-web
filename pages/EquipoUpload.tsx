/**
 * /equipo/upload — internal form for the construction team to publish
 * progress updates (photos, videos, PDFs). Backed by Supabase.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { compressImage } from "../lib/imageCompress";
import { hasPermission } from "../lib/permissions";
import LanguageSwitcher from "../components/LanguageSwitcher";

interface PropertySummary {
  id: string;
  name: string;
}

type Visibility = "all" | "listers-only";

interface QueuedFile {
  file: File;
  previewUrl?: string;
}

export default function EquipoUpload() {
  const { t, i18n } = useTranslation();
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

  // Lista de reportes ya subidos (para que el equipo confirme/haga seguimiento
  // de lo que publicó: Adam pedía poder VER el PDF/foto tras subirlo).
  const [uploads, setUploads] = useState<any[]>([]);
  const [loadingUploads, setLoadingUploads] = useState<boolean>(true);
  const [listFilter, setListFilter] = useState<string>("");

  const loadUploads = useCallback(async () => {
    setLoadingUploads(true);
    const { data: ups } = await supabase
      .from("property_updates")
      .select("id, property_id, title, summary, pct_progress_at_update, posted_at, posted_by, visibility")
      .order("posted_at", { ascending: false })
      .limit(60);
    const rows = (ups ?? []) as any[];
    const ids = rows.map((r) => r.id);
    let assetsByUpdate: Record<string, any[]> = {};
    if (ids.length) {
      const { data: assets } = await supabase
        .from("update_assets")
        .select("update_id, asset_type, external_url, file_name, position")
        .in("update_id", ids);
      for (const a of (assets ?? []) as any[]) {
        (assetsByUpdate[a.update_id] = assetsByUpdate[a.update_id] || []).push(a);
      }
    }
    for (const r of rows) r._assets = (assetsByUpdate[r.id] || []).sort((a, b) => (a.position || 0) - (b.position || 0));
    setUploads(rows);
    setLoadingUploads(false);
  }, []);

  useEffect(() => { if (user) void loadUploads(); }, [user, loadUploads]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase.from("properties").select("id, name").order("name");
      setProperties((data ?? []) as PropertySummary[]);
    })();
  }, [user]);

  // Empleados (tabla employees) con can_upload_reports también pueden subir,
  // además de los roles admin/team. null = comprobando.
  const [empAllowed, setEmpAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user?.email) { setEmpAllowed(false); return; }
    void (async () => {
      const { data } = await supabase
        .from("employees")
        .select("can_upload_reports, permissions")
        .eq("email", user.email)
        .maybeSingle();
      setEmpAllowed(hasPermission(data, "upload_reports"));
    })();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">{t('admin.common.loading')}</div>;
  if (!user) return <Navigate to="/empleados" replace />;
  // Acceso: roles admin/team (team_members) O empleado con permiso de reportes.
  const isStaff = role === "admin" || role === "team";
  if (!isStaff) {
    if (empAllowed === null) {
      return <div className="min-h-screen flex items-center justify-center">{t('admin.common.loading')}</div>;
    }
    if (!empAllowed) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6 text-center">
          <div>
            <h1 className="text-3xl font-serif mb-4">{t('admin.equipoUpload.accessRestrictedTitle')}</h1>
            <p>{t('admin.equipoUpload.accessRestrictedBody')}</p>
          </div>
        </div>
      );
    }
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
      // Refresca la lista para que el reporte recién subido aparezca arriba
      // (confirmación visible de que SÍ se ha guardado).
      void loadUploads();
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">{t('admin.equipoUpload.title')}</h1>
          <p className="text-sm opacity-80">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher inverted />
          <button onClick={() => navigate("/empleados/dashboard")} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
            {t('admin.equipoUpload.btnAdmin')}
          </button>
          <button onClick={() => void signOut()} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
            {t('admin.common.logout')}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelProject')}</label>
            <select
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
            >
              <option value="">{t('admin.equipoUpload.chooseProject')}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelTitle')}</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('admin.equipoUpload.placeholderTitle')}
                className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelProgress')}</label>
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
            <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelSummary')}</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder={t('admin.equipoUpload.placeholderSummary')}
              className="block w-full rounded-lg border border-primary/20 px-4 py-3 focus:ring-2 focus:ring-primary/40 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelVisibility')}</label>
            <div className="flex gap-3">
              {(["all", "listers-only"] as Visibility[]).map((v) => (
                <label key={v} className="flex items-center gap-2 px-4 py-2 border border-primary/20 rounded-lg cursor-pointer">
                  <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} />
                  <span className="text-sm">
                    {v === "all" ? t('admin.equipoUpload.visAll') : t('admin.equipoUpload.visListers')}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">{t('admin.equipoUpload.labelFiles')}</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/30 rounded-2xl p-8 text-center cursor-pointer hover:bg-primary/5 transition"
            >
              <p className="text-primary/70">{t('admin.equipoUpload.dropHere')}</p>
              <p className="text-xs text-primary/50 mt-1">{t('admin.equipoUpload.dropHint')}</p>
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
                      {t('admin.equipoUpload.removeFile')}
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
            {submitState === "submitting" ? t('admin.equipoUpload.submitting') : t('admin.equipoUpload.submit')}
          </button>

          {submitState === "ok" && (
            <p className="text-green-700 text-sm">{t('admin.equipoUpload.successMsg')}</p>
          )}
          {submitError && <p className="text-red-700 text-sm">{submitError}</p>}
        </form>

        {/* === Reportes ya subidos: seguimiento/checklist para el equipo === */}
        {(() => {
          const propName: Record<string, string> = {};
          for (const p of properties) propName[p.id] = p.name;
          const shown = uploads.filter((u) => !listFilter || u.property_id === listFilter);
          const fmtDate = (s: string) => {
            try { return new Date(s).toLocaleDateString(i18n.language || "es", { day: "2-digit", month: "short", year: "numeric" }); }
            catch { return s; }
          };
          const fmtTime = (s: string) => {
            try { return new Date(s).toLocaleTimeString(i18n.language || "es", { hour: "2-digit", minute: "2-digit" }); }
            catch { return ""; }
          };
          return (
            <section className="mt-12">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-serif text-2xl text-primary">{t("admin.equipoUpload.uploadedTitle", { defaultValue: "Reportes subidos" })}</h2>
                  <p className="text-sm text-primary/50">{t("admin.equipoUpload.uploadedSubtitle", { defaultValue: "Aquí ves lo que ya has publicado y sus archivos. Si tu reporte aparece en la lista, se ha subido bien." })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} className="rounded-lg border border-primary/20 px-3 py-2 text-sm">
                    <option value="">{t("admin.equipoUpload.allProjects", { defaultValue: "Todos los proyectos" })}</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button type="button" onClick={() => void loadUploads()} className="text-sm bg-primary/10 hover:bg-primary/20 text-primary px-3 py-2 rounded-lg inline-flex items-center gap-1" title={t("admin.common.refresh", { defaultValue: "Actualizar" })}>
                    <span className="material-symbols-outlined text-base">refresh</span>
                  </button>
                </div>
              </div>

              {loadingUploads ? (
                <p className="text-sm text-primary/50">{t("admin.common.loading")}</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-primary/50">{t("admin.equipoUpload.noUploads", { defaultValue: "Todavía no hay reportes subidos para este filtro." })}</p>
              ) : (
                <ul className="space-y-3">
                  {shown.map((u) => (
                    <li key={u.id} className="bg-white rounded-2xl border border-primary/10 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="material-symbols-outlined text-green-600 text-lg leading-none">check_circle</span>
                            <span className="font-bold text-primary break-words">{u.title}</span>
                            {typeof u.pct_progress_at_update === "number" && (
                              <span className="text-[11px] font-bold bg-primary/5 text-primary px-2 py-0.5 rounded-full">{u.pct_progress_at_update}%</span>
                            )}
                            {u.visibility === "listers-only" && (
                              <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">{t("admin.equipoUpload.visListers")}</span>
                            )}
                          </div>
                          <p className="text-xs text-primary/50 mt-1 break-words">
                            {propName[u.property_id] || "—"} · {fmtDate(u.posted_at)} {fmtTime(u.posted_at)}
                          </p>
                          {u.summary && <p className="text-sm text-primary/70 mt-1 break-words">{u.summary}</p>}
                        </div>
                        <span className="text-[11px] font-bold text-primary/40 shrink-0">{(u._assets?.length || 0)} {t("admin.equipoUpload.filesCount", { defaultValue: "archivos" })}</span>
                      </div>

                      {u._assets && u._assets.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {u._assets.map((a: any, i: number) => (
                            a.asset_type === "image" ? (
                              <a key={i} href={a.external_url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-primary/10">
                                <img src={a.external_url} alt={a.file_name || ""} className="w-full h-full object-cover" loading="lazy" />
                              </a>
                            ) : (
                              <a key={i} href={a.external_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold bg-primary/5 hover:bg-primary/15 text-primary px-3 py-2 rounded-lg">
                                <span className="material-symbols-outlined text-base leading-none">{a.asset_type === "pdf" ? "picture_as_pdf" : a.asset_type === "video" ? "movie" : "description"}</span>
                                <span className="truncate max-w-[160px]">{a.file_name || a.asset_type}</span>
                              </a>
                            )
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })()}
      </main>
    </div>
  );
}
