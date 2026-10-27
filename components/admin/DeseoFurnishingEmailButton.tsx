/**
 * DeseoFurnishingEmailButton — "Email amueblado + extensión" de UNA asignación Deseo (ficha de cliente).
 * Abre la vista previa del email personalizado (tipo A/B/C) y permite el envío MANUAL tras confirmación.
 * Tipo D o sin tipo → sin plantilla (botón deshabilitado). Nada automático ni masivo.
 * Plantillas: public/email-templates/deseo-promo-tipo-{a,b,c}.html (fuente: ~/jobs/deseo-furnishing/email).
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../lib/supabase";
import { useEscapeKey } from "../../lib/useEscapeKey";

const PDF_PATH = (ty: string) => `emails/furnishing-2026-10/amueblado-tipo-${ty.toLowerCase()}.pdf`;
const PDF_NAME = (ty: string) => `Amueblado Deseo Studios - Tipo ${ty}.pdf`;
const TEMPLATE_TYPES = ["A", "B", "C"]; // D: sin plantilla ni PDF

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

interface Props { client: { id: string; name: string; email: string }; assignment: { unit_number?: string | null; unit_type?: string | null }; adminUserId: string | null; }

const DeseoFurnishingEmailButton: React.FC<Props> = ({ client, assignment, adminUserId }) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const ty = assignment.unit_type || "";
  const unit = assignment.unit_number || "—";
  const hasTemplate = TEMPLATE_TYPES.includes(ty);
  useEscapeKey(() => setPreview(null), !!preview);

  const open = async () => {
    try {
      const res = await fetch(`/email-templates/deseo-promo-tipo-${ty.toLowerCase()}.html`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const html = (await res.text()).replace(/{{nombre}}/g, esc(client.name || "")).replace(/{{unidad}}/g, esc(unit)).replace(/{{tipo}}/g, esc(ty));
      const subject = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/&amp;/g, "&").trim();
      setPreview({ subject, html });
    } catch { alert(t("admin.deseoPromo.errorTemplate")); }
  };

  // Envío manual de UN cliente, tras confirmación explícita (destinatario, unidad, tipo, adjunto).
  const send = async () => {
    if (!preview || !adminUserId || !client.email) return;
    if (!window.confirm(t("admin.deseoPromo.confirmSend", { to: `${client.name} <${client.email}>`, unit, type: ty, file: PDF_NAME(ty) }))) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-client-email", {
      body: { adminUserId, to: client.email, subject: preview.subject, html: preview.html, raw: true, fromName: "Equipo de Unreal Studio",
        attachmentPath: PDF_PATH(ty), attachmentName: PDF_NAME(ty), clientId: client.id, emailType: "deseo_furnishing_extension" },
    });
    setSending(false);
    if (error || !data?.success) { alert(t("admin.deseoPromo.errorSend", { error: data?.error || error?.message || "error" })); return; }
    setSent(true);
    alert(t("admin.deseoPromo.sentOk", { to: client.email }));
  };

  return (
    <>
      <button type="button" onClick={open} disabled={!hasTemplate}
        title={hasTemplate ? t("admin.deseoPromo.title") : `${t("admin.deseoPromo.title")} · ${t("admin.deseoPromo.noTemplate")}`}
        aria-label={t("admin.deseoPromo.title")}
        className="text-primary bg-primary/5 hover:bg-primary/15 transition p-2 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed">
        <span className="material-symbols-outlined text-xl leading-none">chair</span>
      </button>
      {preview && (
        <div className="fixed inset-0 z-[160] bg-black/50 flex items-center justify-center p-3" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-start gap-3">
              <h2 className="flex-1 min-w-0 font-black text-primary">{t("admin.deseoPromo.previewTitle")}</h2>
              <button type="button" onClick={() => setPreview(null)} aria-label={t("admin.deseoPromo.close")} className="material-symbols-outlined text-gray-400 hover:text-primary">close</button>
            </div>
            <div className="px-5 py-3 text-xs space-y-1 border-b border-gray-100">
              <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.to")}</b> {client.name} &lt;{client.email}&gt;</p>
              <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.subject")}</b> {preview.subject}</p>
              <p><b className="text-gray-400 uppercase text-[10px]">{t("admin.deseoPromo.attachment")}</b> {PDF_NAME(ty)}</p>
            </div>
            <iframe title={preview.subject} srcDoc={preview.html} sandbox="" className="flex-1 min-h-[50vh] w-full bg-gray-50" />
            <div className="p-4 border-t border-gray-100 flex items-center gap-2">
              {sent
                ? <span className="ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t("admin.deseoPromo.sent")}</span>
                : <button type="button" onClick={send} disabled={sending || !adminUserId || !client.email} className="ml-auto bg-primary text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 hover:bg-black transition disabled:opacity-40">
                    <span className="material-symbols-outlined text-base">send</span> {sending ? "…" : t("admin.deseoPromo.send")}
                  </button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeseoFurnishingEmailButton;
