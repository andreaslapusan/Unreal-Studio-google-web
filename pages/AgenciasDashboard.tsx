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
import { uiLocale } from "../lib/dateLocale";
import PortalHeader from "../components/PortalHeader";
import Footer from "../components/Footer";

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
  const [showInfo, setShowInfo] = useState(false);

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
          setError(t('agenciasDashboard.accountNotLinked'));
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
      <PortalHeader
        subtitle={partner?.agency_name ?? user.email ?? undefined}
        onLogout={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/agencias/login'; }}
        extra={
          <>
            <button
              onClick={() => setShowInfo(true)}
              aria-label={t('agenciasDashboard.instructions', 'Instrucciones')}
              className="w-9 h-9 rounded-full bg-white border border-primary/10 text-primary flex items-center justify-center shadow-sm hover:bg-primary hover:text-white transition"
            >
              <span className="material-symbols-outlined text-[20px]">info</span>
            </button>
            <Link to="/agencias/stats" className="bg-white border border-primary/10 text-primary/70 hover:bg-primary hover:text-white px-3 md:px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition shadow-sm">
              {t('agenciasDashboard.navStats')}
            </Link>
          </>
        }
      />

      {showInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowInfo(false)}>
          <div className="ust-modal bg-white rounded-2xl shadow-2xl p-7 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-gray-400 hover:text-primary transition">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-2xl font-serif text-primary mb-4">{t('agenciasDashboard.infoTitle', 'Cómo usar tu portal de agencia')}</h2>
            <ul className="space-y-3 text-sm text-primary/70 leading-relaxed list-disc pl-5">
              <li>{t('agenciasDashboard.infoStep1', 'Consulta los proyectos que tienes asignados y su material de marca (PDF, recorrido virtual).')}</li>
              <li>{t('agenciasDashboard.infoStep2', 'Personaliza tu marca (logo y enlace personal) en el panel superior para compartir con tus clientes.')}</li>
              <li>{t('agenciasDashboard.infoStep3', 'Usa tu enlace personal para que las visitas y reservas queden atribuidas a tu agencia.')}</li>
              <li>{t('agenciasDashboard.infoStep4', 'Revisa tus estadísticas desde el botón de estadísticas del menú superior.')}</li>
            </ul>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {partner && (
          <BrandingPanel
            partner={partner}
            onUpdate={(p) => setPartner((prev) => (prev ? { ...prev, ...p } : prev))}
          />
        )}

        {partner && <AgencyLeadsPanel partnerId={partner.id} projects={projects} />}

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

      {/* Footer compartido (a lo ancho; el root no tiene padding lateral) */}
      <div className="mt-12">
        <Footer />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

interface AgencyLead {
  id: string;
  created_at: string;
  client_name: string;
  client_email: string | null;
  property_id: string | null;
  status: string;
}

const EMPTY_LEAD = { client_name: "", client_email: "", client_phone: "", country: "", property_id: "", budget: "", notes: "" };

function AgencyLeadsPanel({ partnerId, projects }: { partnerId: string; projects: PropertyRow[] }) {
  const { t } = useTranslation();
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("agency_leads")
      .select("id, created_at, client_name, client_email, property_id, status")
      .eq("agency_id", partnerId)
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setLeads((data ?? []) as AgencyLead[]);
  };
  useEffect(() => { void load(); }, [partnerId]);

  const set = (k: keyof typeof EMPTY_LEAD) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_name.trim() || (!form.client_email.trim() && !form.client_phone.trim())) {
      setErr(t('agenciasDashboard.leads.errRequired'));
      return;
    }
    setSaving(true);
    setErr("");
    const row = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, (v as string).trim() || null]));
    const { error } = await supabase.from("agency_leads").insert({ ...row, agency_id: partnerId });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setForm(EMPTY_LEAD);
    setOpen(false);
    void load();
  };

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";
  const input = "w-full border border-primary/15 rounded-lg px-3 py-2 text-sm bg-white";

  return (
    <section className="bg-white rounded-2xl p-6 shadow-sm border border-primary/5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="font-serif text-lg text-primary">{t('agenciasDashboard.leads.title')}</h3>
          <p className="text-xs text-primary/60">{t('agenciasDashboard.leads.body')}</p>
        </div>
        <button onClick={() => { setErr(""); setOpen(true); }} className="shrink-0 text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full bg-primary text-white hover:translate-y-[-1px] transition">
          {t('agenciasDashboard.leads.register')}
        </button>
      </div>

      {!open && err && <p className="text-xs text-red-600 mb-2">{err}</p>}
      {leads.length === 0 ? (
        <p className="text-sm text-primary/50">{t('agenciasDashboard.leads.empty')}</p>
      ) : (
        <ul className="divide-y divide-primary/10 text-sm">
          {leads.map((l) => (
            <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-primary">{l.client_name}</span>
              <span className="text-primary/60 truncate">{projectName(l.property_id)}</span>
              <span className="text-xs text-primary/50">{new Date(l.created_at).toLocaleString(uiLocale(), { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-almond px-2 py-1 rounded-full">{t(`agenciasDashboard.leads.status.${l.status}`)}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <form onSubmit={submit} className="ust-modal bg-white rounded-2xl shadow-2xl p-7 relative w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('agenciasDashboard.leads.close')} className="absolute top-4 right-4 text-gray-400 hover:text-primary transition">
              <span className="material-symbols-outlined">close</span>
            </button>
            <h2 className="text-2xl font-serif text-primary">{t('agenciasDashboard.leads.register')}</h2>
            <input className={input} placeholder={t('agenciasDashboard.leads.name')} value={form.client_name} onChange={set("client_name")} required maxLength={200} />
            <input className={input} type="email" placeholder={t('agenciasDashboard.leads.email')} value={form.client_email} onChange={set("client_email")} maxLength={200} />
            <input className={input} type="tel" placeholder={t('agenciasDashboard.leads.phone')} value={form.client_phone} onChange={set("client_phone")} maxLength={50} />
            <input className={input} placeholder={t('agenciasDashboard.leads.country')} value={form.country} onChange={set("country")} maxLength={100} />
            <select className={input} value={form.property_id} onChange={set("property_id")}>
              <option value="">{t('agenciasDashboard.leads.project')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className={input} placeholder={t('agenciasDashboard.leads.budget')} value={form.budget} onChange={set("budget")} maxLength={100} />
            <textarea className={input} rows={3} placeholder={t('agenciasDashboard.leads.notes')} value={form.notes} onChange={set("notes")} maxLength={2000} />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button type="submit" disabled={saving} className="w-full text-xs font-bold uppercase tracking-widest px-4 py-3 rounded-full bg-primary text-white disabled:opacity-50">
              {saving ? t('agenciasDashboard.leads.saving') : t('agenciasDashboard.leads.submit')}
            </button>
          </form>
        </div>
      )}
    </section>
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
