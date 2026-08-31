/**
 * ClientPaymentsPanel — admin modal to manage one client's payment calendar
 * and issue kwitansis.
 *
 * Data flows through the SECURITY DEFINER RPCs added in
 * 20260607000001_client_payments.sql / 20260607000002_kwitansi_and_reminders.sql:
 *   admin_list_client_payments / admin_save_client_payment / admin_delete_client_payment
 *   admin_create_kwitansi  (+ send-client-email edge fn for the manual send)
 *
 * The 7-day reminder is automatic (payment-reminders cron). The kwitansi send
 * is manual from here, exactly as Andreas asked: he presses "Enviar kwitansi".
 */
import React, { useEffect, useState, useCallback } from 'react';
import { uiLocale } from '../../lib/dateLocale';
import { baliToday , dateOnly} from '../../lib/timezone';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { renderKwitansiHtml, formatFigure } from '../../lib/kwitansi';
import i18n from '../../lib/i18n';
import { withLoading } from '../../lib/loading';
import AsyncButton from '../AsyncButton';

interface Payment {
  id: string;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  received: boolean;
  received_amount?: number | null;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  position: number;
  kw_signed?: boolean;
  kw_sent?: boolean;
}
interface Unit {
  client_project_id: string;
  project_name: string;
  unit_number: string | null;
  currency: string;
  sale_total?: number | null;
  payments: Payment[];
}
interface Props {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  clientExtraEmails?: string[] | null;
  clientHolders?: { name?: string; email?: string; phone?: string; lang?: string }[] | null;
  adminUserId: string;
  brand?: { logo?: string; stamp?: string; commercial_email?: string; phone?: string };
  adminSignature?: string;
  clientLang?: string;
  filterName?: string;
  filterUnit?: string | null;
  onClose: () => void;
}

const emptyPayment = (cur: string): Partial<Payment> => ({
  label: '', amount: 0, currency: cur || 'IDR', due_date: null, paid_at: null,
  received: false, payment_method: '', reference: '', notes: '', position: 0,
});
const todayISO = () => baliToday(); // hora de Bali, no UTC (evitaba registrar el dia anterior por las mananas)

// Prefijo del nº de kwitansi a partir del nombre de proyecto: iniciales de las
// palabras antes de "(" o "-". "Deseo Studio (Tipo B) - 1bd" → "DS".
const projectPrefix = (name: string) => {
  const base = (name || '').split(/[(\-]/)[0].trim();
  const ini = base.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
  return ini.slice(0, 2) || 'US'; // 2 letras del proyecto (Deseo Studio → DS)
};
const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'IDR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${n}`; }
};
// Para inputs de importe: muestra con puntos de miles y parsea de vuelta a número.
const grp = (n: number) => (n ? n.toLocaleString('es-ES', { useGrouping: 'always' } as any) : '');
const parseNum = (s: string) => Number(String(s).replace(/\D/g, '')) || 0;


