/**
 * ServiceContactsPanel — agenda de proveedores/oficios de Bali (admin-only).
 * Pedido por Andreas (2026-10-15): tener organizados fontaneros, electricistas,
 * herreros, carpinteros/muebles, tukangs/manitas, etc., con categoría + tags para
 * buscar luego "¿qué fontaneros tengo?". Tabla service_contacts (RLS is_admin()).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import ListControls, { useListControls } from "../ListControls";

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  category: string | null;
  tags: string[] | null;
  area: string | null;
  notes: string | null;
  rating: number | null;
  source: string | null;
  updated_at?: string;
  created_at?: string;
}

const emptyForm: Partial<Contact> = { name: "", phone: "", whatsapp: "", category: "", tags: [], area: "", notes: "", rating: undefined, source: "" };

const ServiceContactsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [catFilter, setCatFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("service_contacts").select("*").order("name");
    setRows((data as Contact[]) || []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  // Categorías DINÁMICAS: solo las que ya existen en contactos guardados (no inventadas).
  const categories = useMemo(
    () => Array.from(new Set<string>(rows.map((r) => (r.category || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [rows]
  );
  const filtered = useMemo(
    () => (catFilter ? rows.filter((r) => (r.category || "") === catFilter) : rows),
    [rows, catFilter]
  );
  const list = useListControls<Contact>(filtered, {
    name: (c) => c.name || "",
    search: (c) => `${c.name || ""} ${c.category || ""} ${(c.tags || []).join(" ")} ${c.area || ""} ${c.notes || ""} ${c.phone || ""}`,
    updated: (c) => c.updated_at || c.created_at,
  }, "az");

  const openNew = () => { setEditing({ ...emptyForm }); setTagsInput(""); };
  const openEdit = (c: Contact) => { setEditing({ ...c }); setTagsInput((c.tags || []).join(", ")); };

  const save = async () => {
    if (!editing?.name?.trim()) return;
    setSaving(true);
    const payload: any = {
      name: editing.name?.trim(),
      phone: editing.phone || null,
      whatsapp: editing.whatsapp || null,
      category: editing.category || null,
      tags: tagsInput.split(",").map((s) => s.trim()).filter(Boolean),
      area: editing.area || null,
      notes: editing.notes || null,
      rating: editing.rating ? Number(editing.rating) : null,
      source: editing.source || null,
      updated_at: new Date().toISOString(),
    };
    if (editing.id) await supabase.from("service_contacts").update(payload).eq("id", editing.id);
    else await supabase.from("service_contacts").insert(payload);
    setSaving(false); setEditing(null);
    await load();
  };

  const del = async (c: Contact) => {
    if (!confirm(t("admin.contacts.confirmDelete", { defaultValue: "¿Borrar este contacto?" }))) return;
    await supabase.from("service_contacts").delete().eq("id", c.id);
    await load();
  };

  const waLink = (c: Contact) => {
    const num = (c.whatsapp || c.phone || "").replace(/[^0-9]/g, "");
    return num ? `https://wa.me/${num}` : null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-serif text-primary">{t("admin.contacts.title", { defaultValue: "Contactos / Proveedores" })}</h2>
          <p className="text-sm text-gray-400">{t("admin.contacts.subtitle", { defaultValue: "Agenda de oficios de Bali: fontaneros, electricistas, carpinteros, tukangs…" })}</p>
        </div>
        <button onClick={openNew} className="bg-primary text-white px-5 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-black transition">
          <span className="material-symbols-outlined text-base">add</span>{t("admin.contacts.add", { defaultValue: "Nuevo contacto" })}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        {categories.length > 0 && (
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="px-4 py-2.5 bg-white rounded-xl font-bold text-sm border border-gray-100 text-primary">
            <option value="">{t("admin.contacts.allCategories", { defaultValue: "Todas las categorías" })}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <div className="flex-1 min-w-[200px]">
          <ListControls query={list.query} setQuery={list.setQuery} sort={list.sort} setSort={list.setSort} count={list.result.length} options={["az", "za", "recent"]} />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">{t("admin.contacts.loading", { defaultValue: "Cargando…" })}</p>
      ) : list.result.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center text-gray-400">
          <span className="material-symbols-outlined text-4xl mb-2">contacts</span>
          <p className="font-bold">{t("admin.contacts.empty", { defaultValue: "Aún no hay contactos. Añade el primero." })}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.result.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-black text-primary leading-tight">{c.name}</p>
                  {c.category && <span className="inline-block mt-1 text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-almond text-primary">{c.category}</span>}
                </div>
                {typeof c.rating === "number" && c.rating > 0 && (
                  <span className="text-amber-500 text-xs font-bold">{"★".repeat(Math.min(5, c.rating))}</span>
                )}
              </div>
              {(c.tags && c.tags.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((tg, i) => <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{tg}</span>)}
                </div>
              )}
              {c.area && <p className="text-xs text-gray-500 flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">location_on</span>{c.area}</p>}
              {c.phone && <p className="text-xs text-gray-600 font-mono">{c.phone}</p>}
              {c.notes && <p className="text-xs text-gray-500 line-clamp-2">{c.notes}</p>}
              <div className="flex gap-2 pt-2 mt-auto">
                {waLink(c) && (
                  <a href={waLink(c)!} target="_blank" rel="noopener noreferrer" className="flex-1 bg-[#25D366] text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#20bd5a] transition">
                    <span className="material-symbols-outlined text-sm">chat</span>WhatsApp
                  </a>
                )}
                <button onClick={() => openEdit(c)} className="p-2 text-primary bg-almond rounded-lg hover:bg-primary hover:text-white transition"><span className="material-symbols-outlined text-sm">edit</span></button>
                <button onClick={() => del(c)} className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-600 hover:text-white transition"><span className="material-symbols-outlined text-sm">delete</span></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="relative bg-white rounded-3xl p-6 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setEditing(null)} aria-label={t('admin.common.close')} className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
            <h3 className="pr-10 text-xl font-serif text-primary mb-5">{editing.id ? t("admin.contacts.edit", { defaultValue: "Editar contacto" }) : t("admin.contacts.add", { defaultValue: "Nuevo contacto" })}</h3>
            <div className="space-y-4">
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.name", { defaultValue: "Nombre" })}</label>
                <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.category", { defaultValue: "Categoría" })}</label>
                  <input list="sc-categories" value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder={t("admin.contacts.categoryPlaceholder", { defaultValue: "Elige o crea una nueva…" })} className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" />
                  <datalist id="sc-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                  <p className="text-[9px] text-gray-400 mt-1">{t("admin.contacts.categoryHint", { defaultValue: "Escribe una nueva para crearla, o elige una existente." })}</p>
                </div>
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.area", { defaultValue: "Zona" })}</label>
                  <input value={editing.area || ""} onChange={(e) => setEditing({ ...editing, area: e.target.value })} placeholder="Uluwatu, Canggu…" className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.phone", { defaultValue: "Teléfono" })}</label>
                  <input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.whatsapp", { defaultValue: "WhatsApp" })}</label>
                  <input value={editing.whatsapp || ""} onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })} placeholder="628…" className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
              </div>
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.tags", { defaultValue: "Tags (separados por coma)" })}</label>
                <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="puertas, madera, barato, rápido" className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-medium" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.rating", { defaultValue: "Valoración (1-5)" })}</label>
                  <input type="number" min={1} max={5} value={editing.rating ?? ""} onChange={(e) => setEditing({ ...editing, rating: e.target.value ? Number(e.target.value) : undefined })} className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
                <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.source", { defaultValue: "Origen" })}</label>
                  <input value={editing.source || ""} onChange={(e) => setEditing({ ...editing, source: e.target.value })} placeholder="WhatsApp, recomendación…" className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-bold" /></div>
              </div>
              <div><label className="block text-[10px] font-black uppercase text-gray-400 mb-1">{t("admin.contacts.notes", { defaultValue: "Notas" })}</label>
                <textarea rows={3} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="w-full px-4 py-3 bg-gray-50 rounded-2xl font-medium" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 py-3 rounded-2xl font-bold text-primary bg-gray-100 hover:bg-gray-200 transition">{t("admin.contacts.cancel", { defaultValue: "Cancelar" })}</button>
              <button onClick={save} disabled={saving || !editing.name?.trim()} className="flex-1 py-3 rounded-2xl font-bold text-white bg-primary hover:bg-black transition disabled:opacity-50">{saving ? "…" : t("admin.contacts.save", { defaultValue: "Guardar" })}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceContactsPanel;
