/**
 * DeseoFurnishingPreview — plantillas Deseo de Clientes → Enviar correo ("Amueblado + extensión", "Aviso notarización").
 * Vista previa del email personalizado (nombre, unidad DS, tipo A/B/C) + envío MANUAL tras confirmación.
 * Fuente única: tabla email_templates (keys deseo_furnishing_extension / deseo_notarization), sincronizada desde
 * ~/jobs/deseo-furnishing/email/build_promo.py por ~/jobs/deseo-furnishing/sync_pdfs.sh (que también
 * sube el PDF más reciente de Drive por tipo y guarda su versión en meta.pdfs). Ver README allí.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useEscapeKey } from "../../lib/useEscapeKey";

export const FURNISHING_TYPES = ["A", "B", "C"]; // D o sin tipo: sin plantilla ni PDF
// Plantillas de email Deseo (fila en email_templates). withPdf → adjunta el PDF de amueblado del tipo.
export const DESEO_TEMPLATES = {
  furnishing: { key: "deseo_furnishing_extension", withPdf: true },
  notarization: { key: "deseo_notarization", withPdf: false },
} as const;
export type DeseoTemplate = keyof typeof DESEO_TEMPLATES;
const PDF_PATH = (ty: string) => `emails/furnishing-2026-10/amueblado-tipo-${ty.toLowerCase()}.pdf`;
const PDF_NAME = (ty: string) => `Amueblado Deseo Studios - Tipo ${ty}.pdf`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
// En el mailto del botón Confirmar los placeholders van dentro de una URL → codificar.
const fill = (html: string, v: Record<string, string>) => html.replace(/(mailto:[^"']*)/g, (m) =>
  Object.entries(v).reduce((acc, [k, val]) => acc.split(`{{${k}}}`).join(encodeURIComponent(val)), m))
  .replace(/{{(nombre|unidad|tipo)}}/g, (_, k) => esc(v[k] || ""));

interface PdfMeta { name?: string; modifiedTime?: string; version?: string; sizeMB?: number }
interface Props {
  client: { id: string; name: string; email: string };
  assignment: { unit_number?: string | null; unit_type?: string | null };
  adminUserId: string | null;
  template: DeseoTemplate;
  onClose: () => void;
}

const DeseoFurnishingPreview: React.FC<Props> = ({ client, assignment, adminUserId, template, onClose }) => {
  const { t, i18n } = useTranslation();
  const ty = assignment.unit_type || "";
  const unit = assignment.unit_number || "—";
  const tpl = DESEO_TEMPLATES[template];
  const [preview, setPreview] = useState<{ subject: string; html: string; pdf: PdfMeta | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  useEscapeKey(onClose, true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("email_templates").select("html, meta").eq("key", tpl.key).maybeSingle();
      if (!alive) return;
      if (error || !data?.html) { alert(t("admin.deseoPromo.errorTemplate")); onClose(); return; }
      const html = fill(data.html, { nombre: client.name || "", unidad: unit, tipo: ty });
      const subject = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/&amp;/g, "&").trim();
      setPreview({ subject, html, pdf: tpl.withPdf ? data.meta?.pdfs?.[ty] || null : null });
    })();
    return () => { alive = false; };
  }, [client.name, unit, ty, tpl.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!preview || !adminUserId || !client.email) return;
    const to = `${client.name} <${client.email}>`;
    if (!window.confirm(tpl.withPdf ? t("admin.deseoPromo.confirmSend", { to, unit, type: ty, file: PDF_NAME(ty) })
      : t("admin.deseoPromo.confirmSendNotary", { to, unit }))) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-client-email", {
      body: { adminUserId, to: client.email, subject: preview.subject, html: preview.html, raw: true, fromName: "Equipo de Unreal Studio",
        ...(tpl.withPdf ? { attachmentPath: PDF_PATH(ty), attachmentName: PDF_NAME(ty) } : {}), clientId: client.id, emailType: tpl.key },
    });
    setSending(false);
    if (error || !data?.success) { alert(t("admin.deseoPromo.errorSend", { error: data?.error || error?.message || "error" })); return; }
    setSent(true);
    alert(t("admin.deseoPromo.sentOk", { to: client.email }));
  };

  const pdf = preview?.pdf;
  const pdfDate = pdf?.modifiedTime ? new Date(pdf.modifiedTime).toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <div className="fixed inset-0 z-[160] bg-black/50 flex items-center justify-center p-3" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-start gap-3">
          <h2 className="flex-1 min-w-0 font-black text-primary">{t("admin.deseoPromo.previewTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("admin.deseoPromo.close")} className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>
        {!preview ? <div className="p-10 flex justify-center"><span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div> : (
          <>
            <div className="px-5 py-3 text-xs space-y-1 border-b border-gray-100">
              <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.to")}</b> {client.name} &lt;{client.email}&gt;</p>
              <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.subject")}</b> {preview.subject}</p>
              {tpl.withPdf && <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.attachment")}</b> {PDF_NAME(ty)}
                {pdf && <span className="text-gray-400"> · {t("admin.deseoPromo.pdfVersion", { version: pdf.version || "?", date: pdfDate, size: pdf.sizeMB ?? "?" })}</span>}</p>}
            </div>
            <iframe title={preview.subject} srcDoc={preview.html} sandbox="" className="flex-1 min-h-[50vh] w-full bg-gray-50" />
            <div className="p-4 border-t border-gray-100 flex items-center gap-2">
              {sent
                ? <span className="ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t("admin.deseoPromo.sent")}</span>
                : <button type="button" onClick={send} disabled={sending || !adminUserId || !client.email} className="ml-auto bg-primary text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition disabled:opacity-40">
                    <span className="material-symbols-outlined text-base">send</span> {sending ? "…" : t("admin.deseoPromo.send")}
                  </button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DeseoFurnishingPreview;
