/**
 * DeseoFurnishingPanel — "Envío amueblado + extensión" (solo admin).
 * Lista las unidades Deseo con su tipo (A/B/C/D, editable vía admin_set_unit_type)
 * y PREVISUALIZA el email personalizado por cliente. NO envía nada: el envío real
 * requiere el "super OK" de Andreas → SEND_ENABLED queda en false.
 * Plantillas: public/email-templates/deseo-promo-tipo-{a,b,c}.html (fuente: ~/jobs/deseo-furnishing/email).
 */
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";

const SEND_ENABLED = false; // feature flag: envío real bloqueado hasta el OK explícito de Andreas
const UNIT_TYPES = ["A", "B", "C", "D"] as const;
const TEMPLATE_TYPES = ["A", "B", "C"]; // D: sin plantilla
const PDF_TYPES = ["A", "B", "C"]; // PDFs amueblado existentes (tipo-a, tipo-b-7650, tipo-c); D no tiene

interface Row { id: string; name: string; email: string; unit: string; type: string | null; }
interface Preview { row: Row; subject: string; html: string; }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
export const fillTemplate = (tpl: string, r: Row) =>
  tpl.replace(/{{nombre}}/g, esc(r.name)).replace(/{{unidad}}/g, esc(r.unit)).replace(/{{tipo}}/g, esc(r.type || ""));

