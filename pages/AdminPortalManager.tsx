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
import { supabase } from "../lib/supabase";

type Tab = "activity" | "metrics" | "properties" | "units" | "partners" | "applications";

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

export default function AdminPortalManager() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("activity");
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
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
      const [p, u, lp, app, updates, attribs] = await Promise.all([
        supabase.from("properties").select("id, slug, name, area, pct_progress, delivery_date, hero_image_url, walkthrough_url, brand_pdf_url").order("name"),
        supabase.from("property_units").select("id, property_id, unit_name, price_publico, price_inversor, price_agencia, commission_default_pct, bedrooms, bathrooms, available, reserved, sold").order("unit_name"),
        supabase.from("listing_partners").select("id, agency_name, email, status, projects_assigned, user_id").order("agency_name"),
        supabase.from("listing_partner_applications").select("id, agency_name, manager_name, email, whatsapp, country, projects_interested, monthly_volume, notes, status, created_at").order("created_at", { ascending: false }),
        supabase.from("property_updates").select("id, property_id, title, posted_by, posted_at, visibility").order("posted_at", { ascending: false }).limit(15),
        supabase.from("lead_attributions").select("id, partner_id, property_slug, event_type, contact_email, created_at").order("created_at", { ascending: false }).limit(15),
      ]);
      setProperties((p.data ?? []) as Property[]);
      setUnits((u.data ?? []) as Unit[]);
      setPartners((lp.data ?? []) as Partner[]);
      setApplications((app.data ?? []) as Application[]);

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

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (role && role !== "admin" && role !== "team") {
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
      const redirect = `${window.location.origin}/#/auth/finish`;
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
        {(["activity","properties","units","partners","applications"] as Tab[]).map((t) => (
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
