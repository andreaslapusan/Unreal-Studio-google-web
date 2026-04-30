/**
 * /agencias/dashboard — Dashboard de la agencia logueada.
 * Lista los proyectos asignados a la agencia desde Supabase.
 */
import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { compressImage } from "../lib/imageCompress";
import { projectSeoSlug } from "../lib/projectUrl";

interface PartnerRow {
  id: string;
  agency_name: string;
  status: string;
  projects_assigned: string[] | null;
  logo_url: string | null;
  personal_link_slug: string | null;
}

interface PropertyRow {
  id: string;
  slug?: string;
  name: string;
  short_pitch: string | null;
  area: string | null;
  pct_progress: number | null;
  delivery_date: string | null;
  hero_image_url: string | null;
  brand_pdf_url: string | null;
  walkthrough_url: string | null;
}

export default function AgenciasDashboard() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [projects, setProjects] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data: partnerRow, error: partnerErr } = await supabase
          .from("listing_partners")
          .select("id, agency_name, status, projects_assigned, logo_url, personal_link_slug")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (partnerErr) throw partnerErr;
        if (!partnerRow) {
          setError("Tu cuenta aún no está vinculada a una agencia. Contacta soporte.");
          setLoading(false);
          return;
        }
        setPartner(partnerRow as PartnerRow);

        const ids = partnerRow.projects_assigned ?? [];
        if (!ids.length) {
          setProjects([]);
          setLoading(false);
          return;
        }
        const { data: props, error: propErr } = await supabase
          .from("properties")
          .select("id, slug, name, short_pitch, area, pct_progress, delivery_date, hero_image_url, brand_pdf_url, walkthrough_url")
          .in("id", ids);
        if (propErr) throw propErr;
        setProjects((props ?? []) as PropertyRow[]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">{t('agenciasDashboard.loadingAuth')}</div>;
  if (!user) return <Navigate to="/agencias" replace />;
  if (role && role !== "lister" && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">{t('agenciasDashboard.accessDenied')}</h1>
          <p>{t('agenciasDashboard.accessDeniedBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl">{t('agenciasDashboard.headerTitle')}</h1>
          <p className="text-sm opacity-80">{partner?.agency_name ?? user.email}</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link to="/agencias/stats" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">{t('agenciasDashboard.navStats')}</Link>
          <button onClick={() => void signOut()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">{t('agenciasDashboard.navLogout')}</button>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {partner && (
          <BrandingPanel
            partner={partner}
            onUpdate={(p) => setPartner((prev) => (prev ? { ...prev, ...p } : prev))}
          />
        )}

        {loading && <p>{t('agenciasDashboard.loadingProjects')}</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && projects.length === 0 && (
          <div className="bg-white/60 rounded-xl p-6 text-center">
            <p className="text-primary/70">{t('agenciasDashboard.noProjectsYet')}</p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {projects.map((p) => (
            <article key={p.id} className="glass-card rounded-2xl overflow-hidden shadow-sm">
              {p.hero_image_url && (
                <img src={p.hero_image_url} alt={p.name} className="w-full h-48 object-cover" loading="lazy" />
              )}
              <div className="p-6">
                <h2 className="font-serif text-xl text-primary mb-2">{p.name}</h2>
                {p.area && <p className="text-sm text-primary/60">{p.area}</p>}
                {p.short_pitch && <p className="mt-2 text-sm">{p.short_pitch}</p>}
                {typeof p.pct_progress === "number" && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{t('agenciasDashboard.constructionProgress')}</span>
                      <span className="font-bold">{p.pct_progress}%</span>
                    </div>
                    <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${p.pct_progress}%` }} />
                    </div>
                  </div>
                )}
                {p.delivery_date && (
                  <p className="text-xs text-primary/60 mt-2">
                    {t('agenciasDashboard.estimatedDelivery')} <strong>{p.delivery_date}</strong>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  {p.brand_pdf_url && (
                    <a href={p.brand_pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-primary text-white px-3 py-2 rounded-full">
                      {t('agenciasDashboard.dossier')}
                    </a>
                  )}
                  {p.walkthrough_url && (
                    <a href={p.walkthrough_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-white border border-primary text-primary px-3 py-2 rounded-full">
                      {t('agenciasDashboard.walkthrough')}
                    </a>
                  )}
                  {partner && p.slug && (
                    <ShareWithClientButton
                      partnerId={partner.id}
                      partnerSlug={partner.personal_link_slug}
                      slug={p.slug}
                      location={p.area ?? null}
                    />
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function ShareWithClientButton({
  partnerId,
  partnerSlug,
  slug,
  location,
}: {
  partnerId: string;
  partnerSlug: string | null;
  slug: string;
  location: string | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://unrealstudiobali.com";
    const partnerParam = partnerSlug ?? partnerId;
    const seoSlug = projectSeoSlug({ slug, location });
    const url = `${base}/proyecto/${seoSlug}?utm_source=lister&utm_partner=${partnerParam}&utm_property=${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.prompt(t('agenciasDashboard.copyPrompt'), url);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-xs px-3 py-2 rounded-full transition ${
        copied ? "bg-green-600 text-white" : "bg-white border border-primary text-primary hover:bg-primary/5"
      }`}
    >
      {copied ? t('agenciasDashboard.copied') : t('agenciasDashboard.shareWithClient')}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function BrandingPanel({
  partner,
  onUpdate,
}: {
  partner: PartnerRow;
  onUpdate: (patch: Partial<PartnerRow>) => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const base = typeof window !== "undefined" ? window.location.origin : "https://unrealstudiobali.com";
  const partnerParam = partner.personal_link_slug ?? partner.id;
  const catalogLink = `${base}/proyectos?utm_source=lister&utm_partner=${partnerParam}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(catalogLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      window.prompt(t('agenciasDashboard.copyPersonalLinkPrompt'), catalogLink);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('agenciasDashboard.logoErrorSize'));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError(t('agenciasDashboard.logoErrorType'));
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      // Compress to WebP at max 800px — logos are small UI elements; bigger
      // origin file = wasted bytes for everyone downloading the dashboard.
      const compressed = await compressImage(file, { maxDim: 800, quality: 0.85 });
      const ext = compressed.name.split(".").pop()?.toLowerCase() ?? "webp";
      const path = `partner-logos/${partner.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("images")
        .upload(path, compressed, { cacheControl: "3600", upsert: true, contentType: compressed.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("images").getPublicUrl(path);
      const logoUrl = pub.publicUrl;

      const { error: updErr } = await supabase
        .from("listing_partners")
        .update({ logo_url: logoUrl })
        .eq("id", partner.id);
      if (updErr) throw updErr;

      onUpdate({ logo_url: logoUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="grid md:grid-cols-2 gap-6">
      {/* Logo upload */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
        <h3 className="font-serif text-lg text-primary mb-1">{t('agenciasDashboard.logoTitle')}</h3>
        <p className="text-xs text-primary/60 mb-4">{t('agenciasDashboard.logoBody')}</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl bg-almond border border-primary/10 flex items-center justify-center overflow-hidden shrink-0">
            {partner.logo_url ? (
              <img src={partner.logo_url} alt={partner.agency_name} className="w-full h-full object-contain" />
            ) : (
              <span className="text-3xl">🏷️</span>
            )}
          </div>
          <div className="flex-1">
            <label
              className={`inline-block text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full cursor-pointer transition ${
                uploading
                  ? "bg-primary/30 text-white"
                  : "bg-primary text-white hover:translate-y-[-1px]"
              }`}
            >
              {uploading ? t('agenciasDashboard.logoUploading') : partner.logo_url ? t('agenciasDashboard.logoChange') : t('agenciasDashboard.logoUpload')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            <p className="text-[10px] text-primary/40 mt-2">{t('agenciasDashboard.logoFormatHint')}</p>
            {uploadError && <p className="text-[11px] text-red-600 mt-1">{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* Personal share link */}
      <div className="bg-primary text-white rounded-2xl p-6 shadow-sm">
        <h3 className="font-serif text-lg mb-1">{t('agenciasDashboard.linkTitle')}</h3>
        <p className="text-xs text-white/70 mb-4">{t('agenciasDashboard.linkBody')}</p>
        <div className="bg-white/10 rounded-lg p-3 mb-3">
          <code className="text-[11px] break-all text-white/90">{catalogLink}</code>
        </div>
        <button
          onClick={copyLink}
          className={`w-full text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-full transition ${
            linkCopied ? "bg-green-500 text-white" : "bg-white text-primary hover:translate-y-[-1px]"
          }`}
        >
          {linkCopied ? t('agenciasDashboard.linkCopied') : t('agenciasDashboard.linkCopy')}
        </button>
        {partner.personal_link_slug && (
          <p className="text-[10px] text-white/50 mt-3">
            {t('agenciasDashboard.linkSlugLabel')} <strong>{partner.personal_link_slug}</strong>
          </p>
        )}
      </div>
    </section>
  );
}
