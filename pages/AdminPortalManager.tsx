/**
 * /admin/portal — Manager interno para el equipo Unreal:
 * - CRUD de properties + property_units
 * - Listing partner applications (pendientes / aprobadas)
 * - Asignar proyectos a listing_partners aprobados
 *
 * Acceso: rol admin o team. Si no, redirige a /agencias.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { supabase, getImageUrl } from "../lib/supabase";

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
          kind: "📨 Solicitud agencia",
          title: a.agency_name,
          detail: `${a.email} · ${a.country ?? "—"} · ${a.status}`,
          ts: a.created_at,
        });
      }
      for (const up of (updates.data ?? []).slice(0, 10)) {
        events.push({
          id: `upd-${up.id}`,
          kind: "🏗️ Update obra",
          title: up.title,
          detail: `${up.posted_by} · ${up.visibility}`,
          ts: up.posted_at,
        });
      }
      for (const at of (attribs.data ?? []).slice(0, 10)) {
        events.push({
          id: `at-${at.id}`,
          kind: "🔗 Atribución lister",
          title: at.event_type,
          detail: `${at.contact_email ?? "anónimo"} · property: ${at.property_slug ?? "—"}`,
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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  if (!user && !hasLegacySession) return <Navigate to="/admin/login" replace />;
  if (user && role && role !== "admin" && role !== "team") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">Acceso restringido</h1>
          <p>Solo equipo interno.</p>
        </div>
      </div>
    );
  }

  const handleApproveApplication = async (app: Application) => {
    if (!confirm(`¿Aprobar a ${app.agency_name}? Crea row en listing_partners y se le manda magic link.`)) return;
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
        approved_by: user.email ?? user.id,
      });
      if (insErr) throw insErr;
      await supabase
        .from("listing_partner_applications")
        .update({ status: "approved", reviewed_by: user.email ?? user.id, reviewed_at: new Date().toISOString() })
        .eq("id", app.id);
      // Magic link
      const redirect = `${window.location.origin}/auth/finish`;
      await supabase.auth.signInWithOtp({ email: app.email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
      await reloadAll();
      alert("Aprobada + magic link enviado");
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRejectApplication = async (app: Application) => {
    if (!confirm(`¿Rechazar ${app.agency_name}?`)) return;
    await supabase
      .from("listing_partner_applications")
      .update({ status: "rejected", reviewed_by: user.email ?? user.id, reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    await reloadAll();
  };

  const handleAssignProjects = async (partner: Partner) => {
    const current = partner.projects_assigned ?? [];
    const list = properties
      .map((p) => `${current.includes(p.id) ? "[x]" : "[ ]"} ${p.name} (${p.id.slice(0, 8)})`)
      .join("\n");
    const input = prompt(
      `Proyectos asignados a ${partner.agency_name}.\nListado actual:\n${list}\n\nPega los IDs (uno por línea, completos):`,
      current.join("\n")
    );
    if (input === null) return;
    const newIds = input.split("\n").map((s) => s.trim()).filter(Boolean);
    await supabase.from("listing_partners").update({ projects_assigned: newIds }).eq("id", partner.id);
    await reloadAll();
  };

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">Admin Portal Manager</h1>
          <p className="text-sm opacity-80">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/admin")} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">Admin clásico</button>
          <button onClick={() => void signOut()} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">Salir</button>
        </div>
      </header>

      <nav className="max-w-6xl mx-auto px-6 mt-6 flex flex-wrap gap-2">
        {(["activity","properties","units","partners","applications","faqs","timelines","equipo"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              tab === t ? "bg-primary text-white" : "bg-white/60 text-primary hover:bg-white"
            }`}
          >
            {t === "activity" && `📡 Actividad (${activity.length})`}
            {t === "properties" && `📁 Proyectos (${properties.length})`}
            {t === "units" && `🏠 Unidades (${units.length})`}
            {t === "partners" && `🤝 Agencias (${partners.length})`}
            {t === "applications" && `📨 Solicitudes (${applications.filter((a) => a.status === "pending").length})`}
            {t === "faqs" && `❓ FAQs (${faqs.length})`}
            {t === "timelines" && `📅 Timelines (${projectsCatalog.filter((p) => Array.isArray(p.timeline) && p.timeline.length > 0).length}/${projectsCatalog.length})`}
          </button>
        ))}
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {loading && <p>Cargando…</p>}
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
  if (events.length === 0) return <p className="text-primary/60">Aún no hay actividad reciente.</p>;
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
        + Nuevo proyecto
      </button>

      <div className="grid gap-4 md:grid-cols-2">
        {data.map((p) => (
          <article key={p.id} className="glass-card rounded-xl p-4">
            <h3 className="font-serif text-lg text-primary">{p.name}</h3>
            <p className="text-xs text-primary/60">slug: {p.slug}</p>
            {p.area && <p className="text-sm">{p.area}</p>}
            {typeof p.pct_progress === "number" && <p className="text-sm">Avance: {p.pct_progress}%</p>}
            <button onClick={() => setEditing(p)} className="text-xs underline mt-2">Editar</button>
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
  const [form, setForm] = useState<Property>(row);

  const update = <K extends keyof Property>(k: K, v: Property[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-2xl mb-4">{isNew ? "Nuevo proyecto" : "Editar proyecto"}</h2>
        <div className="space-y-3">
          <Input label="Slug *" value={form.slug} onChange={(v) => update("slug", v)} />
          <Input label="Nombre *" value={form.name} onChange={(v) => update("name", v)} />
          <Input label="Área (zona)" value={form.area ?? ""} onChange={(v) => update("area", v)} />
          <Input label="% Obra" type="number" value={String(form.pct_progress ?? "")} onChange={(v) => update("pct_progress", v ? Number(v) : null)} />
          <Input label="Fecha entrega" value={form.delivery_date ?? ""} onChange={(v) => update("delivery_date", v)} />
          <Input label="Hero image URL" value={form.hero_image_url ?? ""} onChange={(v) => update("hero_image_url", v)} />
          <Input label="Walkthrough URL" value={form.walkthrough_url ?? ""} onChange={(v) => update("walkthrough_url", v)} />
          <Input label="Brand PDF URL" value={form.brand_pdf_url ?? ""} onChange={(v) => update("brand_pdf_url", v)} />
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => void onSave(form, isNew)} className="flex-1 bg-primary text-white py-2 rounded-lg">Guardar</button>
          <button onClick={onCancel} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function UnitsTab({ data, properties, onChange }: { data: Unit[]; properties: Property[]; onChange: () => Promise<void> }) {
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
      <button onClick={() => setCreating(true)} className="mb-4 bg-primary text-white px-4 py-2 rounded-full text-sm">+ Nueva unidad</button>
      <div className="overflow-x-auto bg-white/60 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-primary/10 text-left">
            <tr>
              <th className="p-3">Proyecto</th><th className="p-3">Unidad</th>
              <th className="p-3">Público</th><th className="p-3">Inversor</th><th className="p-3">Agencia</th>
              <th className="p-3">Status</th><th className="p-3"></th>
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
                  {u.sold ? "🔴 Vendida" : u.reserved ? "🟡 Reservada" : u.available ? "🟢 Disponible" : "⚪ Inactiva"}
                </td>
                <td className="p-3"><button onClick={() => setEditing(u)} className="underline text-xs">Editar</button></td>
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
  const [form, setForm] = useState<Unit>(row);
  const update = <K extends keyof Unit>(k: K, v: Unit[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-2xl mb-4">{isNew ? "Nueva unidad" : "Editar unidad"}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Proyecto *</span>
            <select value={form.property_id} onChange={(e) => update("property_id", e.target.value)} className="block w-full rounded-lg border border-primary/20 px-4 py-2.5 mt-1">
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Input label="Nombre unidad *" value={form.unit_name} onChange={(v) => update("unit_name", v)} />
          <div className="grid grid-cols-3 gap-2">
            <Input label="Precio público (€)" type="number" value={String(form.price_publico ?? "")} onChange={(v) => update("price_publico", v ? Number(v) : null)} />
            <Input label="Precio inversor (€)" type="number" value={String(form.price_inversor ?? "")} onChange={(v) => update("price_inversor", v ? Number(v) : null)} />
            <Input label="Precio agencia (€)" type="number" value={String(form.price_agencia ?? "")} onChange={(v) => update("price_agencia", v ? Number(v) : null)} />
          </div>
          <Input label="% Comisión por defecto" type="number" value={String(form.commission_default_pct ?? "")} onChange={(v) => update("commission_default_pct", v ? Number(v) : null)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Hab" type="number" value={String(form.bedrooms ?? "")} onChange={(v) => update("bedrooms", v ? Number(v) : null)} />
            <Input label="Baños" type="number" value={String(form.bathrooms ?? "")} onChange={(v) => update("bathrooms", v ? Number(v) : null)} />
          </div>
          <div className="flex gap-3">
            <Toggle label="Disponible" value={form.available} onChange={(v) => update("available", v)} />
            <Toggle label="Reservada" value={form.reserved} onChange={(v) => update("reserved", v)} />
            <Toggle label="Vendida" value={form.sold} onChange={(v) => update("sold", v)} />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button onClick={() => void onSave(form, isNew)} className="flex-1 bg-primary text-white py-2 rounded-lg">Guardar</button>
          <button onClick={onCancel} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function PartnersTab({
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
  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-3">
      {data.length === 0 && <p className="text-primary/60">No hay agencias activas todavía.</p>}
      {data.map((p) => (
        <article key={p.id} className="bg-white/60 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg text-primary">{p.agency_name}</h3>
            <p className="text-xs text-primary/60">{p.email} · status: {p.status}</p>
            <p className="text-xs mt-2">
              Proyectos: {p.projects_assigned?.length ? p.projects_assigned.map(propertyName).join(", ") : "—"}
            </p>
          </div>
          <button onClick={() => void onAssign(p)} className="text-xs bg-primary text-white px-3 py-2 rounded-full">
            Asignar proyectos
          </button>
        </article>
      ))}
    </div>
  );
}

function ApplicationsTab({
  data,
  onApprove,
  onReject,
}: {
  data: Application[];
  onApprove: (a: Application) => Promise<void>;
  onReject: (a: Application) => Promise<void>;
}) {
  const pending = useMemo(() => data.filter((a) => a.status === "pending"), [data]);
  const reviewed = useMemo(() => data.filter((a) => a.status !== "pending"), [data]);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-serif text-xl mb-3">Pendientes ({pending.length})</h3>
        {pending.length === 0 && <p className="text-primary/60">No hay solicitudes pendientes.</p>}
        {pending.map((a) => (
          <article key={a.id} className="bg-white/60 rounded-xl p-4 mb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-serif text-lg text-primary">{a.agency_name}</h4>
                <p className="text-xs text-primary/60">
                  {a.email} · {a.country ?? "país?"} · vol: {a.monthly_volume ?? "—"}
                </p>
                {a.manager_name && <p className="text-sm">Manager: {a.manager_name}</p>}
                {a.projects_interested?.length ? (
                  <p className="text-sm mt-2">Interesado en: {a.projects_interested.join(", ")}</p>
                ) : null}
                {a.notes && <p className="text-sm text-primary/60 mt-2 italic">{a.notes}</p>}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => void onApprove(a)} className="text-xs bg-green-600 text-white px-3 py-2 rounded-full">Aprobar</button>
                <button onClick={() => void onReject(a)} className="text-xs bg-red-600 text-white px-3 py-2 rounded-full">Rechazar</button>
              </div>
            </div>
          </article>
        ))}
      </section>
      <section>
        <h3 className="font-serif text-xl mb-3">Revisadas ({reviewed.length})</h3>
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

function FaqsTab({ data, onChange }: { data: Faq[]; onChange: () => Promise<void> }) {
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
    if (!confirm(`¿Borrar FAQ "${f.question.slice(0, 50)}…"?`)) return;
    await supabase.from("faqs").delete().eq("id", f.id);
    await onChange();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Estado"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "published" | "draft")}
            className="rounded-lg border border-primary/20 px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">Todos los estados</option>
            <option value="published">Publicadas</option>
            <option value="draft">Borradores</option>
          </select>
          <select
            aria-label="Categoría"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-primary/20 px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">Todas las categorías</option>
            {FAQ_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-xs text-primary/50">{filtered.length} de {data.length}</span>
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
          + Nueva FAQ
        </button>
      </div>

      <div className="bg-white rounded-xl overflow-hidden border border-primary/5">
        <table className="w-full text-sm">
          <thead className="bg-almond text-left text-[11px] uppercase tracking-widest text-primary/60">
            <tr>
              <th className="p-3 w-16">Estado</th>
              <th className="p-3">Pregunta</th>
              <th className="p-3 w-28">Categoría</th>
              <th className="p-3 w-16">Lang</th>
              <th className="p-3 w-20">Orden</th>
              <th className="p-3 w-44">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-t border-primary/5 align-top">
                <td className="p-3">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${
                    f.is_published ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {f.is_published ? "live" : "draft"}
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
                      Editar
                    </button>
                    <button
                      onClick={() => void togglePublish(f)}
                      className="text-[10px] bg-primary text-white px-2 py-1 rounded-full"
                    >
                      {f.is_published ? "Despublicar" : "Publicar"}
                    </button>
                    <button
                      onClick={() => void remove(f)}
                      className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-full"
                    >
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-primary/50">
                  Sin FAQs en este filtro.
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
  const [form, setForm] = useState<Faq>(faq);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      setErr("Pregunta y respuesta son obligatorias");
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
          <h3 className="font-serif text-xl text-primary">{form.id ? "Editar FAQ" : "Nueva FAQ"}</h3>
          <button onClick={onClose} className="text-primary/40 hover:text-primary">✕</button>
        </div>

        <div className="space-y-4">
          <Input
            label="Pregunta *"
            value={form.question}
            onChange={(v) => setForm({ ...form, question: v })}
          />

          <label className="block">
            <span className="text-sm font-medium text-primary">Respuesta * (markdown — **negrita**, listas con -)</span>
            <textarea
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              rows={10}
              className="mt-1 block w-full rounded-lg border border-primary/20 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40 font-mono text-xs"
            />
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-primary">Categoría</span>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-primary/20 px-3 py-2.5 outline-none bg-white"
              >
                {FAQ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-primary">Idioma</span>
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
              label="Orden"
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
              <span className="text-sm">Publicada</span>
            </label>
          </div>

          <Input
            label="Tags (coma)"
            value={(form.tags ?? []).join(", ")}
            onChange={(v) => setForm({ ...form, tags: v.split(",").map((t) => t.trim()).filter(Boolean) })}
          />
          <Input
            label="Project filter (slugs separados por coma; vacío = todos)"
            value={(form.project_filter ?? []).join(", ")}
            onChange={(v) => setForm({ ...form, project_filter: v.split(",").map((t) => t.trim()).filter(Boolean) })}
          />

          {err && <p className="text-red-600 text-sm">{err}</p>}

          <div className="flex justify-end gap-2 pt-3 border-t border-primary/5">
            <button onClick={onClose} className="px-4 py-2 rounded-full text-primary border border-primary/20">
              Cancelar
            </button>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="bg-primary text-white px-6 py-2 rounded-full font-bold disabled:opacity-50"
            >
              {saving ? "Guardando…" : form.id ? "Guardar" : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Timelines admin ──────────────────────────────────────────────────────

function TimelinesTab({ data, onChange }: { data: ProjectRow[]; onChange: () => Promise<void> }) {
  const [editing, setEditing] = useState<ProjectRow | null>(null);

  return (
    <div className="space-y-4">
      <p className="text-xs text-primary/60">
        Cada proyecto del catálogo público (`projects`) puede tener un timeline visible en su ficha. Edítalo aquí; los cambios salen en `/proyecto/&lt;slug&gt;` al instante.
      </p>

      <div className="bg-white rounded-xl overflow-hidden border border-primary/5">
        <table className="w-full text-sm">
          <thead className="bg-almond text-left text-[11px] uppercase tracking-widest text-primary/60">
            <tr>
              <th className="p-3">Proyecto</th>
              <th className="p-3 w-28">Status</th>
              <th className="p-3 w-24">% Obra</th>
              <th className="p-3 w-24">Fases</th>
              <th className="p-3 w-44">Acciones</th>
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
                      {phaseCount > 0 ? `${phaseCount} fases` : "sin timeline"}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setEditing(p)}
                      className="text-[10px] bg-primary text-white px-3 py-1.5 rounded-full"
                    >
                      {phaseCount > 0 ? "Editar" : "Crear timeline"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-primary/50">Sin proyectos en el catálogo.</td></tr>
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
    if (!confirm(`¿Borrar el timeline completo de "${project.name}"?`)) return;
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
            <h3 className="font-serif text-xl text-primary">Timeline · {project.name}</h3>
            <p className="text-xs text-primary/50">{project.slug}</p>
          </div>
          <button onClick={onClose} className="text-primary/40 hover:text-primary text-xl">✕</button>
        </div>
        <p className="text-xs text-primary/60 mb-4">
          Cada fase: título obligatorio, fecha opcional (formato `YYYY-MM` o `YYYY-MM-DD`), % pago y descripción. El status (done/in_progress/pending) se autoderiva del % de obra del proyecto.
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {phases.map((p, i) => (
            <div key={i} className="border border-primary/10 rounded-xl p-4 bg-almond/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-primary/60">
                  Fase {i + 1}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => movePhase(i, -1)} disabled={i === 0} className="text-xs px-2 py-1 rounded bg-white border border-primary/10 disabled:opacity-30">↑</button>
                  <button onClick={() => movePhase(i, 1)} disabled={i === phases.length - 1} className="text-xs px-2 py-1 rounded bg-white border border-primary/10 disabled:opacity-30">↓</button>
                  <button onClick={() => removePhase(i)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200">Borrar</button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
                <Input label="Título *" value={p.title} onChange={(v) => updatePhase(i, { title: v })} />
                <Input label="Fecha (YYYY-MM)" value={p.date ?? ""} onChange={(v) => updatePhase(i, { date: v })} />
                <Input label="% pago" type="number" value={String(p.payment_pct ?? "")} onChange={(v) => updatePhase(i, { payment_pct: v ? Number(v) : 0 })} />
              </div>
              <label className="block">
                <span className="text-sm font-medium text-primary">Descripción</span>
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
            + Añadir fase
          </button>
          <span className={`text-xs font-bold ${totalPct === 100 ? "text-green-700" : "text-amber-700"}`}>
            Total pagos: {totalPct}% {totalPct === 100 ? "✓" : "(debería sumar 100%)"}
          </span>
        </div>

        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}

        <div className="flex justify-between gap-2 pt-4 mt-4 border-t border-primary/5">
          <button onClick={() => void clearAll()} className="text-xs text-red-700 hover:underline">
            Borrar timeline completo
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-full text-primary border border-primary/20 text-sm">Cancelar</button>
            <button onClick={() => void save()} disabled={saving} className="bg-primary text-white px-6 py-2 rounded-full font-bold text-sm disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Equipo tab — admin overview of team time-off                              */
/* ──────────────────────────────────────────────────────────────────────── */

interface TeamMemberRow {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  total_days_per_year: number;
  active: boolean;
}

interface TimeOffRow {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface HolidayRow {
  id: string;
  date: string;
  name: string;
  country: string;
}

interface FieldReportRow {
  id: string;
  member_id: string;
  project_slug: string | null;
  comment: string;
  photo_path: string | null;
  weather: string | null;
  created_at: string;
}

function EquipoTab() {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [requests, setRequests] = useState<TimeOffRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [reports, setReports] = useState<FieldReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [m, r, h, fr] = await Promise.all([
      supabase.from("team_members").select("*").order("full_name"),
      supabase.from("time_off_requests").select("*").order("start_date", { ascending: false }),
      supabase.from("holidays").select("*").order("date"),
      supabase.from("field_reports").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setMembers((m.data ?? []) as TeamMemberRow[]);
    setRequests((r.data ?? []) as TimeOffRow[]);
    setHolidays((h.data ?? []) as HolidayRow[]);
    setReports((fr.data ?? []) as FieldReportRow[]);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const onLeaveNow = requests.filter((r) => r.start_date <= today && r.end_date >= today && r.status === "approved");
  const upcoming = requests.filter((r) => r.start_date > today && r.status === "approved");

  const memberById = new Map<string, TeamMemberRow>(members.map((m) => [m.id, m]));
  const daysTakenByMember = (mid: string, year: number) =>
    requests
      .filter((r) => r.member_id === mid && r.status === "approved" && r.start_date.slice(0, 4) === String(year))
      .reduce((s, r) => s + r.days, 0);

  const updateMember = async (id: string, patch: Partial<TeamMemberRow>) => {
    await supabase.from("team_members").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    await reload();
  };

  const addMember = async () => {
    const name = prompt("Nombre completo:");
    if (!name) return;
    const email = prompt("Email (opcional):") || null;
    await supabase.from("team_members").insert({ full_name: name, email, role: "employee", total_days_per_year: 60 });
    await reload();
  };

  if (loading) {
    return <div className="text-sm text-primary/60">Cargando equipo…</div>;
  }

  const year = new Date().getFullYear();

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">Empleados activos</p>
          <p className="text-3xl font-serif text-primary mt-1">{members.filter((m) => m.active).length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">Fuera hoy</p>
          <p className="text-3xl font-serif text-primary mt-1">{onLeaveNow.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-primary/5">
          <p className="text-xs uppercase tracking-widest text-primary/50">Festivos {year}</p>
          <p className="text-3xl font-serif text-primary mt-1">{holidays.filter((h) => h.date.startsWith(String(year))).length}</p>
        </div>
      </div>

      {onLeaveNow.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-amber-900 mb-2">De vacaciones hoy</h3>
          <ul className="text-sm text-amber-900 space-y-1">
            {onLeaveNow.map((r) => (
              <li key={r.id}>
                <b>{memberById.get(r.member_id)?.full_name ?? "?"}</b> · vuelve el {r.end_date}
                {r.reason && <span className="text-amber-700"> · {r.reason}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-white rounded-xl border border-primary/5">
        <div className="flex justify-between items-center px-5 py-4 border-b border-primary/5">
          <h3 className="font-bold text-primary">Equipo</h3>
          <button onClick={addMember} className="text-xs bg-primary text-white px-3 py-1.5 rounded-full">+ Añadir</button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-primary/50">
            <tr>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Rol</th>
              <th className="text-left p-3">Días/año</th>
              <th className="text-left p-3">Tomados {year}</th>
              <th className="text-left p-3">Restantes</th>
              <th className="text-left p-3">Activo</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const taken = daysTakenByMember(m.id, year);
              return (
                <tr key={m.id} className="border-t border-primary/5">
                  <td className="p-3">{m.full_name}</td>
                  <td className="p-3 text-primary/60">
                    <input
                      type="email"
                      defaultValue={m.email ?? ""}
                      onBlur={(e) => e.target.value !== (m.email ?? "") && void updateMember(m.id, { email: e.target.value || null })}
                      className="w-full bg-transparent border-b border-transparent hover:border-primary/20 focus:border-primary outline-none text-sm"
                      placeholder="(sin email)"
                    />
                  </td>
                  <td className="p-3">
                    <select
                      value={m.role}
                      onChange={(e) => void updateMember(m.id, { role: e.target.value })}
                      className="text-xs bg-gray-50 rounded px-2 py-1"
                    >
                      <option value="employee">employee</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      defaultValue={m.total_days_per_year}
                      onBlur={(e) => Number(e.target.value) !== m.total_days_per_year && void updateMember(m.id, { total_days_per_year: Number(e.target.value) })}
                      className="w-16 bg-gray-50 rounded px-2 py-1 text-sm"
                    />
                  </td>
                  <td className="p-3">{taken}</td>
                  <td className={`p-3 font-bold ${m.total_days_per_year - taken < 0 ? "text-red-600" : "text-green-700"}`}>
                    {m.total_days_per_year - taken}
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={m.active}
                      onChange={(e) => void updateMember(m.id, { active: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-xl border border-primary/5 p-5">
        <h3 className="font-bold text-primary mb-4">Próximas vacaciones</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-primary/50">Nadie tiene vacaciones programadas próximamente.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {upcoming.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center justify-between border-b border-primary/5 pb-2">
                <span>
                  <b>{memberById.get(r.member_id)?.full_name ?? "?"}</b> · {r.start_date} → {r.end_date} · {r.days} días
                  {r.reason && <span className="text-primary/50"> · {r.reason}</span>}
                </span>
                <button
                  onClick={async () => {
                    if (!confirm("¿Eliminar esta solicitud?")) return;
                    await supabase.from("time_off_requests").delete().eq("id", r.id);
                    await reload();
                  }}
                  className="text-xs text-red-600 underline"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-xl border border-primary/5 p-5">
        <h3 className="font-bold text-primary mb-4">Partes de obra recientes ({reports.length})</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-primary/50">Aún no hay partes enviados.</p>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {reports.map((r) => (
              <article key={r.id} className="border border-primary/5 rounded-lg p-3 flex gap-3 text-sm">
                {r.photo_path && (
                  <img src={getImageUrl(r.photo_path)} alt="" className="w-20 h-20 object-cover rounded flex-shrink-0" loading="lazy" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-primary/60">
                      <b>{memberById.get(r.member_id)?.full_name ?? "?"}</b>
                      {" · "}
                      {new Date(r.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    {r.project_slug && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{r.project_slug}</span>}
                  </div>
                  <p className="text-primary whitespace-pre-line">{r.comment}</p>
                  {r.weather && <p className="text-[10px] text-primary/40 mt-1">Tiempo: {r.weather}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-primary/5 p-5">
        <h3 className="font-bold text-primary mb-4">Festivos cargados ({holidays.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm max-h-64 overflow-y-auto">
          {holidays.map((h) => (
            <div key={h.id} className="flex justify-between border-b border-primary/5 pb-1">
              <span>{h.date}</span>
              <span className="text-primary/70">{h.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
