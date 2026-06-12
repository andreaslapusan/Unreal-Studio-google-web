/**
 * /admin/portal — Manager interno para el equipo Unreal:
 * - CRUD de properties + property_units
 * - Listing partner applications (pendientes / aprobadas)
 * - Asignar proyectos a listing_partners aprobados
 *
 * Acceso: rol admin o team. Si no, redirige a /agencias.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { hasPermission } from "../lib/permissions";
import LanguageSwitcher from "../components/LanguageSwitcher";
import BrandLogo from "../components/BrandLogo";

type Tab = "activity" | "metrics" | "properties" | "units" | "partners" | "applications" | "faqs" | "timelines" | "equipo";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  status: string | null;
  completion_percent: number | null;
  timeline: TimelinePhaseRow[] | null;
}

interface TimelinePhaseRow {
  title: string;
  date?: string;
  payment_pct?: number;
  description?: string;
  status?: "done" | "in_progress" | "pending";
}

interface ActivityEvent {
  id: string;
  kind: string;
  title: string;
  detail: string;
  ts: string;
  href?: string;
}

interface Property {
  id: string;
  slug: string;
  name: string;
  area: string | null;
  pct_progress: number | null;
  delivery_date: string | null;
  hero_image_url: string | null;
  walkthrough_url: string | null;
  brand_pdf_url: string | null;
}

interface Unit {
  id: string;
  property_id: string;
  unit_name: string;
  price_publico: number | null;
  price_inversor: number | null;
  price_agencia: number | null;
  commission_default_pct: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  available: boolean;
  reserved: boolean;
  sold: boolean;
}

interface Partner {
  id: string;
  agency_name: string;
  email: string | null;
  status: string;
  projects_assigned: string[] | null;
  user_id: string | null;
}

interface Application {
  id: string;
  agency_name: string;
  manager_name: string | null;
  email: string;
  whatsapp: string | null;
  country: string | null;
  projects_interested: string[] | null;
  monthly_volume: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[] | null;
  project_filter: string[] | null;
  language: string;
  is_published: boolean;
  sort_order: number;
  source: string | null;
  updated_at: string | null;
}

const FAQ_CATEGORIES = [
  "compra",
  "leasehold",
  "construccion",
  "alquiler",
  "fiscalidad",
  "legal",
  "general",
] as const;

export default function AdminPortalManager() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("activity");
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [projectsCatalog, setProjectsCatalog] = useState<ProjectRow[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    void reloadAll();
  }, [user]);

  const reloadAll = async () => {
    setLoading(true);
    try {
      const [p, u, lp, app, updates, attribs, faqRes, projRes] = await Promise.all([
        supabase.from("properties").select("id, slug, name, area, pct_progress, delivery_date, hero_image_url, walkthrough_url, brand_pdf_url").order("name"),
        supabase.from("property_units").select("id, property_id, unit_name, price_publico, price_inversor, price_agencia, commission_default_pct, bedrooms, bathrooms, available, reserved, sold").order("unit_name"),
        supabase.from("listing_partners").select("id, agency_name, email, status, projects_assigned, user_id").order("agency_name"),
        supabase.from("listing_partner_applications").select("id, agency_name, manager_name, email, whatsapp, country, projects_interested, monthly_volume, notes, status, created_at").order("created_at", { ascending: false }),
        supabase.from("property_updates").select("id, property_id, title, posted_by, posted_at, visibility").order("posted_at", { ascending: false }).limit(15),
        supabase.from("lead_attributions").select("id, partner_id, property_slug, event_type, contact_email, created_at").order("created_at", { ascending: false }).limit(15),
        supabase.from("faqs").select("id, question, answer, category, tags, project_filter, language, is_published, sort_order, source, updated_at").order("sort_order"),
        supabase.from("projects").select("id, slug, name, status, completion_percent, timeline").order("sort_order"),
      ]);
      setProperties((p.data ?? []) as Property[]);
      setUnits((u.data ?? []) as Unit[]);
      setPartners((lp.data ?? []) as Partner[]);
      setApplications((app.data ?? []) as Application[]);
      setFaqs((faqRes.data ?? []) as Faq[]);
      setProjectsCatalog((projRes.data ?? []) as ProjectRow[]);

      // Build a unified activity feed
      const events: ActivityEvent[] = [];
      for (const a of (app.data ?? []).slice(0, 8)) {
        events.push({
          id: `app-${a.id}`,
          kind: t('fix.apm.activityAgencyRequest'),
          title: a.agency_name,
          detail: `${a.email} · ${a.country ?? "—"} · ${a.status}`,
          ts: a.created_at,
        });
      }
      for (const up of (updates.data ?? []).slice(0, 10)) {
        events.push({
          id: `upd-${up.id}`,
          kind: t('fix.apm.activityWorkUpdate'),
          title: up.title,
          detail: `${up.posted_by} · ${up.visibility}`,
          ts: up.posted_at,
        });
      }
      for (const at of (attribs.data ?? []).slice(0, 10)) {
        events.push({
          id: `at-${at.id}`,
          kind: t('fix.apm.activityListerAttribution'),
          title: at.event_type,
          detail: `${at.contact_email ?? t('fix.apm.anonymous')} · property: ${at.property_slug ?? "—"}`,
          ts: at.created_at,
        });
      }
      events.sort((a, b) => (b.ts > a.ts ? 1 : -1));
      setActivity(events.slice(0, 30));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Accept either Supabase Auth (Google / magic-link) OR the legacy
  // username+password session that sets `_ust_sh_` in storage. This way
  // admins who logged in through /admin/login (Andreas/Cemagi2025!) can
  // still reach this panel without re-authenticating with Supabase.
  const hasLegacySession =
    typeof window !== "undefined" &&
    (!!localStorage.getItem("_ust_sh_") || !!sessionStorage.getItem("_ust_sh_"));

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">{t('fix.apm.loading')}</div>;
  if (!user && !hasLegacySession) return <Navigate to="/admin/login" replace />;
  if (user && role && role !== "admin" && role !== "team") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">{t('admin.portal.accessRestricted')}</h1>
          <p>{t('fix.apm.internalTeamOnly')}</p>
        </div>
      </div>
    );
  }

  const handleApproveApplication = async (app: Application) => {
    if (!confirm(t('fix.apm.confirmApprove', { name: app.agency_name }))) return;
    try {
      const { error: insErr } = await supabase.from("listing_partners").insert({
        agency_name: app.agency_name,
        manager_name: app.manager_name,
        email: app.email,
        phone: app.whatsapp,
        whatsapp: app.whatsapp,
        country: app.country,
        status: "active",
        approved_at: new Date().toISOString(),
        approved_by: user?.email ?? user?.id ?? "andreas-legacy",
      });
      if (insErr) throw insErr;
      await supabase
        .from("listing_partner_applications")
        .update({ status: "approved", reviewed_by: user?.email ?? user?.id ?? "andreas-legacy", reviewed_at: new Date().toISOString() })
        .eq("id", app.id);
      // Magic link
      const redirect = `${window.location.origin}/auth/finish`;
      await supabase.auth.signInWithOtp({ email: app.email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      await reloadAll();
      alert(t('fix.apm.approvedMagicLinkSent'));
    } catch (err) {
      alert(t('fix.apm.errorPrefix') + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRejectApplication = async (app: Application) => {
    if (!confirm(t('fix.apm.confirmReject', { name: app.agency_name }))) return;
    await supabase
      .from("listing_partner_applications")
      .update({ status: "rejected", reviewed_by: user?.email ?? user?.id ?? "andreas-legacy", reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    await reloadAll();
  };

  const handleAssignProjects = async (partner: Partner) => {
    const current = partner.projects_assigned ?? [];
    const list = properties
      .map((p) => `${current.includes(p.id) ? "[x]" : "[ ]"} ${p.name} (${p.id.slice(0, 8)})`)
      .join("\n");
    const input = prompt(
      t('fix.apm.assignProjectsPrompt', { name: partner.agency_name, list }),
      current.join("\n")
    );
    if (input === null) return;
    const newIds = input.split("\n").map((s) => s.trim()).filter(Boolean);
    await supabase.from("listing_partners").update({ projects_assigned: newIds }).eq("id", partner.id);
    await reloadAll();
  };

  return (
    <div className="min-h-screen bg-almond pb-16">
      {/* Top white logo bar — extends into iOS safe area so the page never
          starts with empty colored space above the chrome. */}
      <div className="bg-white border-b border-primary/10" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo imgClassName="h-7 md:h-8 w-auto object-contain" textClassName="font-serif text-primary text-base md:text-xl tracking-wide" />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button onClick={() => navigate("/admin")} className="hidden sm:block text-xs bg-primary/5 text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold">{t('admin.portal.classicAdmin')}</button>
            <button onClick={() => { localStorage.removeItem("_ust_sh_"); sessionStorage.removeItem("_ust_sh_"); void signOut(); navigate("/admin/login"); }} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold">{t('admin.common.logout')}</button>
          </div>
        </div>
      </div>

      {/* Brown contextual header */}
      <header className="bg-primary text-white px-4 md:px-6 py-4 md:py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-lg md:text-2xl">{t('admin.portal.title')}</h1>
            <p className="text-[10px] md:text-xs opacity-70">{user?.email ?? t('admin.portal.sessionFallback')}</p>
          </div>
          <button onClick={() => navigate("/admin")} className="sm:hidden text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full uppercase tracking-widest font-bold whitespace-nowrap">{t('admin.portal.classicAdmin')}</button>
        </div>
      </header>

      <nav className="max-w-6xl mx-auto px-6 mt-6 flex flex-wrap gap-2">
        {(["activity","properties","units","partners","applications","faqs","timelines","equipo"] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              tab === k ? "bg-primary text-white" : "bg-white/60 text-primary hover:bg-white"
            }`}
          >
            {k === "activity" && `📡 ${t('admin.portal.tabActivity')} (${activity.length})`}
            {k === "properties" && `📁 ${t('admin.portal.tabProperties')} (${properties.length})`}
            {k === "units" && `🏠 ${t('admin.portal.tabUnits')} (${units.length})`}
            {k === "partners" && `🤝 ${t('admin.portal.tabPartners')} (${partners.length})`}
            {k === "applications" && `📨 ${t('admin.portal.tabApplications')} (${applications.filter((a) => a.status === "pending").length})`}
            {k === "faqs" && `❓ FAQs (${faqs.length})`}
            {k === "timelines" && `📅 ${t('fix.apm.tabTimelines')} (${projectsCatalog.filter((p) => Array.isArray(p.timeline) && p.timeline.length > 0).length}/${projectsCatalog.length})`}
            {k === "equipo" && `👷 ${t('admin.portal.tabEquipo')}`}
          </button>
        ))}
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading && <p>{t('admin.common.loading')}</p>}
        {error && <p className="text-red-600">{error}</p>}

        {tab === "activity" && (
          <ActivityTab events={activity} />
        )}
        {tab === "properties" && (
          <PropertiesTab data={properties} onChange={reloadAll} />
        )}
        {tab === "units" && (
          <UnitsTab data={units} properties={properties} onChange={reloadAll} />
        )}
        {tab === "partners" && (
          <PartnersTab data={partners} properties={properties} onAssign={handleAssignProjects} onChange={reloadAll} />
        )}
        {tab === "applications" && (
          <ApplicationsTab data={applications} onApprove={handleApproveApplication} onReject={handleRejectApplication} />
        )}
        {tab === "faqs" && (
          <FaqsTab data={faqs} onChange={reloadAll} />
        )}
        {tab === "timelines" && (
          <TimelinesTab data={projectsCatalog} onChange={reloadAll} />
        )}
        {tab === "equipo" && <EquipoTab />}
      </main>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function ActivityTab({ events }: { events: ActivityEvent[] }) {
  const { t } = useTranslation();
  if (events.length === 0) return <p className="text-primary/60">{t('fix.apm.noRecentActivity')}</p>;
  return (
    <ol className="space-y-2">
      {events.map((e) => (
        <li key={e.id} className="bg-white/60 rounded-lg p-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-primary/60">
              {e.kind} · {new Date(e.ts).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
            </div>
            <div className="font-medium truncate">{e.title}</div>
            <div className="text-xs text-primary/60 truncate">{e.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PropertiesTab({ data, onChange }: { data: Property[]; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);

  const empty: Property = {
    id: "",
    slug: "",
    name: "",
    area: null,
    pct_progress: null,
    delivery_date: null,
    hero_image_url: null,
    walkthrough_url: null,
    brand_pdf_url: null,
  };

  const save = async (row: Property, isNew: boolean) => {
    const payload = { ...row };
    if (isNew) {
      const { id: _omit, ...insertable } = payload;
      void _omit;
      const { error } = await supabase.from("properties").insert(insertable);
      if (error) return alert(error.message);
    } else {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("properties").update(rest).eq("id", id);
      if (error) return alert(error.message);
    }
    setEditing(null);
    setCreating(false);
    await onChange();
  };

  return (
    <div>
      <button
        onClick={() => setCreating(true)}
        className="mb-4 bg-primary text-white px-4 py-2 rounded-full text-sm"
      >
        {t('fix.apm.newProjectBtn')}
      </button>

      <div className="grid gap-4 md:grid-cols-2">
        {data.map((p) => (
          <article key={p.id} className="glass-card rounded-xl p-4">
            <h3 className="font-serif text-lg text-primary">{p.name}</h3>
            <p className="text-xs text-primary/60">slug: {p.slug}</p>
            {p.area && <p className="text-sm">{p.area}</p>}
            {typeof p.pct_progress === "number" && <p className="text-sm">{t('fix.apm.progress', { pct: p.pct_progress })}</p>}
            <button onClick={() => setEditing(p)} className="text-xs underline mt-2">{t('fix.apm.edit')}</button>
          </article>
        ))}
      </div>

      {(editing || creating) && (
        <PropertyEditor
          row={editing ?? empty}
          isNew={creating}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function PropertyEditor({
  row,
  isNew,
  onSave,
  onCancel,
}: {
  row: Property;
  isNew: boolean;
  onSave: (r: Property, isNew: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Property>(row);

  const update = <K extends keyof Property>(k: K, v: Property[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-2xl mb-4">{isNew ? t('admin.portal.newProject') : t('admin.portal.editProject')}</h2>
        <div className="space-y-3">
          <Input label={t('fix.apm.labelSlug')} value={form.slug} onChange={(v) => update("slug", v)} />
          <Input label={t('fix.apm.labelName')} value={form.name} onChange={(v) => update("name", v)} />
          <Input label={t('fix.apm.labelArea')} value={form.area ?? ""} onChange={(v) => update("area", v)} />
          <Input label={t('fix.apm.labelPctWork')} type="number" value={String(form.pct_progress ?? "")} onChange={(v) => update("pct_progress", v ? Number(v) : null)} />
          <Input label={t('fix.apm.labelDeliveryDate')} value={form.delivery_date ?? ""} onChange={(v) => update("delivery_date", v)} />
          <Input label={t('fix.apm.labelHeroImageUrl')} value={form.hero_image_url ?? ""} onChange={(v) => update("hero_image_url", v)} />
          <Input label={t('fix.apm.labelWalkthroughUrl')} value={form.walkthrough_url ?? ""} onChange={(v) => update("walkthrough_url", v)} />
          <Input label={t('fix.apm.labelBrandPdfUrl')} value={form.brand_pdf_url ?? ""} onChange={(v) => update("brand_pdf_url", v)} />
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => void onSave(form, isNew)} className="flex-1 bg-primary text-white py-2 rounded-lg">{t('fix.apm.save')}</button>
          <button onClick={onCancel} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

function UnitsTab({ data, properties, onChange }: { data: Unit[]; properties: Property[]; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Unit | null>(null);
  const [creating, setCreating] = useState(false);

  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  const empty: Unit = {
    id: "",
    property_id: properties[0]?.id ?? "",
    unit_name: "",
    price_publico: null,
    price_inversor: null,
    price_agencia: null,
    commission_default_pct: 5,
    bedrooms: null,
    bathrooms: null,
    available: true,
    reserved: false,
    sold: false,
  };

  const save = async (row: Unit, isNew: boolean) => {
    const payload = { ...row };
    if (isNew) {
      const { id: _omit, ...insertable } = payload;
      void _omit;
      const { error } = await supabase.from("property_units").insert(insertable);
      if (error) return alert(error.message);
    } else {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("property_units").update(rest).eq("id", id);
      if (error) return alert(error.message);
    }
    setEditing(null);
    setCreating(false);
    await onChange();
  };

  const fmt = (n: number | null | undefined) =>
    typeof n === "number" ? new Intl.NumberFormat("es-ES").format(n) : "—";

  return (
    <div>
      <button onClick={() => setCreating(true)} className="mb-4 bg-primary text-white px-4 py-2 rounded-full text-sm">{t('fix.apm.newUnitBtn')}</button>
      <div className="overflow-x-auto bg-white/60 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-primary/10 text-left">
            <tr>
              <th className="p-3">{t('fix.apm.colProject')}</th><th className="p-3">{t('fix.apm.colUnit')}</th>
              <th className="p-3">{t('fix.apm.colPublic')}</th><th className="p-3">{t('fix.apm.colInvestor')}</th><th className="p-3">{t('fix.apm.colAgency')}</th>
              <th className="p-3">{t('fix.apm.colStatus')}</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((u) => (
              <tr key={u.id} className="border-t border-primary/5">
                <td className="p-3 text-primary/70">{propertyName(u.property_id)}</td>
                <td className="p-3 font-medium">{u.unit_name}</td>
                <td className="p-3">{fmt(u.price_publico)}€</td>
                <td className="p-3">{fmt(u.price_inversor)}€</td>
                <td className="p-3">{fmt(u.price_agencia)}€</td>
                <td className="p-3">
                  {u.sold ? t('fix.apm.statusSold') : u.reserved ? t('fix.apm.statusReserved') : u.available ? t('fix.apm.statusAvailable') : t('fix.apm.statusInactive')}
                </td>
                <td className="p-3"><button onClick={() => setEditing(u)} className="underline text-xs">{t('fix.apm.edit')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <UnitEditor
          row={editing ?? empty}
          isNew={creating}
          properties={properties}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function UnitEditor({
  row,
  isNew,
  properties,
  onSave,
  onCancel,
}: {
  row: Unit;
  isNew: boolean;
  properties: Property[];
  onSave: (u: Unit, n: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Unit>(row);
  const update = <K extends keyof Unit>(k: K, v: Unit[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-2xl mb-4">{isNew ? t('admin.portal.newUnit') : t('admin.portal.editUnit')}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">{t('fix.apm.labelProject')}</span>
            <select value={form.property_id} onChange={(e) => update("property_id", e.target.value)} className="block w-full rounded-lg border border-primary/20 px-4 py-2.5 mt-1">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Input label={t('fix.apm.labelUnitName')} value={form.unit_name} onChange={(v) => update("unit_name", v)} />
          <div className="grid grid-cols-3 gap-2">
            <Input label={t('fix.apm.labelPricePublic')} type="number" value={String(form.price_publico ?? "")} onChange={(v) => update("price_publico", v ? Number(v) : null)} />
            <Input label={t('fix.apm.labelPriceInvestor')} type="number" value={String(form.price_inversor ?? "")} onChange={(v) => update("price_inversor", v ? Number(v) : null)} />
            <Input label={t('fix.apm.labelPriceAgency')} type="number" value={String(form.price_agencia ?? "")} onChange={(v) => update("price_agencia", v ? Number(v) : null)} />
          </div>
          <Input label={t('fix.apm.labelDefaultCommission')} type="number" value={String(form.commission_default_pct ?? "")} onChange={(v) => update("commission_default_pct", v ? Number(v) : null)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label={t('fix.apm.labelBedrooms')} type="number" value={String(form.bedrooms ?? "")} onChange={(v) => update("bedrooms", v ? Number(v) : null)} />
            <Input label={t('fix.apm.labelBathrooms')} type="number" value={String(form.bathrooms ?? "")} onChange={(v) => update("bathrooms", v ? Number(v) : null)} />
          </div>
          <div className="flex gap-3">
            <Toggle label={t('fix.apm.toggleAvailable')} value={form.available} onChange={(v) => update("available", v)} />
            <Toggle label={t('fix.apm.toggleReserved')} value={form.reserved} onChange={(v) => update("reserved", v)} />
            <Toggle label={t('fix.apm.toggleSold')} value={form.sold} onChange={(v) => update("sold", v)} />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => void onSave(form, isNew)} className="flex-1 bg-primary text-white py-2 rounded-lg">{t('fix.apm.save')}</button>
          <button onClick={onCancel} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
        </div>
      </div>
    </div>
  );
}

export function PartnersTab({
  data,
  properties,
  onAssign,
  onChange,
}: {
  data: Partner[];
  properties: Property[];
  onAssign: (p: Partner) => Promise<void>;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-3">
      {data.length === 0 && <p className="text-primary/60">{t('fix.apm.noActiveAgencies')}</p>}
      {data.map((p) => (
        <article key={p.id} className="bg-white/60 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg text-primary">{p.agency_name}</h3>
            <p className="text-xs text-primary/60">{p.email} · status: {p.status}</p>
            <p className="text-xs mt-2">
              {t('fix.apm.projectsLabel')} {p.projects_assigned?.length ? p.projects_assigned.map(propertyName).join(", ") : "—"}
            </p>
          </div>
          <button onClick={() => void onAssign(p)} className="text-xs bg-primary text-white px-3 py-2 rounded-full">
            {t('fix.apm.assignProjects')}
          </button>
        </article>
      ))}
    </div>
  );
}

export function ApplicationsTab({
  data,
  onApprove,
  onReject,
}: {
  data: Application[];
  onApprove: (a: Application) => Promise<void>;
  onReject: (a: Application) => Promise<void>;
}) {
  const { t } = useTranslation();
  const pending = useMemo(() => data.filter((a) => a.status === "pending"), [data]);
  const reviewed = useMemo(() => data.filter((a) => a.status !== "pending"), [data]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-serif text-xl mb-3">{t('admin.portal.pendingCount', { count: pending.length })}</h3>
        {pending.length === 0 && <p className="text-primary/60">{t('fix.apm.noPendingRequests')}</p>}
        {pending.map((a) => (
          <article key={a.id} className="bg-white/60 rounded-xl p-4 mb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-serif text-lg text-primary">{a.agency_name}</h4>
                <p className="text-xs text-primary/60">
                  {a.email} · {a.country ?? t('fix.apm.countryUnknown')} · {t('fix.apm.volLabel')} {a.monthly_volume ?? "—"}
                </p>
                {a.manager_name && <p className="text-sm">{t('fix.apm.managerLabel')} {a.manager_name}</p>}
                {a.projects_interested?.length ? (
                  <p className="text-sm mt-2">{t('fix.apm.interestedInLabel')} {a.projects_interested.join(", ")}</p>
                ) : null}
                {a.notes && <p className="text-sm text-primary/60 mt-2 italic">{a.notes}</p>}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => void onApprove(a)} className="text-xs bg-green-600 text-white px-3 py-2 rounded-full">{t('fix.apm.approve')}</button>
                <button onClick={() => void onReject(a)} className="text-xs bg-red-600 text-white px-3 py-2 rounded-full">{t('fix.apm.reject')}</button>
              </div>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h3 className="font-serif text-xl mb-3">{t('admin.portal.reviewedCount', { count: reviewed.length })}</h3>
        {reviewed.map((a) => (
          <div key={a.id} className="text-sm py-2 border-b border-primary/10">
            {a.agency_name} — <span className={a.status === "approved" ? "text-green-700" : "text-red-700"}>{a.status}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

// ─── Tiny inputs ──────────────────────────────────────────────────────────

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ─── FAQ admin ────────────────────────────────────────────────────────────

export function FaqsTab({ data, onChange }: { data: Faq[]; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Faq | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let out = data;
    if (filter === "published") out = out.filter((f) => f.is_published);
    if (filter === "draft") out = out.filter((f) => !f.is_published);
    if (categoryFilter !== "all") out = out.filter((f) => f.category === categoryFilter);
    return out;
  }, [data, filter, categoryFilter]);

  const togglePublish = async (f: Faq) => {
    await supabase.from("faqs").update({ is_published: !f.is_published }).eq("id", f.id);
    await onChange();
  };

  const remove = async (f: Faq) => {
    if (!confirm(t('fix.apm.confirmDeleteFaq', { question: f.question.slice(0, 50) }))) return;
    await supabase.from("faqs").delete().eq("id", f.id);
    await onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t('fix.apm.ariaStatus')}
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "published" | "draft")}
            className="rounded-lg border border-primary/20 px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">{t('fix.apm.allStatuses')}</option>
            <option value="published">{t('fix.apm.published')}</option>
            <option value="draft">{t('fix.apm.drafts')}</option>
          </select>
          <select
            aria-label={t('fix.apm.ariaCategory')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-primary/20 px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">{t('fix.apm.allCategories')}</option>
            {FAQ_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-xs text-primary/50">{t('fix.apm.filteredCount', { shown: filtered.length, total: data.length })}</span>
        </div>
        <button
          onClick={() => setEditing({
            id: "", question: "", answer: "", category: "general",
            tags: [], project_filter: [], language: "es",
            is_published: false, sort_order: (data[data.length - 1]?.sort_order ?? 100) + 10,
            source: "manual", updated_at: null,
          })}
          className="bg-primary text-white px-4 py-2 rounded-full text-sm font-bold"
        >
          {t('fix.apm.newFaqBtn')}
        </button>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-primary/5">
        <table className="w-full text-sm">
          <thead className="bg-almond text-left text-[11px] uppercase tracking-widest text-primary/60">
            <tr>
              <th className="p-3 w-16">{t('fix.apm.colState')}</th>
              <th className="p-3">{t('fix.apm.colQuestion')}</th>
              <th className="p-3 w-28">{t('fix.apm.colCategory')}</th>
              <th className="p-3 w-16">{t('fix.apm.colLang')}</th>
              <th className="p-3 w-20">{t('fix.apm.colOrder')}</th>
              <th className="p-3 w-44">{t('fix.apm.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-t border-primary/5 align-top">
                <td className="p-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${
                    f.is_published ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {f.is_published ? t('fix.apm.badgeLive') : t('fix.apm.badgeDraft')}
                  </span>
                </td>
                <td className="p-3 max-w-md">
                  <div className="font-medium text-primary line-clamp-2">{f.question}</div>
                  <div className="text-[11px] text-primary/50 line-clamp-1 mt-1">{f.answer}</div>
                </td>
                <td className="p-3 text-xs">{f.category}</td>
                <td className="p-3 text-xs uppercase">{f.language}</td>
                <td className="p-3 text-xs">{f.sort_order}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setEditing(f)}
                      className="text-[10px] bg-white border border-primary/20 text-primary px-2 py-1 rounded-full"
                    >
                      {t('fix.apm.edit')}
                    </button>
                    <button
                      onClick={() => void togglePublish(f)}
                      className="text-[10px] bg-primary text-white px-2 py-1 rounded-full"
                    >
                      {f.is_published ? t('fix.apm.unpublish') : t('fix.apm.publish')}
                    </button>
                    <button
                      onClick={() => void remove(f)}
                      className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full"
                    >
                      {t('fix.apm.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-primary/50">
                  {t('fix.apm.noFaqsInFilter')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <FaqEditor
          faq={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChange();
          }}
        />
      )}
    </div>
  );
}

function FaqEditor({ faq, onClose, onSaved }: { faq: Faq; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Faq>(faq);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      setErr(t('fix.apm.questionAnswerRequired'));
      return;
    }
    setSaving(true);
    setErr("");
    try {
      if (form.id) {
        const { error } = await supabase.from("faqs").update({
          question: form.question.trim(),
          answer: form.answer,
          category: form.category,
          tags: form.tags,
          project_filter: form.project_filter,
          language: form.language,
          is_published: form.is_published,
          sort_order: form.sort_order,
        }).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faqs").insert({
          question: form.question.trim(),
          answer: form.answer,
          category: form.category,
          tags: form.tags,
          project_filter: form.project_filter,
          language: form.language,
          is_published: form.is_published,
          sort_order: form.sort_order,
          source: form.source ?? "manual",
        });
        if (error) throw error;
      }
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 overflow-y-auto z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 mt-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl text-primary">{form.id ? t('admin.portal.editFAQ') : t('admin.portal.newFAQ')}</h3>
          <button onClick={onClose} className="text-primary/40 hover:text-primary">✕</button>
        </div>

        <div className="space-y-4">
          <Input
            label={t('fix.apm.labelQuestion')}
            value={form.question}
            onChange={(v) => setForm({ ...form, question: v })}
          />

          <label className="block">
            <span className="text-sm font-medium text-primary">{t('fix.apm.labelAnswer')}</span>
            <textarea
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              rows={10}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40 font-mono text-xs"
            />
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('fix.apm.labelCategory')}</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2.5 outline-none bg-white"
              >
                {FAQ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">{t('fix.apm.labelLanguage')}</span>
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2.5 outline-none bg-white"
              >
                <option value="es">es</option>
                <option value="en">en</option>
                <option value="id">id</option>
              </select>
            </label>
            <Input
              label={t('fix.apm.labelOrder')}
              type="number"
              value={String(form.sort_order)}
              onChange={(v) => setForm({ ...form, sort_order: Number(v) || 100 })}
            />
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              />
              <span className="text-sm">{t('fix.apm.publishedCheckbox')}</span>
            </label>
          </div>

          <Input
            label={t('fix.apm.labelTags')}
            value={(form.tags ?? []).join(", ")}
            onChange={(v) => setForm({ ...form, tags: v.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
          <Input
            label={t('fix.apm.labelProjectFilter')}
            value={(form.project_filter ?? []).join(", ")}
            onChange={(v) => setForm({ ...form, project_filter: v.split(",").map((t) => t.trim()).filter(Boolean) })}
          />

          {err && <p className="text-red-600 text-sm">{err}</p>}

          <div className="flex justify-end gap-2 pt-3 border-t border-primary/5">
            <button onClick={onClose} className="px-4 py-2 rounded-full text-primary border border-primary/20">
              {t('fix.apm.cancel')}
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-white px-6 py-2 rounded-full font-bold disabled:opacity-50"
            >
              {saving ? t('fix.apm.saving') : form.id ? t('fix.apm.save') : t('fix.apm.create')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Timelines admin ──────────────────────────────────────────────────────

export function TimelinesTab({ data, onChange }: { data: ProjectRow[]; onChange: () => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ProjectRow | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-primary/60">
        {t('fix.apm.timelinesIntro')}
      </p>

      <div className="bg-white rounded-xl overflow-hidden border border-primary/5">
        <table className="w-full text-sm">
          <thead className="bg-almond text-left text-[11px] uppercase tracking-widest text-primary/60">
            <tr>
              <th className="p-3">{t('fix.apm.colProject')}</th>
              <th className="p-3 w-28">{t('fix.apm.colStatus')}</th>
              <th className="p-3 w-24">{t('fix.apm.colPctWork')}</th>
              <th className="p-3 w-24">{t('fix.apm.colPhases')}</th>
              <th className="p-3 w-44">{t('fix.apm.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => {
              const phaseCount = Array.isArray(p.timeline) ? p.timeline.length : 0;
              return (
                <tr key={p.id} className="border-t border-primary/5">
                  <td className="p-3">
                    <div className="font-medium text-primary">{p.name}</div>
                    <div className="text-[11px] text-primary/50">{p.slug}</div>
                  </td>
                  <td className="p-3 text-xs">{p.status ?? "—"}</td>
                  <td className="p-3 text-xs">{p.completion_percent ?? 0}%</td>
                  <td className="p-3 text-xs">
                    <span className={`inline-block px-2 py-1 rounded-full text-[10px] font-bold ${
                      phaseCount > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
                    }`}>
                      {phaseCount > 0 ? t('fix.apm.phasesCount', { count: phaseCount }) : t('fix.apm.noTimeline')}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-[10px] bg-primary text-white px-3 py-1.5 rounded-full"
                    >
                      {phaseCount > 0 ? t('fix.apm.edit') : t('fix.apm.createTimeline')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-primary/50">{t('fix.apm.noProjectsInCatalog')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <TimelineEditor
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await onChange(); }}
        />
      )}
    </div>
  );
}

function TimelineEditor({ project, onClose, onSaved }: { project: ProjectRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [phases, setPhases] = useState<TimelinePhaseRow[]>(
    Array.isArray(project.timeline) && project.timeline.length > 0
      ? project.timeline
      : [{ title: "", date: "", payment_pct: 0, description: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const updatePhase = (i: number, patch: Partial<TimelinePhaseRow>) => {
    setPhases(phases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const addPhase = () => {
    setPhases([...phases, { title: "", date: "", payment_pct: 0, description: "" }]);
  };
  const removePhase = (i: number) => {
    setPhases(phases.filter((_, idx) => idx !== i));
  };
  const movePhase = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= phases.length) return;
    const next = phases.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setPhases(next);
  };

  const totalPct = phases.reduce((sum, p) => sum + (Number(p.payment_pct) || 0), 0);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      const cleaned = phases
        .filter((p) => p.title.trim())
        .map((p) => ({
          title: p.title.trim(),
          date: p.date?.trim() || undefined,
          payment_pct: typeof p.payment_pct === "number" ? p.payment_pct : Number(p.payment_pct) || 0,
          description: p.description?.trim() || undefined,
          status: p.status,
        }));
      const { error } = await supabase
        .from("projects")
        .update({ timeline: cleaned.length > 0 ? cleaned : null })
        .eq("id", project.id);
      if (error) throw error;
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    if (!confirm(t('fix.apm.confirmClearTimeline', { name: project.name }))) return;
    setSaving(true);
    try {
      await supabase.from("projects").update({ timeline: null }).eq("id", project.id);
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 overflow-y-auto z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 mt-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-serif text-xl text-primary">{t('admin.portal.timelineFor', { name: project.name })}</h3>
            <p className="text-xs text-primary/50">{project.slug}</p>
          </div>
          <button onClick={onClose} className="text-primary/40 hover:text-primary text-xl">✕</button>
        </div>
        <p className="text-xs text-primary/60 mb-4">
          {t('fix.apm.timelineEditorHelp')}
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {phases.map((p, i) => (
            <div key={i} className="border border-primary/10 rounded-xl p-4 bg-almond/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">
                  {t('fix.apm.phaseN', { n: i + 1 })}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => movePhase(i, -1)} disabled={i === 0} className="text-xs px-2 py-1 rounded bg-white border border-primary/10 disabled:opacity-30">↑</button>
                  <button onClick={() => movePhase(i, 1)} disabled={i === phases.length - 1} className="text-xs px-2 py-1 rounded bg-white border border-primary/10 disabled:opacity-30">↓</button>
                  <button onClick={() => removePhase(i)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">{t('fix.apm.delete')}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
                <Input label={t('fix.apm.labelTitle')} value={p.title} onChange={(v) => updatePhase(i, { title: v })} />
                <Input label={t('fix.apm.labelDate')} value={p.date ?? ""} onChange={(v) => updatePhase(i, { date: v })} />
                <Input label={t('fix.apm.labelPaymentPct')} type="number" value={String(p.payment_pct ?? "")} onChange={(v) => updatePhase(i, { payment_pct: v ? Number(v) : 0 })} />
              </div>
              <label className="block">
                <span className="text-sm font-medium text-primary">{t('fix.apm.labelDescription')}</span>
                <textarea
                  value={p.description ?? ""}
                  onChange={(e) => updatePhase(i, { description: e.target.value })}
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40 text-sm"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-primary/5">
          <button onClick={addPhase} className="text-sm bg-white border border-primary/20 text-primary px-4 py-2 rounded-full">
            {t('fix.apm.addPhase')}
          </button>
          <span className={`text-xs font-bold ${totalPct === 100 ? "text-green-700" : "text-amber-700"}`}>
            {t('fix.apm.totalPayments', { pct: totalPct })} {totalPct === 100 ? "✓" : t('fix.apm.shouldSum100')}
          </span>
        </div>

        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}

        <div className="flex justify-between gap-2 pt-4 mt-4 border-t border-primary/5">
          <button onClick={() => void clearAll()} className="text-xs text-red-700 hover:underline">
            {t('fix.apm.clearFullTimeline')}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-full text-primary border border-primary/20 text-sm">{t('fix.apm.cancel')}</button>
            <button onClick={() => void save()} disabled={saving} className="bg-primary text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50">
              {saving ? t('fix.apm.saving') : t('fix.apm.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Equipo tab — vista admin del equipo (tabla `employees`) + aprobación de    */
/* vacaciones (employee_vacations). Roster ÚNICO = employees. Los perfiles y   */
/* permisos se editan en Admin clásico → Empleados; aquí se aprueban/rechazan  */
/* las solicitudes de vacaciones y se ve quién está fuera.                     */
/* ──────────────────────────────────────────────────────────────────────── */

interface EmployeeRow {
  id: string;
  email: string;
  full_name: string | null;
  office: string | null;
  active: boolean;
  can_upload_reports: boolean;
  permissions: Record<string, boolean> | null;
}

interface VacationRow {
  id: string;
  employee_id: string | null;
  employee_email: string;
  employee_name: string | null;
  start_date: string;
  end_date: string;
  type: string;
  status: string; // pendiente | aprobada | rechazada
  note: string | null;
  created_at: string;
}

const VAC_TYPE_LABEL: Record<string, string> = {
  vacaciones: "Vacaciones",
  baja: "Baja",
  personal: "Personal",
};

function vacName(v: VacationRow): string {
  return v.employee_name || v.employee_email;
}
function isApprovedStatus(s: string): boolean {
  return s === "aprobada" || s === "approved";
}
function isPendingStatus(s: string): boolean {
  return s === "pendiente" || s === "pending";
}

function EquipoTab() {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [vacations, setVacations] = useState<VacationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [e, v] = await Promise.all([
      supabase
        .from("employees")
        .select("id, email, full_name, office, active, can_upload_reports, permissions")
        .order("full_name"),
      supabase
        .from("employee_vacations")
        .select("*")
        .order("start_date", { ascending: false }),
    ]);
    setEmployees((e.data ?? []) as EmployeeRow[]);
    setVacations((v.data ?? []) as VacationRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const pending = vacations.filter((v) => isPendingStatus(v.status));
  const onLeaveNow = vacations.filter(
    (v) => isApprovedStatus(v.status) && v.start_date <= today && v.end_date >= today
  );
  const upcoming = vacations.filter((v) => isApprovedStatus(v.status) && v.start_date > today);

  const setStatus = async (id: string, status: string) => {
    await supabase.from("employee_vacations").update({ status }).eq("id", id);
    await reload();
  };
  const removeVacation = async (id: string) => {
    if (!confirm(t('fix.apm.confirmRemoveVacation'))) return;
    await supabase.from("employee_vacations").delete().eq("id", id);
    await reload();
  };

  if (loading) {
    return <div className="text-sm text-primary/60">{t('fix.apm.loadingTeam')}</div>;
  }

  const year = new Date().getFullYear();
  const activeCount = employees.filter((e) => e.active).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">{t('fix.apm.activeEmployees')}</p>
          <p className="text-3xl font-serif text-primary mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">{t('fix.apm.outToday')}</p>
          <p className="text-3xl font-serif text-primary mt-1">{onLeaveNow.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">{t('fix.apm.pendingApproval')}</p>
          <p className={`text-3xl font-serif mt-1 ${pending.length > 0 ? "text-amber-600" : "text-primary"}`}>
            {pending.length}
          </p>
        </div>
      </div>

      {/* Solicitudes pendientes de aprobación */}
      <section className="bg-white rounded-xl border border-primary/5 p-5">
        <h3 className="font-bold text-primary mb-4">{t('fix.apm.pendingVacationRequests')}</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-primary/50">{t('fix.apm.noPendingRequests')}</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 rounded-xl p-4"
              >
                <div className="min-w-0">
                  <p className="font-bold text-primary">{vacName(v)}</p>
                  <p className="text-xs text-primary/60">
                    {v.start_date} → {v.end_date} · {VAC_TYPE_LABEL[v.type] ?? v.type}
                    {v.note ? ` · ${v.note}` : ""}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void setStatus(v.id, "aprobada")}
                    className="text-xs bg-green-600 text-white px-3 py-2 rounded-full font-bold"
                  >
                    {t('fix.apm.approve')}
                  </button>
                  <button
                    onClick={() => void setStatus(v.id, "rechazada")}
                    className="text-xs bg-red-600 text-white px-3 py-2 rounded-full font-bold"
                  >
                    {t('fix.apm.reject')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {onLeaveNow.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-amber-900 mb-2">{t('admin.portal.onVacationToday')}</h3>
          <ul className="text-sm text-amber-900 space-y-1">
            {onLeaveNow.map((v) => (
              <li key={v.id}>
                <b>{vacName(v)}</b> · {t('fix.apm.returnsOn')} {v.end_date}
                {v.note && <span className="text-amber-700"> · {v.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Roster (solo lectura — perfiles/permisos se editan en Admin → Empleados) */}
      <section className="bg-white rounded-xl border border-primary/5">
        <div className="flex justify-between items-center px-5 py-4 border-b border-primary/5">
          <h3 className="font-bold text-primary">{t('admin.portal.team')}</h3>
          <Link to="/admin" className="text-xs bg-primary/5 text-primary hover:bg-primary/10 px-3 py-1.5 rounded-full font-bold">
            {t('fix.apm.editProfilesPermissions')}
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-primary/50">
            <tr>
              <th className="text-left p-3">{t('fix.apm.colName')}</th>
              <th className="text-left p-3">{t('fix.apm.colEmail')}</th>
              <th className="text-left p-3">{t('fix.apm.colOffice')}</th>
              <th className="text-left p-3">{t('fix.apm.colWorkReports')}</th>
              <th className="text-left p-3">{t('fix.apm.colEditsListings')}</th>
              <th className="text-left p-3">{t('fix.apm.colActive')}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t border-primary/5">
                <td className="p-3">{e.full_name ?? "—"}</td>
                <td className="p-3 text-primary/60">{e.email}</td>
                <td className="p-3 text-primary/60 capitalize">{e.office ?? "—"}</td>
                <td className="p-3">{hasPermission(e, "upload_reports") ? "✅" : "—"}</td>
                <td className="p-3">{hasPermission(e, "edit_properties") ? "✅" : "—"}</td>
                <td className="p-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${e.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                    {e.active ? t('fix.apm.badgeActive') : t('fix.apm.badgeInactive')}
                  </span>
                </td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-primary/50">{t('fix.apm.noEmployeesInRoster')}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Próximas vacaciones aprobadas */}
      <section className="bg-white rounded-xl border border-primary/5 p-5">
        <h3 className="font-bold text-primary mb-4">{t('admin.portal.upcomingVacations')}</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-primary/50">{t('fix.apm.noUpcomingVacations')}</p>
        ) : (
          <ul className="text-sm space-y-2">
            {upcoming.slice(0, 30).map((v) => (
              <li key={v.id} className="flex items-center justify-between border-b border-primary/5 pb-2">
                <span>
                  <b>{vacName(v)}</b> · {v.start_date} → {v.end_date} · {VAC_TYPE_LABEL[v.type] ?? v.type}
                  {v.note && <span className="text-primary/50"> · {v.note}</span>}
                </span>
                <button
                  onClick={() => void removeVacation(v.id)}
                  className="text-xs text-red-600 underline"
                >
                  {t('fix.apm.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
