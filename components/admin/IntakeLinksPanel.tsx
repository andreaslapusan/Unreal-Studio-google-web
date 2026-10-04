/**
 * IntakeLinksPanel — admin section to create & track listing intake links.
 * Andreas fills only title + owner → a private URL is generated (/listing/:token).
 * The owner uploads their property; it lands here as "pending" and can be
 * published into a hidden project draft. See pages/ListingIntake.tsx + the
 * intake_* / admin_intake_* RPCs.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";

interface Intake {
  id: string;
  token: string;
  property_title: string;
  owner_name: string | null;
  owner_contact: string | null;
  status: string;
  project_id: string | null;
  created_at: string;
  submitted_at: string | null;
}

const IntakeLinksPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", owner: "", contact: "" });
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkFor = (tok: string) => `${origin}/listing/${tok}`;

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_intake_list");
    if (!error && Array.isArray(data)) setRows(data as Intake[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("admin_intake_create", {
      p_title: form.title.trim(), p_owner: form.owner.trim(), p_contact: form.contact.trim() || null,
    });
    setCreating(false);
    if (!error && data?.ok) {
      setForm({ title: "", owner: "", contact: "" });
      await load();
      if (data.token) { void copy(linkFor(data.token)); }
    } else {
      alert(t("admin.intakes.errorCreate", { defaultValue: "No se pudo crear el enlace." }));
    }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(url); setTimeout(() => setCopied(null), 1800); } catch { /* ignore */ }
  };

  const publish = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.rpc("admin_intake_publish", { p_id: id });
    setBusy(null);
    if (!error && data?.ok) { await load(); alert(t("admin.intakes.publishedNote")); }
    else alert(t("admin.intakes.errorPublish", { defaultValue: "No se pudo publicar." }));
  };

  const del = async (id: string) => {
    if (!window.confirm(t("admin.intakes.confirmDelete"))) return;
    setBusy(id);
    await supabase.rpc("admin_intake_delete", { p_id: id });
    setBusy(null);
    await load();
  };

  const badge = (s: string) => {
    if (s === "submitted") return { cls: "bg-amber-100 text-amber-700", label: t("admin.intakes.statusSubmitted") };
    if (s === "published") return { cls: "bg-emerald-100 text-emerald-700", label: t("admin.intakes.statusPublished") };
    return { cls: "bg-gray-100 text-gray-500", label: t("admin.intakes.statusCreated") };
  };

  const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(i18n.language); } catch { return s; } };

  const inputCls = "w-full px-4 py-3 bg-white rounded-2xl border border-primary/10 font-semibold text-primary focus:ring-2 focus:ring-primary/30 outline-none";

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-primary/60">{t("admin.intakes.title")}</h1>
        <p className="text-primary/60 mt-2 max-w-2xl">{t("admin.intakes.subtitle")}</p>
      </div>

      {/* Create form */}
      <div className="bg-white/60 rounded-3xl p-5 md:p-6 mb-8 border border-primary/5">
        <h2 className="font-black text-primary mb-4">{t("admin.intakes.newLink")}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("admin.intakes.propTitle")} className={inputCls} />
          <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder={t("admin.intakes.owner")} className={inputCls} />
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder={t("admin.intakes.contact")} className={inputCls} />
        </div>
        <button onClick={create} disabled={creating || !form.title.trim()} className="mt-4 bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-black transition disabled:opacity-40">
          {creating ? "…" : t("admin.intakes.create")}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <p className="text-primary/40 text-center py-12">{t("admin.intakes.empty")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const b = badge(r.status);
            const url = linkFor(r.token);
            return (
              <div key={r.id} className="bg-white rounded-2xl p-4 md:p-5 border border-primary/5 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-primary truncate">{r.property_title}</span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                  </div>
                  <p className="text-xs text-primary/50 mt-0.5">
                    {r.owner_name || "—"}{r.owner_contact ? ` · ${r.owner_contact}` : ""} · {t("admin.intakes.createdAt")} {fmtDate(r.created_at)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="text-[11px] bg-gray-50 rounded-lg px-2 py-1 text-primary/60 truncate max-w-[240px] md:max-w-[360px]">{url}</code>
                    <button onClick={() => copy(url)} className="text-[10px] font-black uppercase text-primary hover:underline shrink-0">
                      {copied === url ? t("admin.intakes.copied") : t("admin.intakes.copy")}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-gray-100 text-primary/70 hover:bg-gray-200 transition">{t("admin.intakes.view")}</a>
                  {r.status === "submitted" && (
                    <button onClick={() => publish(r.id)} disabled={busy === r.id} className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-emerald-600 text-white hover:brightness-110 transition disabled:opacity-40">{t("admin.intakes.publish")}</button>
                  )}
                  <button onClick={() => del(r.id)} disabled={busy === r.id} className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition disabled:opacity-40">{t("admin.intakes.delete")}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IntakeLinksPanel;
