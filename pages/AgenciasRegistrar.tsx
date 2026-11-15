/**
 * /agencias/registrar — Public application form for new listing partners.
 * Goes through the RPC agency_apply (honeypot, time-to-submit, terms, friendly duplicates, per-IP limit).
 * The outreach link (?ref=<token>&lang=&utm_*) prefills the email and is stored on the application;
 * agency-hub verifies the token server-side and auto-approves (plan items 2, 8, 9, 15, 16, 19).
 * No lead_attributions/GHL push here: agencies reach GHL only once approved (item 25).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { portalPath } from "../lib/portalUrls";
import { isOnSaleOnWeb, shortProjectName } from "../components/agency/useAgencyData";
import { trackLead } from "../lib/fbPixel";
import { gtmGenerateLead } from "../lib/gtm";

interface FormState {
  agency_name: string;
  manager_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  country: string;
  projects_interested: string[];
  experience: string;
  monthly_volume: string;
  source: string;
  notes: string;
}

const OTHER = "__other__";

/** Email inside the outreach token, for prefill only (the signature is checked on the server). */
function emailFromRef(ref: string | null): string {
  if (!ref || !ref.includes(".")) return "";
  try {
    const b = ref.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const p = JSON.parse(atob(b + "===".slice((b.length + 3) % 4)));
    return typeof p.email === "string" ? p.email : "";
  } catch { return ""; }
}

export default function AgenciasRegistrar() {
  const { t, i18n } = useTranslation();
  const [sp] = useSearchParams();
  const ref = sp.get("ref");
  const lang = (["es", "en", "ro", "id"].includes(sp.get("lang") ?? "") ? sp.get("lang") : (i18n.language || "es").slice(0, 2)) as string;
  const started = useRef(Date.now());
  const [honey, setHoney] = useState("");
  const [terms, setTerms] = useState(false);
  const [auto, setAuto] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  useEffect(() => { if (sp.get("lang") && sp.get("lang") !== i18n.language) void i18n.changeLanguage(sp.get("lang") as string); }, [sp, i18n]);
  useEffect(() => {
    // Live list = what is for sale on the website (same rule as /proyectos).
    void supabase.from("projects").select("name, is_hidden, visibility_status, sort_order").order("sort_order", { ascending: true })
      .then(({ data }) => setProjects([...new Set((data ?? []).filter(isOnSaleOnWeb).map((p) => shortProjectName(p.name)))]));
  }, []);
  const prefillEmail = useMemo(() => emailFromRef(ref), [ref]);
  const [form, setForm] = useState<FormState>({
    agency_name: "",
    manager_name: "",
    email: prefillEmail,
    phone: "",
    whatsapp: "",
    website: "",
    country: "",
    projects_interested: [],
    experience: "",
    monthly_volume: "",
    source: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleProject = (p: string) => {
    setForm((s) => {
      const exists = s.projects_interested.includes(p);
      return {
        ...s,
        projects_interested: exists
          ? s.projects_interested.filter((x) => x !== p)
          : [...s.projects_interested, p],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agency_name || !form.email) return;
    if (!terms) { setError(t("agencyFunnel.signup.terms_required")); return; }
    setSubmitting(true);
    setError("");
    try {
      const { data, error: rpcErr } = await supabase.rpc("agency_apply", { p: {
        ...form,
        projects_interested: form.projects_interested.map((x) => (x === OTHER ? t("agencyFunnel.signup.other") : x)),
        email: form.email.trim().toLowerCase(),
        lang, ref, campaign: sp.get("utm_campaign"),
        utm_source: sp.get("utm_source"), utm_medium: sp.get("utm_medium"), utm_campaign: sp.get("utm_campaign"),
        accept_terms: terms, company_url: honey, elapsed_ms: Date.now() - started.current,
      } });
      if (rpcErr) throw rpcErr;
      const status = (data as { status: string; auto?: boolean })?.status;
      if (status !== "ok") { setError(t(`agencyFunnel.signup.${status}`, { defaultValue: t("agencyFunnel.err.generic") })); return; }
      setAuto(!!(data as { auto?: boolean }).auto);

      // Meta Pixel — Lead event for the listing partner application.
      trackLead({ content_name: 'Listing Partner application', content_category: 'agencias_registrar' });
      gtmGenerateLead({ form_id: 'agencias_registrar', form_destination: 'supabase' });

      setSubmitted(true);
    } catch {
      setError(t("agencyFunnel.err.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-almond px-6 py-16">
        <div className="max-w-md text-center glass-card rounded-2xl p-10 shadow-xl">
          <span className="material-symbols-outlined text-5xl text-green-600 mb-3">check_circle</span>
          <h1 className="text-3xl font-serif text-primary mb-3">{t('agenciasRegistrar.successTitle')}</h1>
          <p className="text-primary/70 mb-6">{auto ? t('agencyFunnel.signup.successAuto') : t('agenciasRegistrar.successBody')}</p>
          <button
            onClick={() => navigate("/")}
            className="bg-primary text-white px-6 py-3 rounded-full font-bold"
          >{t('agenciasRegistrar.backHome')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond px-4 md:px-6 pt-6 pb-12 md:py-16">
      <div className="max-w-2xl mx-auto">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#A0522D] mb-3">{t('agenciasPartnership.tag')}</p>
        <h1 className="text-4xl md:text-5xl font-serif text-primary leading-[1.05] mb-3">{t('agenciasRegistrar.title')}</h1>
        <p className="text-primary/70 mb-6 md:mb-8 leading-relaxed">{t('agenciasRegistrar.intro')}</p>

        <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-primary/5">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.agencyName')}</span>
              <input
                type="text" required value={form.agency_name}
                onChange={(e) => update("agency_name", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.managerName')}</span>
              <input
                type="text" value={form.manager_name}
                onChange={(e) => update("manager_name", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.email')}</span>
              <input
                type="email" required value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.whatsapp')}</span>
              <input
                type="tel" value={form.whatsapp}
                onChange={(e) => update("whatsapp", e.target.value)}
                placeholder="+62 812..."
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.country')}</span>
              <input
                type="text" value={form.country}
                onChange={(e) => update("country", e.target.value)}
                placeholder={t('agenciasRegistrar.countryPlaceholder')}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.website')}</span>
              <input
                type="url" value={form.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="https://"
                className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-medium text-primary block mb-2">{t('agenciasRegistrar.projectsInterest')}</span>
            <div className="flex flex-wrap gap-2">
              {[...projects, OTHER].map((p) => {
                const checked = form.projects_interested.includes(p);
                return (
                  <button
                    type="button"
                    key={p}
                    onClick={() => toggleProject(p)}
                    className={`text-xs px-3 py-2 rounded-full border transition ${
                      checked
                        ? "bg-primary text-white border-primary"
                        : "bg-white border-primary/20 text-primary hover:bg-primary/5"
                    }`}
                  >
                    {p === OTHER ? t('agencyFunnel.signup.other') : p}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.monthlyVolume')}</span>
            <select
              aria-label={t('agenciasRegistrar.monthlyVolume')}
              value={form.monthly_volume}
              onChange={(e) => update("monthly_volume", e.target.value)}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            >
              <option value="">{t('agenciasRegistrar.volumeSelect')}</option>
              <option>{t('agenciasRegistrar.vol1')}</option>
              <option>{t('agenciasRegistrar.vol2')}</option>
              <option>{t('agenciasRegistrar.vol3')}</option>
              <option>{t('agenciasRegistrar.vol4')}</option>
              <option>{t('agenciasRegistrar.vol5')}</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.experience')}</span>
            <textarea
              value={form.experience}
              onChange={(e) => update("experience", e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.howKnow')}</span>
            <input
              type="text" value={form.source}
              onChange={(e) => update("source", e.target.value)}
              placeholder={t('agenciasRegistrar.sourcePlaceholder')}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-primary">{t('agenciasRegistrar.notes')}</span>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none"
            />
          </label>

          {/* Honeypot: invisible for people, bots fill it. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label>Company URL<input tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} /></label>
          </div>

          <label className="flex items-start gap-2 text-sm text-primary/80">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required className="mt-1" />
            <span>{t('agencyFunnel.signup.acceptPre')} <a href="/terminos" target="_blank" rel="noopener noreferrer" className="underline">{t('agencyFunnel.signup.terms')}</a>, <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">{t('agencyFunnel.signup.privacy')}</a> {t('agencyFunnel.signup.and')} {t('agencyFunnel.signup.agreement')}</span>
          </label>

          <button
            type="submit"
            disabled={submitting || !form.agency_name || !form.email || !terms}
            className="w-full bg-primary text-white border border-primary py-3 rounded-lg font-bold hover:bg-almond hover:text-primary transition disabled:opacity-50 disabled:hover:bg-primary disabled:hover:text-white"
          >
            {submitting ? t('agenciasRegistrar.submitting') : t('agenciasRegistrar.submit')}
          </button>

          {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

          <p className="text-xs text-primary/50 text-center">{t('agenciasRegistrar.alreadyPartner')} <a href={portalPath('agencias')} className="underline">{t('agenciasRegistrar.loginHere')}</a>.</p>
        </form>
      </div>
    </div>
  );
}