const ClientPaymentsPanel: React.FC<Props> = ({ clientId, clientName, clientEmail, clientExtraEmails, clientHolders, adminUserId, brand, adminSignature, clientLang, filterName, filterUnit, onClose }) => {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ cp: string; cur: string; pay: Partial<Payment> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [kw, setKw] = useState<null | {
    cp: string; payId?: string; received_from: string; amount: number; currency: string;
    for_payment: string; place: string; date: string; dueDate?: string; sending: boolean; displayNo: string;
    signed?: boolean; kwitansiId?: string;
  }>(null);
  // Pantalla intermedia de envío del recibí: preview + selección de destinatarios.
  // Cada titular recibe un correo SEPARADO con SU nombre (Andreas: siempre mails
  // separados cuando hay más de un usuario).
  const [recibiSend, setRecibiSend] = useState<null | {
    recipients: string[]; selected: string[]; previewEmail: string;
    no: string; subject: string; kwitansiId: string; loc: string;
    buildBody: (email: string) => string; sending: boolean;
  }>(null);
  // Nombre del titular concreto por su email (saludo personalizado); fallback al nombre completo de la ficha.
  const holderNameByEmail = (em: string): string => {
    const target = (em || '').trim().toLowerCase();
    if (target && Array.isArray(clientHolders)) {
      const m = clientHolders.find((h) => (h?.email || '').trim().toLowerCase() === target);
      if (m && (m.name || '').trim()) return (m.name || '').trim();
    }
    return (clientName || '').trim();
  };
  // Idioma de cada titular (cada uno recibe el recibí en SU idioma); fallback al de la ficha.
  const holderLangByEmail = (em: string): string => {
    const target = (em || '').trim().toLowerCase();
    if (target && Array.isArray(clientHolders)) {
      const m = clientHolders.find((h) => (h?.email || '').trim().toLowerCase() === target);
      const l = m && (m.lang || '').trim();
      if (l && ['es', 'en', 'ro', 'id'].includes(l)) return l;
    }
    return clientLang && ['es', 'en', 'ro', 'id'].includes(clientLang) ? clientLang : 'es';
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_client_payments', { p_user_id: adminUserId, p_client_id: clientId });
    setUnits(data?.success ? (data.units || []) : []);
    setLoading(false);
  }, [adminUserId, clientId]);

  useEffect(() => { void load(); }, [load]);

  // Bloquea el scroll del fondo mientras el popup está abierto (si no, al llegar
  // al final del popup el gesto arrastra la página de detrás).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const savePayment = async () => {
    if (!editing) return;
    // Validación: no permitir crear/guardar un pago sin concepto, importe, divisa y fecha.
    const pp = editing.pay;
    if (!String(pp.label || '').trim() || !Number(pp.amount) || !pp.currency || !pp.due_date) {
      alert(t('admin.pay.fillRequired', { defaultValue: 'Rellena concepto, importe, divisa y fecha límite.' }));
      return;
    }
    setSaving(true);
    // La divisa la fija la ASIGNACIÓN de la propiedad (la venta), no el pago.
    // Forzamos siempre la moneda de la unidad para que no pueda diferir.
    const unitCur = units.find((x) => x.client_project_id === editing.cp)?.currency || editing.pay.currency;
    const payload: any = { ...editing.pay, currency: unitCur, client_project_id: editing.cp };
    const { data, error } = await withLoading(supabase.rpc('admin_save_client_payment', { p_user_id: adminUserId, p_payment: payload }));
    setSaving(false);
    if (error || !data?.success) { alert(t('admin.pay.errorSavePayment')); return; }
    setEditing(null);
    await load();
  };

  const deletePayment = async (id: string) => {
    if (!window.confirm(t('admin.pay.confirmDeletePayment'))) return;
    await supabase.rpc('admin_delete_client_payment', { p_user_id: adminUserId, p_payment_id: id });
    await load();
  };

  const toggleReceived = async (p: Payment) => {
    await withLoading(supabase.rpc('admin_save_client_payment', {
      p_user_id: adminUserId,
      p_payment: { id: p.id, client_project_id: '', received: !p.received, paid_at: !p.received ? (p.paid_at || todayISO()) : p.paid_at },
    }));
    await load();
  };

  // Resetea el proceso de un pago: borra el recibí generado y vuelve a "Pendiente".
  const resetPayment = async (p: Payment) => {
    if (!window.confirm(t('fix.cpp.confirmResetPayment'))) return;
    await supabase.rpc('admin_reset_payment', { p_payment_id: p.id });
    await load();
  };

  const openKwitansi = (u: Unit, p?: Payment) => {
    // Nº por proyecto y ordenado por fecha: la posición del pago dentro de la
    // unidad (ya viene ordenada por position/fecha) → reserva = 01. Ej: "DS-01".
    const idx = p ? Math.max(0, u.payments.findIndex((x) => x.id === p.id)) : u.payments.length;
    const displayNo = `${projectPrefix(u.project_name)}-${String(idx + 1).padStart(2, '0')}`;
    setKw({
      cp: u.client_project_id,
      payId: p?.id,
      received_from: clientName,
      // Importe y fecha del recibí = lo que el admin marcó como RECIBIDO
      // (received_amount/paid_at); si no, el importe del pago como referencia.
      amount: (p?.received_amount ?? p?.amount) ?? 0,
      currency: p?.currency ?? u.currency ?? 'IDR',
      for_payment: `${u.project_name}${u.unit_number ? ' · ' + t('admin.pay.unit') + ' ' + u.unit_number : ''}${p?.label ? ' — ' + p.label : ''}`,
      place: 'Bali',
      // Fecha del recibí: la de cobro ya guardada (paid_at) si existe; si no, la
      // fecha límite acordada (due_date); en último caso, hoy. Así al reabrir se
      // ve la fecha YA guardada y no "revierte" a hoy (era la sensación de "no guarda").
      date: p?.paid_at ? p.paid_at.slice(0, 10) : (p?.due_date ? p.due_date.slice(0, 10) : todayISO()),
      dueDate: p?.due_date ? p.due_date.slice(0, 10) : undefined,
      sending: false,
      displayNo,
    });
  };

  const kwitansiHtml = (no: string | number, withSignature = true) => kw && renderKwitansiHtml({
    no, receivedFrom: kw.received_from, amount: kw.amount, currency: kw.currency,
    forPayment: kw.for_payment, place: kw.place, date: kw.date, dueDate: kw.dueDate, lang: clientLang || 'es',
    logoUrl: brand?.logo || undefined,
    signatureUrl: withSignature ? (adminSignature || undefined) : undefined,
    stampUrl: brand?.stamp || undefined,
  });

  // Descarga DIRECTA del recibí en PDF (sin abrir el diálogo de imprimir).
  const downloadKwitansi = async () => {
    if (!kw) return;
    const { downloadPdfFromHtml } = await import('../../lib/pdf');
    await downloadPdfFromHtml(kwitansiHtml(kw.displayNo), `${kw.displayNo} ${kw.received_from}`.trim().replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
  };

  // Flujo en 3 pasos OBLIGATORIOS y en orden: recibido → firmar → enviar.
  // Paso 1: marcar el pago como RECIBIDO (requisito para poder firmar).
  const markReceived = async () => {
    if (!kw?.payId) return;
    setKw({ ...kw, sending: true });
    // Importe REAL recibido + fecha = lo del recibí (kw.amount/kw.date). GUARDA YA
    // (aunque no esté firmado y se cierre la ventana). Se puede re-marcar para
    // CORREGIR la fecha de cobro. La fecha se ancla a mediodía UTC para que el día
    // se conserve igual en cualquier huso (evita el off-by-one que la movía un día).
    await supabase.rpc('admin_save_client_payment', { p_user_id: adminUserId, p_payment: { id: kw.payId, client_project_id: '', received: true, received_amount: kw.amount ?? null, paid_at: (kw.date ? `${kw.date}T12:00:00.000Z` : new Date().toISOString()) } });
    await load();
    setKw((cur) => cur ? { ...cur, sending: false } : cur);
  };

  // Paso 2: FIRMAR — crea el recibí y lo firma (añade la firma del admin). El
  // preview muestra ya la firma para verificarla antes de enviar.
  const signKwitansi = async () => {
    if (!kw) return;
    setKw({ ...kw, sending: true });
    const html = kwitansiHtml(kw.displayNo, true) || '';
    const { data: created, error: cErr } = await supabase.rpc('admin_create_kwitansi', {
      p_user_id: adminUserId,
      p_kwitansi: {
        client_project_id: kw.cp, client_payment_id: kw.payId ?? '',
        received_from: kw.received_from, amount: String(kw.amount), currency: kw.currency,
        for_payment: kw.for_payment, place: kw.place, kwitansi_date: kw.date, display_no: kw.displayNo, html,
      },
    });
    if (cErr || !created?.success) { setKw({ ...kw, sending: false }); alert(t('admin.pay.errorCreateKwitansi')); return; }
    await supabase.rpc('admin_sign_kwitansi', { p_user_id: adminUserId, p_id: created.id, p_html: html });
    setKw({ ...kw, sending: false, signed: true, kwitansiId: created.id });
  };

  // Paso 3: pulsar "Enviar a cliente(s)" → abre la pantalla intermedia (preview +
  // selección de destinatarios). El envío real ocurre en confirmSendKwitansi.
  const sendKwitansi = () => {
    if (!kw?.kwitansiId) return;
    if (!clientEmail) { alert(t('admin.pay.clientNoEmail')); return; }
    const no = kw.displayNo;
    const loc = clientLang || 'es';
    const et = i18n.getFixedT(loc); // email en el idioma del CLIENTE
    const kwUnit = units.find((u) => (u.payments || []).some((p: any) => p.id === kw.payId));
    const kwPay = units.flatMap((u) => u.payments || []).find((p) => p?.id === kw.payId);
    const dueStr = kwPay?.due_date ? new Date(dateOnly(kwPay.due_date)).toLocaleDateString(loc) : '';
    const paidStr = kw.date ? new Date(dateOnly(kw.date)).toLocaleDateString(loc) : '';
    const fig = formatFigure(kw.amount, kw.currency);
    // Cuerpo PERSONALIZADO por destinatario: su nombre Y su idioma.
    const buildBody = (em: string) => {
      const lg = holderLangByEmail(em); const e2 = i18n.getFixedT(lg);
      const dueS = kwPay?.due_date ? new Date(dateOnly(kwPay.due_date)).toLocaleDateString(lg) : '';
      const paidS = kw.date ? new Date(dateOnly(kw.date)).toLocaleDateString(lg) : '';
      return `
      <h1 style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;margin:0 0 14px;color:#3F2305">${e2('emails.recibi.title')}</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px;color:#3F2305">${e2('emails.recibi.hi', { name: holderNameByEmail(em) })}</p>
      <table style="width:100%;font-size:14px;line-height:1.9;color:#3F2305;margin:0 0 16px">
        <tr><td style="color:rgba(63,35,5,.55);width:160px">${e2('emails.recibi.concept')}</td><td style="font-weight:700">${kw.for_payment}</td></tr>
        <tr><td style="color:rgba(63,35,5,.55)">${e2('emails.recibi.amountReceived')}</td><td style="font-weight:700">${fig}</td></tr>
        ${paidS ? `<tr><td style="color:rgba(63,35,5,.55)">${e2('emails.recibi.paymentDate')}</td><td>${paidS}</td></tr>` : ''}
        ${dueS ? `<tr><td style="color:rgba(63,35,5,.55)">${e2('emails.recibi.dueDate')}</td><td>${dueS}</td></tr>` : ''}
        <tr><td style="color:rgba(63,35,5,.55)">${e2('emails.recibi.number')}</td><td>${no}</td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#3F2305">${e2('emails.recibi.downloadInstruction')}</p>
      <p style="text-align:center;margin:0 0 4px"><a href="https://unrealstudiobali.com/cliente" style="background:#3F2305;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:10px;display:inline-block;font-family:Manrope,Arial,sans-serif;font-size:13px">${e2('emails.recibi.cta')}</a></p>`;
    };
    // Si la unidad tiene participantes definidos, el recibí va SOLO a ellos; si no,
    // a TODOS los de la ficha (principal + extra_emails + holders), deduplicado —
    // como emailsOf en el admin, para no dejar fuera a un co-titular.
    const hp = (kwUnit as any)?.holder_participants;
    const rawRecipients = (Array.isArray(hp) && hp.length)
      ? hp.map((x: any) => (x?.email || '').trim())
      : [clientEmail, ...(clientExtraEmails || []), ...((clientHolders || []).map((h: any) => h?.email))].map((e) => (e || '').trim());
    const seenR = new Set<string>();
    const recipients = rawRecipients.filter(Boolean).filter((e) => { const k = e.toLowerCase(); if (seenR.has(k)) return false; seenR.add(k); return true; });
    setRecibiSend({ recipients, selected: [...recipients], previewEmail: recipients[0] || '', no, subject: et('emails.recibi.subject', { no }), kwitansiId: kw.kwitansiId, loc, buildBody, sending: false });
  };

  // Envío real: un correo SEPARADO por cada destinatario seleccionado, con su nombre.
  const confirmSendKwitansi = async () => {
    if (!recibiSend || recibiSend.selected.length === 0) return;
    const rs = recibiSend;
    setRecibiSend((p) => p ? { ...p, sending: true } : p);
    for (const to of rs.selected) {
      const lg = holderLangByEmail(to);
      const subj = i18n.getFixedT(lg)('emails.recibi.subject', { no: rs.no });
      // Reintenta si la PETICIÓN no llega a la edge function (cold-start/red):
      // "Failed to send a request to the Edge Function". No reintenta errores de
      // aplicación (p.ej. transport_not_configured), que volverían a fallar igual.
      let sent: any = null, sErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await supabase.functions.invoke('send-client-email', {
          body: { adminUserId, to, kwitansiId: rs.kwitansiId, lang: lg, subject: subj, html: rs.buildBody(to) },
        });
        sent = r.data; sErr = r.error;
        if (!sErr || sent?.success) break; // llegó a la función (ok o error de app) → no reintentar
        await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
      }
      if (sErr || !sent?.success) {
        const msg = sent?.error === 'transport_not_configured' ? t('admin.pay.errorTransport', { no: rs.no }) : t('admin.pay.errorSend', { error: sent?.error || sErr?.message || 'error' });
        setRecibiSend((p) => p ? { ...p, sending: false } : p); alert(msg); return;
      }
    }
    alert(t('admin.pay.kwitansiSent', { no: rs.no, email: rs.selected.join(', ') }));
    setRecibiSend(null); setKw(null); await load();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto overscroll-contain py-8 px-4">
      <div className="bg-white rounded-3xl ust-modal shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl">
          <div>
            <h2 className="text-xl font-black text-primary">{t('admin.pay.title')} · {clientName}</h2>
            <p className="text-xs text-gray-400">{clientEmail || t('admin.pay.noEmail')}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-6 space-y-6">
          {loading && <p className="text-sm text-gray-400">{t('admin.pay.loading')}</p>}
          {!loading && units.length === 0 && <p className="text-sm text-gray-400 italic">{t('admin.pay.noUnits')}</p>}

          {units.filter((u) => filterName === undefined || ((u.project_name || '').trim().toLowerCase() === (filterName || '').trim().toLowerCase() && (filterUnit === undefined || (u.unit_number || '').trim().toLowerCase() === (filterUnit || '').trim().toLowerCase()))).map((u) => {
            const total = u.payments.reduce((s, p) => s + Number(p.amount), 0);
            const recv = u.payments.filter((p) => p.received).reduce((s, p) => s + ((p as any).received_amount != null ? Number((p as any).received_amount) : Number(p.amount)), 0);
            const pending = Math.max(0, total - recv);
            const overpaid = Math.max(0, recv - total); // sobrepago (recibido de mas)
            return (
              <div key={u.client_project_id} className="border border-gray-100 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-primary">{u.project_name}{u.unit_number && <span className="text-gray-400 font-normal"> · {u.unit_number}</span>}</p>
                    <p className="text-[11px] text-gray-400">{t('admin.pay.receivedPendingTotal', { recv: fmt(recv, u.currency), pending: fmt(pending, u.currency), total: fmt(total, u.currency), defaultValue: 'Recibido {{recv}} · Pendiente {{pending}} · Total {{total}}' })}{overpaid > 0 && <span className="text-green-600 font-bold"> · {t('admin.pay.overpaidLabel', { defaultValue: 'Excedente' })} {fmt(overpaid, u.currency)}</span>}</p>
                  </div>
                  <button onClick={() => setEditing({ cp: u.client_project_id, cur: u.currency, pay: { ...emptyPayment(u.currency), position: u.payments.length } })}
                    className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-black">
                    <span className="material-symbols-outlined text-xs">add</span> {t('admin.pay.payment')}
                  </button>
                </div>

                <div className="divide-y divide-gray-50">
                  {u.payments.length === 0 && <p className="px-5 py-4 text-xs text-gray-300 italic">{t('admin.pay.noPayments')}</p>}
                  {u.payments.map((p) => {
                    const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                    return (
                      <div key={p.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                        <AsyncButton onClick={() => toggleReceived(p)} title={t('admin.pay.markReceived')}
                          className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition ${p.received ? 'bg-green-600 text-white' : overdue ? 'bg-red-100 text-red-500 hover:bg-green-600 hover:text-white' : 'border-2 border-gray-300 text-gray-300 hover:border-green-600 hover:text-green-600'}`}>✓</AsyncButton>
                        <div className="flex-1 min-w-[140px]">
                          <p className="font-semibold text-sm text-primary">{p.label || t('admin.pay.noLabel')}</p>
                          <p className="text-[11px] text-gray-400">
                            {p.due_date ? t('admin.pay.deadline', { date: new Date(dateOnly(p.due_date)).toLocaleDateString(uiLocale()) }) : t('admin.pay.noDate')}
                            {p.received && p.paid_at && ` · ${t('admin.pay.paidOn', { date: new Date(dateOnly(p.paid_at)).toLocaleDateString(uiLocale()) })}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold text-sm">{fmt(Number(p.amount), p.currency)}</span>
                          {(() => {
                            const recvAmt = p.received ? ((p as any).received_amount != null ? Number((p as any).received_amount) : Number(p.amount)) : 0;
                            const balance = Number(p.amount) - recvAmt; // lo que queda por recibir de ESTE pago (0 = completo)
                            const showRecv = p.received && (p as any).received_amount != null && recvAmt !== Number(p.amount);
                            return (
                              <>
                                {showRecv && <span className="block text-[10px] font-bold text-green-700 whitespace-nowrap">{t('admin.pay.receivedAmtLabel', { defaultValue: 'recibido' })}: {fmt(recvAmt, p.currency)}</span>}
                                <span className={`block text-[10px] font-bold whitespace-nowrap ${balance > 0 ? 'text-red-500' : 'text-green-600'}`}>{t('admin.pay.balanceLabel', { defaultValue: 'Balance' })}: {fmt(balance, p.currency)}</span>
                              </>
                            );
                          })()}
                        </div>
                        {/* Estado del pago: SOLO recibido / vencido / pendiente (convencion
                            unica del sistema, igual que CobrosPanel). Un pago RECIBIDO = el
                            dinero ya esta en el banco → verde "Recibido". El estado del kwitansi
                            (firmado/enviado) se ve en los botones de accion, no en este badge. */}
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${p.received ? 'bg-green-50 text-green-600' : overdue ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                          {p.received ? t('fix.cpp.statusReceived') : overdue ? t('admin.pay.statusOverdue') : t('admin.pay.statusPending')}
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => openKwitansi(u, p)} title={t('admin.pay.generateSendKwitansi')}
                            className="p-1.5 text-primary bg-almond rounded-lg hover:brightness-95"><span className="material-symbols-outlined text-sm">receipt_long</span></button>
                          <button onClick={() => setEditing({ cp: u.client_project_id, cur: u.currency, pay: { ...p } })}
                            className="p-1.5 text-primary bg-gray-50 rounded-lg hover:bg-gray-100"><span className="material-symbols-outlined text-sm">edit</span></button>
                          {(p.received || p.kw_signed || p.kw_sent) && (
                            <AsyncButton onClick={() => resetPayment(p)} title={t('fix.cpp.resetProcessTitle')}
                              className="p-1.5 text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100"><span className="material-symbols-outlined text-sm">restart_alt</span></AsyncButton>
                          )}
                          <AsyncButton onClick={() => deletePayment(p.id)}
                            className="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100"><span className="material-symbols-outlined text-sm">delete</span></AsyncButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / edit payment */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-3"
            onKeyDown={(e) => { if (e.key === 'Enter' && !saving) { e.preventDefault(); void savePayment(); } }}>
            <h3 className="font-black text-primary">{editing.pay.id ? t('admin.pay.editPayment') : t('admin.pay.newPayment')}</h3>
            <input className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder={t('admin.pay.labelPlaceholder')}
              value={editing.pay.label || ''} onChange={(e) => setEditing((pv: any) => ({ ...pv, pay: { ...pv.pay, label: e.target.value } }))} />
            <div className="flex gap-2 items-stretch">
              <input type="text" inputMode="numeric" className="flex-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder={t('admin.pay.amountPlaceholder')}
                value={grp(editing.pay.amount || 0)} onChange={(e) => setEditing((pv: any) => ({ ...pv, pay: { ...pv.pay, amount: parseNum(e.target.value) } }))} />
              {/* La divisa la fija la venta (asignación de la propiedad), no se elige aquí. */}
              <span className="px-3 flex items-center bg-gray-100 border rounded-lg text-sm font-bold text-primary/70" title={t('admin.pay.currencyFromSale', { defaultValue: 'La divisa la fija la venta de la propiedad' })}>
                {units.find((x) => x.client_project_id === editing.cp)?.currency || editing.pay.currency || 'EUR'}
              </span>
            </div>
            {(() => {
              const eu = units.find((x) => x.client_project_id === editing.cp);
              if (!eu || eu.sale_total == null) return null;
              const assigned = eu.payments.filter((p) => p.id !== editing.pay.id).reduce((s, p) => s + Number(p.amount), 0) + Number(editing.pay.amount || 0);
              const pending = Number(eu.sale_total) - assigned;
              return <p className={`text-[11px] italic -mt-1 ${pending < 0 ? 'text-red-600 font-bold' : 'text-primary/50'}`}>{t('fix.cpp.pendingToAssign', { amount: fmt(pending, eu.currency) })}</p>;
            })()}
            <label className="block text-[10px] font-black uppercase text-gray-400">{t('admin.pay.dueDateLabel')}</label>
            <input type="date" min="2000-01-01" max="2099-12-31" className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm"
              value={editing.pay.due_date || ''} onChange={(e) => setEditing((pv: any) => ({ ...pv, pay: { ...pv.pay, due_date: e.target.value } }))} />
            <input className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder={t('admin.pay.notesPlaceholder')}
              value={editing.pay.notes || ''} onChange={(e) => setEditing((pv: any) => ({ ...pv, pay: { ...pv.pay, notes: e.target.value } }))} />
            {/* El importe REAL recibido y la fecha de cobro se capturan al GENERAR EL RECIBÍ
                (al marcar recibido), no aquí — para no duplicarlo en el calendario. */}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-lg border text-sm font-bold text-gray-500">{t('admin.common.cancel')}</button>
              <button disabled={saving} onClick={savePayment} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">{saving ? t('admin.common.saving') : t('admin.common.save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Kwitansi preview + send */}
      {kw && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-4 z-[60]">
          <div className="bg-white rounded-2xl ust-modal p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-primary">{t('admin.pay.kwitansi')}</h3>
              <button onClick={() => setKw(null)} className="text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <input className="px-3 py-2 bg-gray-50 border rounded-lg col-span-2" placeholder={t('admin.pay.receivedFromPlaceholder')}
                value={kw.received_from} onChange={(e) => setKw((pv: any) => ({ ...pv, received_from: e.target.value }))} />
              <input type="text" inputMode="numeric" className="px-3 py-2 bg-gray-50 border rounded-lg" placeholder={t('admin.pay.amountPlaceholder')}
                value={grp(kw.amount || 0)} onChange={(e) => setKw((pv: any) => ({ ...pv, amount: parseNum(e.target.value) }))} />
              <select className="pl-3 pr-8 py-2 bg-gray-50 border rounded-lg" value={kw.currency} onChange={(e) => setKw((pv: any) => ({ ...pv, currency: e.target.value }))}>
                <option>IDR</option><option>EUR</option><option>USD</option>
              </select>
              <input className="px-3 py-2 bg-gray-50 border rounded-lg col-span-2" placeholder={t('admin.pay.forPaymentPlaceholder')}
                value={kw.for_payment} onChange={(e) => setKw((pv: any) => ({ ...pv, for_payment: e.target.value }))} />
              <input className="px-3 py-2 bg-gray-50 border rounded-lg" placeholder={t('admin.pay.placePlaceholder')} value={kw.place} onChange={(e) => setKw((pv: any) => ({ ...pv, place: e.target.value }))} />
              <input type="date" min="2000-01-01" max="2099-12-31" className="px-3 py-2 bg-gray-50 border rounded-lg" value={kw.date} onChange={(e) => setKw((pv: any) => ({ ...pv, date: e.target.value }))} />
            </div>
            <div className="text-[11px] text-gray-400">{t('admin.pay.amountInFigures')}: <b>{formatFigure(kw.amount, kw.currency)}</b></div>
            <div className="border rounded-xl p-3 bg-gray-50 max-h-[40vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: kwitansiHtml(kw.displayNo, !!kw.signed) || '' }} />
            {(() => {
              const kwReceived = !!units.flatMap((u) => u.payments).find((p) => p.id === kw.payId)?.received;
              return (
                <div className="space-y-2">
                  <AsyncButton onClick={() => downloadKwitansi()} className="w-full py-2.5 rounded-lg border text-sm font-bold text-primary inline-flex items-center justify-center gap-1"><span className="material-symbols-outlined text-sm">download</span> {t('fix.cpp.downloadPdf')}</AsyncButton>
                  <p className="text-[11px] text-gray-400 text-center">{t('fix.cpp.stepsInOrder')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button disabled={kw.sending} onClick={markReceived}
                      className={`py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-60 ${kwReceived ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-primary text-white hover:bg-black'}`}>
                      {kwReceived ? t('fix.cpp.step1Received') : t('fix.cpp.step1MarkReceived')}
                    </button>
                    <button disabled={kw.sending || !kwReceived || kw.signed} onClick={signKwitansi}
                      className={`py-2.5 rounded-lg text-xs font-bold transition disabled:opacity-40 ${kw.signed ? 'bg-green-100 text-green-700' : 'bg-primary text-white hover:bg-black'}`}>
                      {kw.signed ? t('fix.cpp.step2Signed') : t('fix.cpp.step2Sign')}
                    </button>
                    <button disabled={kw.sending || !kw.signed} onClick={sendKwitansi}
                      className="py-2.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-black transition disabled:opacity-40">
                      {kw.sending ? '…' : t('fix.cpp.step3SendToClient')}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Pantalla intermedia de envío del recibí: preview + selección de destinatarios.
          Cada titular recibe un correo SEPARADO con su nombre. */}
      {recibiSend && (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !recibiSend.sending) setRecibiSend(null); }}>
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-5 border-b">
              <div className="min-w-0">
                <h3 className="font-black text-primary text-sm uppercase tracking-widest">{t('admin.pay.kwitansiSendTitle', { defaultValue: 'Enviar recibí al cliente' })}</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{recibiSend.subject}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('admin.dash.emailPreviewTo', { defaultValue: 'Para' })}:</span>
                  {recibiSend.recipients.map((em) => (
                    <label key={em} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border cursor-pointer ${recibiSend.selected.includes(em) ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                      <input type="checkbox" checked={recibiSend.selected.includes(em)} onChange={() => setRecibiSend((p) => { if (!p) return p; const selected = p.selected.includes(em) ? p.selected.filter((x) => x !== em) : [...p.selected, em]; return { ...p, selected }; })} className="rounded" />
                      {em}
                    </label>
                  ))}
                </div>
                {recibiSend.recipients.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('admin.dash.emailPreviewViewAs', { defaultValue: 'Ver como' })}:</span>
                    {recibiSend.recipients.map((em) => (
                      <button key={em} type="button" onClick={() => setRecibiSend((p) => p ? { ...p, previewEmail: em } : p)} className={`text-xs px-2 py-1 rounded-lg border transition ${recibiSend.previewEmail === em ? 'bg-primary text-white border-primary' : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-primary/40'}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setRecibiSend(null)} disabled={recibiSend.sending} className="p-2 text-gray-400 hover:text-primary disabled:opacity-50 shrink-0"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="overflow-y-auto p-5 bg-[#F3E5D8] flex-1">
              <div className="text-center mb-4"><span style={{ fontFamily: "'DM Serif Display',Georgia,serif" }} className="text-2xl font-bold text-primary">Unreal Studio Bali</span></div>
              <div className="bg-white rounded-2xl p-6 shadow-sm" dangerouslySetInnerHTML={{ __html: recibiSend.buildBody(recibiSend.previewEmail) }} />
            </div>
            <div className="flex gap-2 p-4 border-t">
              <button onClick={() => setRecibiSend(null)} disabled={recibiSend.sending} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold text-xs uppercase tracking-widest disabled:opacity-50">{t('admin.common.cancel')}</button>
              <button onClick={() => void confirmSendKwitansi()} disabled={recibiSend.sending || recibiSend.selected.length === 0} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-xs uppercase tracking-widest hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2">{recibiSend.sending ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t('admin.adminDash.savingEllipsis', { defaultValue: 'Enviando…' })}</> : <><span className="material-symbols-outlined text-sm">send</span> {t('admin.dash.sendEmailBtn', { defaultValue: 'Enviar' })} ({recibiSend.selected.length})</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPaymentsPanel;