const DeseoFurnishingPanel: React.FC<{ clients: any[]; onChanged: () => void | Promise<void> }> = ({ clients, onChanged }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [skipped, setSkipped] = useState<Row[]>([]);
  const [idx, setIdx] = useState(0);

  const rows: Row[] = useMemo(() => clients.flatMap((c: any) => (c.projects || [])
    .filter((cp: any) => /deseo/i.test(cp.project_name || ""))
    .map((cp: any) => ({ id: cp.id, name: c.name, email: c.email, unit: cp.unit_number || "—", type: cp.unit_type || null })))
    .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true })), [clients]);

  const visible = rows.filter((r) => !filter || (filter === "none" ? !r.type : r.type === filter));
  const allChecked = visible.length > 0 && visible.every((r) => selected.includes(r.id));

  const setType = async (r: Row, type: string) => {
    setBusy(r.id);
    const { data, error } = await supabase.rpc("admin_set_unit_type", { p_assignment_id: r.id, p_type: type });
    setBusy(null);
    if (error || (data && !data.success)) { alert(t("admin.deseoPromo.errorType")); return; }
    await onChanged();
  };

  const prepare = async () => {
    const chosen = rows.filter((r) => selected.includes(r.id));
    const ok = chosen.filter((r) => r.type && TEMPLATE_TYPES.includes(r.type));
    const tpls: Record<string, string> = {};
    try {
      for (const ty of new Set(ok.map((r) => r.type as string))) {
        const res = await fetch(`/email-templates/deseo-promo-tipo-${ty.toLowerCase()}.html`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        tpls[ty] = await res.text();
      }
    } catch { alert(t("admin.deseoPromo.errorTemplate")); return; }
    setSkipped(chosen.filter((r) => !ok.includes(r)));
    setPreviews(ok.map((r) => {
      const html = fillTemplate(tpls[r.type as string], r);
      const subject = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/&amp;/g, "&").trim();
      return { row: r, subject, html };
    }));
    setIdx(0);
  };

  const cur = previews?.[idx];
  const th = "text-left text-[10px] font-black uppercase tracking-widest text-gray-400 px-3 py-2";

  return (
    <div className="animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-widest text-primary/20">{t("admin.deseoPromo.title")}</h1>
        <p className="text-primary/60 mt-2 max-w-2xl">{t("admin.deseoPromo.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs font-bold text-primary">
          <option value="">{t("admin.deseoPromo.allTypes")}</option>
          {UNIT_TYPES.map((ut) => <option key={ut} value={ut}>{t("admin.unitType.badge", { type: ut })}</option>)}
          <option value="none">{t("admin.unitType.none")}</option>
        </select>
        <span className="text-xs text-primary/50 font-bold">{t("admin.deseoPromo.selectedCount", { count: selected.length })}</span>
        <button onClick={prepare} disabled={!selected.length} className="ml-auto bg-primary text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition disabled:opacity-40">
          <span className="material-symbols-outlined text-base">visibility</span> {t("admin.deseoPromo.prepare")}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-primary/5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">
            <th className={th}><input type="checkbox" aria-label={t("admin.deseoPromo.selectAll")} checked={allChecked} onChange={() => setSelected(allChecked ? selected.filter((id) => !visible.some((r) => r.id === id)) : [...new Set([...selected, ...visible.map((r) => r.id)])])} className="accent-primary" /></th>
            <th className={th}>{t("admin.deseoPromo.colName")}</th>
            <th className={th}>{t("admin.deseoPromo.colEmail")}</th>
            <th className={th}>{t("admin.deseoPromo.colUnit")}</th>
            <th className={th}>{t("admin.unitType.label")}</th>
            <th className={th}>{t("admin.deseoPromo.colPdf")}</th>
          </tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6} className="text-center text-primary/40 py-10">{t("admin.deseoPromo.empty")}</td></tr>}
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2"><input type="checkbox" aria-label={r.name} checked={selected.includes(r.id)} onChange={() => setSelected((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])} className="accent-primary" /></td>
                <td className="px-3 py-2 font-bold text-primary">{r.name}</td>
                <td className="px-3 py-2 text-xs text-gray-500 break-all">{r.email}</td>
                <td className="px-3 py-2"><span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold whitespace-nowrap">{r.unit}</span></td>
                <td className="px-3 py-2">
                  <select value={r.type || ""} disabled={busy === r.id} onChange={(e) => setType(r, e.target.value)} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-bold text-primary disabled:opacity-40">
                    <option value="">{t("admin.unitType.none")}</option>
                    {UNIT_TYPES.map((ut) => <option key={ut} value={ut}>{t("admin.unitType.badge", { type: ut })} · {t(`admin.unitType.${ut}`)}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {r.type && PDF_TYPES.includes(r.type)
                    ? <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t("admin.deseoPromo.pdfYes")}</span>
                    : <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{r.type ? t("admin.deseoPromo.noTemplate") : t("admin.deseoPromo.pdfNo")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {previews && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" onClick={() => setPreviews(null)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-primary">{t("admin.deseoPromo.previewTitle")}</h2>
                <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2">{t("admin.deseoPromo.sendLocked")}</p>
                {skipped.length > 0 && <p className="text-[11px] text-gray-500 mt-2">{t("admin.deseoPromo.skipped")}: {skipped.map((s) => `${s.unit} (${s.type ? t("admin.deseoPromo.noTemplate") : t("admin.unitType.none")})`).join(", ")}</p>}
              </div>
              <button onClick={() => setPreviews(null)} aria-label={t("admin.deseoPromo.close")} className="material-symbols-outlined text-gray-400 hover:text-primary">close</button>
            </div>
            {cur ? (
              <>
                <div className="px-5 py-3 text-xs space-y-1 border-b border-gray-100">
                  <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.to")}</b> {cur.row.name} &lt;{cur.row.email}&gt;</p>
                  <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.subject")}</b> {cur.subject}</p>
                  <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.attachment")}</b> {cur.row.type && PDF_TYPES.includes(cur.row.type) ? `tipo-${cur.row.type.toLowerCase()}.pdf` : "—"}</p>
                </div>
                <iframe title={cur.subject} srcDoc={cur.html} sandbox="" className="flex-1 min-h-[50vh] w-full bg-gray-50" />
                <div className="p-4 border-t border-gray-100 flex items-center gap-2">
                  <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-gray-100 text-primary/70 disabled:opacity-40">{t("admin.deseoPromo.prev")}</button>
                  <span className="text-xs font-bold text-primary/60">{idx + 1} / {previews.length}</span>
                  <button onClick={() => setIdx((i) => Math.min(previews.length - 1, i + 1))} disabled={idx >= previews.length - 1} className="text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-gray-100 text-primary/70 disabled:opacity-40">{t("admin.deseoPromo.next")}</button>
                  {SEND_ENABLED && <button disabled className="ml-auto text-[10px] font-black uppercase px-3 py-2 rounded-lg bg-primary text-white opacity-40">{t("admin.deseoPromo.send")}</button>}
                </div>
              </>
            ) : <p className="p-10 text-center text-primary/40">{t("admin.deseoPromo.noPreviews")}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeseoFurnishingPanel;
