/**
 * ClientPaymentsSection — calendario de pagos (solo lectura) del portal cliente.
 *
 * Datos vía RPC client_get_payments(p_client_id). Cada due_date es el día LÍMITE
 * para que Unreal Studio RECIBA los fondos.
 *
 * Variantes:
 *  - 'table' (+ filterName/filterUnit): tabla completa de UNA propiedad para el modal
 *    "Calendario de pagos" (columnas: concepto, fecha límite, cantidad, recibida, balance).
 *  - 'list': lista por unidad (uso antiguo / full).
 * Sin emojis (regla de marca): estados con iconos Material Symbols.
 */
import React, { useEffect, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { renderKwitansiHtml } from '../lib/kwitansi';

interface Payment {
  id: string; label: string; amount: number; currency: string;
  due_date: string | null; paid_at: string | null; received: boolean; received_amount?: number | null; position: number;
}
// Importe efectivamente recibido: el real (received_amount) si está, si no el
// total cuando está marcado como recibido, si no 0.
const recvOf = (p: Payment): number => {
  if (p.received_amount != null) return Number(p.received_amount);
  return p.received ? Number(p.amount) : 0;
};
interface Unit { client_project_id: string; project_name: string; unit_number: string | null; currency: string; payments: Payment[]; }

interface Props {
  clientId: string;
  filterName?: string;
  filterUnit?: string | null;
  variant?: 'list' | 'table';
}

const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'IDR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${n}`; }
};
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; }
};
const byDate = (a: Payment, b: Payment) => {
  const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
  const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
  if (da !== db) return da - db;
  return (a.position || 0) - (b.position || 0);
};

const ClientPaymentsSection: React.FC<Props> = ({ clientId, filterName, filterUnit, variant = 'list' }) => {
  const { t, i18n } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, { id: string; html: string; no_seq: number }>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Preview del recibí en un pop-up antes de descargar (evita que el navegador
  // —p.ej. Brave— bloquee la descarga directa sin avisar; el botón "Descargar"
  // del pop-up es un gesto de usuario claro).
  const [preview, setPreview] = useState<{ kw: any; payId: string } | null>(null);

  useEffect(() => {
    if (!clientId) return;
    void (async () => {
      try {
        const { data } = await supabase.rpc('client_get_payments', { p_client_id: clientId });
        setUnits(data?.success ? (data.units || []) : []);
      } finally { setLoading(false); }
    })();
    void (async () => {
      const { data } = await supabase.rpc('client_get_kwitansis');
      if (data?.success) {
        const m: Record<string, { id: string; html: string; no_seq: number }> = {};
        for (const k of (data.kwitansis || [])) if (k.client_payment_id) m[k.client_payment_id] = k;
        setReceipts(m);
      }
    })();
  }, [clientId]);

  // Genera el recibí como PDF FIJO A4 dibujado con jsPDF (no captura de pantalla:
  // el método con html2canvas se quedaba en negro en iPhone). Documento físico de
  // dimensiones fijas, igual en todos los dispositivos, que se descarga como archivo.
  const viewReceipt = async (kw: any, payId: string) => {
    setDownloadingId(payId);
    try {
      const { downloadRecibiPdf } = await import('../lib/recibiPdf');
      await downloadRecibiPdf({
        no: kw.display_no || kw.no_seq, receivedFrom: kw.received_from || '', amount: Number(kw.amount || 0),
        currency: kw.currency || 'EUR', forPayment: kw.for_payment || '', place: kw.place || 'Bali',
        date: kw.kwitansi_date, dueDate: kw.due_date || undefined,
        projectName: kw.project_name || undefined, unit: kw.unit_number || undefined,
        lang: i18n.language, html: kw.html,
      });
    } catch { alert(t('fix.pay.popupBlocked')); }
    finally { setDownloadingId(null); }
  };

  // HTML del preview: lo RE-RENDERIZAMOS con los datos del recibí (incluida la
  // fecha de vencimiento) en vez de usar el html almacenado, que en recibís
  // antiguos se firmó sin esa línea. Sello/firma se extraen del html guardado.
  const previewHtml = (kw: any): string => {
    const srcs: string[] = []; const re = /<img[^>]+src="([^"]+)"/g; let m;
    while ((m = re.exec(kw.html || ''))) srcs.push(m[1]);
    const hasLogo = srcs.length >= 3; // [logo?, sello, firma]
    return renderKwitansiHtml({
      no: kw.display_no || kw.no_seq,
      receivedFrom: kw.received_from || '',
      amount: Number(kw.amount || 0),
      currency: kw.currency || 'EUR',
      forPayment: kw.for_payment || '',
      place: kw.place || 'Bali',
      date: kw.kwitansi_date,
      dueDate: kw.due_date || undefined,
      lang: i18n.language,
      logoUrl: hasLogo ? srcs[0] : undefined,
      stampUrl: hasLogo ? srcs[1] : srcs[0],
      signatureUrl: hasLogo ? srcs[2] : srcs[1],
    });
  };

  // Pop-up de previsualización del recibí + botón de descarga (web y web-app).
  const previewModal = preview ? (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-4" onClick={() => setPreview(null)}>
      <div className="bg-almond w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-primary/10 shrink-0">
          <h3 className="font-serif text-lg text-primary">{t('fix.pay.receipt')}</h3>
          <button onClick={() => setPreview(null)} className="text-primary/40 hover:text-primary p-1"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="overflow-y-auto p-4" dangerouslySetInnerHTML={{ __html: previewHtml(preview.kw) }} />
        <div className="px-5 py-3 border-t border-primary/10 shrink-0">
          <button
            onClick={() => void viewReceipt(preview.kw, preview.payId)}
            disabled={downloadingId === preview.payId}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white text-xs font-black uppercase tracking-widest py-3 rounded-xl hover:bg-black transition disabled:opacity-70"
          >
            <span className={`material-symbols-outlined text-base ${downloadingId === preview.payId ? 'animate-spin' : ''}`}>{downloadingId === preview.payId ? 'progress_activity' : 'download'}</span>
            {downloadingId === preview.payId ? t('fix.pay.generating', { defaultValue: 'Generando…' }) : t('fix.pay.downloadPdf', { defaultValue: 'Descargar PDF' })}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const submitClaim = async (paymentId: string) => {
    setSending(true);
    try {
      await supabase.rpc('client_claim_payment', { p_client_id: clientId, p_payment_id: paymentId, p_note: claimNote.trim() || null });
      setClaimedIds((prev) => new Set(prev).add(paymentId));
      setClaimingId(null);
      setClaimNote('');
    } finally { setSending(false); }
  };

  const norm = (s?: string | null) => (s || '').trim().toLowerCase();
  const shown = (filterName !== undefined)
    ? units.filter((u) => norm(u.project_name) === norm(filterName) && (filterUnit === undefined || norm(u.unit_number) === norm(filterUnit)))
    : units;

  if (loading) return <p className="text-sm text-primary/40 py-4">{t('fix.pay.loadingCalendar')}</p>;
  if (shown.length === 0) return <p className="text-sm text-primary/40 py-4">{t('fix.pay.noPaymentsYet')}</p>;

  // ===== Variante TABLA (modal) =====
  if (variant === 'table') {
    return (
      <>
      <div className="space-y-8">
        {shown.map((u) => {
          const pays = [...u.payments].sort(byDate);
          const total = pays.reduce((s, p) => s + Number(p.amount), 0);
          const recv = pays.reduce((s, p) => s + recvOf(p), 0); // importe REAL recibido (parcial) = coherente con el pie
          const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
          return (
            <div key={u.client_project_id}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-primary/50">{t('fix.pay.summary')}</span>
                <span className="text-xs font-bold text-primary">{t('fix.pay.pctReceived', { pct })} · {fmt(recv, u.currency)} / {fmt(total, u.currency)}</span>
              </div>
              <div className="h-2 bg-primary/10 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              {/* Móvil: tarjetas condensadas (evita el scroll horizontal de 8 columnas). */}
              <div className="sm:hidden space-y-3">
                {pays.map((p) => {
                  const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                  const received = recvOf(p);
                  const balance = Number(p.amount) - received;
                  const claimed = claimedIds.has(p.id);
                  return (
                    <div key={p.id} className={`rounded-xl p-3.5 border ${p.received ? 'bg-green-50 border-green-200' : overdue ? 'bg-red-50 border-red-200' : 'bg-white border-primary/10'}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-bold text-primary text-sm min-w-0">{p.label}</div>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${p.received ? 'bg-green-100 text-green-700' : overdue ? 'bg-red-100 text-red-600' : 'bg-almond text-primary/50'}`}>
                          <span className="material-symbols-outlined text-sm">{p.received ? 'check_circle' : overdue ? 'warning' : 'schedule'}</span>
                          {p.received ? t('fix.pay.statusReceived') : overdue ? t('fix.pay.statusOverdue') : t('fix.pay.statusPending')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div className="text-primary/50">{t('fix.pay.colDueDate')}</div>
                        <div className="text-right text-primary/80 font-medium">{fmtDate(p.due_date)}</div>
                        <div className="text-primary/50">{t('fix.pay.colAmount')}</div>
                        <div className="text-right font-bold text-primary">{fmt(Number(p.amount), p.currency)}</div>
                        <div className="text-primary/50">{t('fix.pay.colReceived')}</div>
                        <div className="text-right text-green-700 font-medium">{received > 0 ? `${fmt(received, p.currency)} · ${fmtDate(p.paid_at)}` : '—'}</div>
                        <div className="text-primary/50">{t('fix.pay.colBalance')}</div>
                        <div className={`text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(balance, p.currency)}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        {receipts[p.id] ? (
                          <button onClick={() => setPreview({ kw: receipts[p.id], payId: p.id })} className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-black transition">
                            <span className="material-symbols-outlined text-sm">visibility</span>{t('fix.pay.receipt')}
                          </button>
                        ) : <span />}
                        {!p.received && (
                          claimed ? (
                            <span className="text-[11px] font-bold text-green-700">{t('fix.pay.noticeSent')}</span>
                          ) : claimingId === p.id ? (
                            <div className="flex items-center gap-1">
                              <input type="text" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder={t('fix.pay.referenceOptional')} className="rounded border border-primary/15 px-2 py-1 text-[11px] bg-white w-24" />
                              <button onClick={() => void submitClaim(p.id)} disabled={sending} className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded disabled:opacity-50">{sending ? '…' : t('fix.pay.confirm')}</button>
                              <button onClick={() => { setClaimingId(null); setClaimNote(''); }} className="text-[10px] text-primary/50 px-1">×</button>
                            </div>
                          ) : (
                            <button onClick={() => { setClaimingId(p.id); setClaimNote(''); }} className="text-[10px] font-bold text-primary border border-primary/20 rounded-full px-2 py-0.5 hover:bg-primary hover:text-white transition">{t('fix.pay.alreadyPaid')}</button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const tRecv = pays.reduce((s, p) => s + recvOf(p), 0);
                  const tBal = total - tRecv;
                  return (
                    <div className="rounded-xl p-3.5 bg-almond/60 border-2 border-primary/15 text-sm">
                      <div className="flex items-center justify-between font-bold text-primary"><span>{t('fix.pay.total')}</span><span>{fmt(total, u.currency)}</span></div>
                      <div className="flex items-center justify-between text-xs mt-1"><span className="text-primary/50">{t('fix.pay.colReceived')}</span><span className="text-green-700 font-bold">{fmt(tRecv, u.currency)}</span></div>
                      <div className="flex items-center justify-between text-xs mt-1"><span className="text-primary/50">{t('fix.pay.colBalance')}</span><span className={`font-bold ${tBal > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(tBal, u.currency)}</span></div>
                    </div>
                  );
                })()}
              </div>
              {/* Desktop: tabla completa. */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-primary/10">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-almond/50 text-[10px] uppercase tracking-widest text-primary/50">
                    <tr>
                      <th className="text-left px-4 py-3">{t('fix.pay.colConcept')}</th>
                      <th className="text-left px-4 py-3">{t('fix.pay.colDueDate')}</th>
                      <th className="text-right px-4 py-3">{t('fix.pay.colAmount')}</th>
                      <th className="text-right px-4 py-3">{t('fix.pay.colReceived')}</th>
                      <th className="text-left px-4 py-3">{t('fix.pay.colChargeDate')}</th>
                      <th className="text-right px-4 py-3">{t('fix.pay.colBalance')}</th>
                      <th className="text-left px-4 py-3">{t('fix.pay.colStatus')}</th>
                      <th className="text-right px-4 py-3">{t('fix.pay.colReceipt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pays.map((p) => {
                      const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                      const received = recvOf(p);
                      const balance = Number(p.amount) - received;
                      const claimed = claimedIds.has(p.id);
                      return (
                        <tr key={p.id} className="border-t border-primary/5">
                          <td className="px-4 py-3 font-medium text-primary">{p.label}</td>
                          <td className="px-4 py-3 text-primary/70 whitespace-nowrap">{fmtDate(p.due_date)}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">{fmt(Number(p.amount), p.currency)}</td>
                          <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">{received > 0 ? fmt(received, p.currency) : '—'}</td>
                          <td className="px-4 py-3 text-primary/60 whitespace-nowrap">{received > 0 ? fmtDate(p.paid_at) : '—'}</td>
                          <td className={`px-4 py-3 text-right whitespace-nowrap font-bold ${balance > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(balance, p.currency)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${p.received ? 'bg-green-50 text-green-600' : overdue ? 'bg-red-50 text-red-500' : 'bg-almond text-primary/50'}`}>
                              <span className="material-symbols-outlined text-sm">{p.received ? 'check_circle' : overdue ? 'warning' : 'schedule'}</span>
                              {p.received ? t('fix.pay.statusReceived') : overdue ? t('fix.pay.statusOverdue') : t('fix.pay.statusPending')}
                            </span>
                            {!p.received && (
                              <div className="mt-1">
                                {claimed ? (
                                  <span className="text-[11px] font-bold text-green-700">{t('fix.pay.noticeSent')}</span>
                                ) : claimingId === p.id ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <input type="text" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder={t('fix.pay.referenceOptional')} className="rounded border border-primary/15 px-2 py-1 text-[11px] bg-white w-32" />
                                    <button onClick={() => void submitClaim(p.id)} disabled={sending} className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded disabled:opacity-50">{sending ? '…' : t('fix.pay.confirm')}</button>
                                    <button onClick={() => { setClaimingId(null); setClaimNote(''); }} className="text-[10px] text-primary/50 px-1">×</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setClaimingId(p.id); setClaimNote(''); }} className="text-[10px] font-bold text-primary border border-primary/20 rounded-full px-2 py-0.5 hover:bg-primary hover:text-white transition mt-1">{t('fix.pay.alreadyPaid')}</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {receipts[p.id] ? (
                              <button onClick={() => setPreview({ kw: receipts[p.id], payId: p.id })} className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-black transition">
                                <span className="material-symbols-outlined text-sm">visibility</span>{t('fix.pay.receipt')}
                              </button>
                            ) : <span className="text-[11px] text-primary/30">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const tRecv = pays.reduce((s, p) => s + recvOf(p), 0);
                      const tBal = total - tRecv;
                      return (
                        <tr className="border-t-2 border-primary/20 bg-almond/40 font-bold text-primary">
                          <td className="px-4 py-3" colSpan={2}>{t('fix.pay.total')}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">{fmt(total, u.currency)}</td>
                          <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">{fmt(tRecv, u.currency)}</td>
                          <td className="px-4 py-3" />
                          <td className={`px-4 py-3 text-right whitespace-nowrap font-bold ${tBal > 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(tBal, u.currency)}</td>
                          <td className="px-4 py-3" colSpan={2} />
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      {previewModal}
      </>
    );
  }

  // ===== Variante LISTA (full, uso antiguo) =====
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-primary mb-1">{t('fix.pay.calendarTitle')}</h2>
      <p className="text-xs text-primary/50 mb-4">{t('fix.pay.calendarIntroBefore')}<strong>{t('fix.pay.calendarIntroReceived')}</strong>{t('fix.pay.calendarIntroAfter')}</p>
      <div className="space-y-6">
        {shown.map((u) => {
          const pays = [...u.payments].sort(byDate);
          const total = pays.reduce((s, p) => s + Number(p.amount), 0);
          const recv = pays.reduce((s, p) => s + recvOf(p), 0); // importe REAL recibido (parcial) = coherente con el pie
          const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
          return (
            <article key={u.client_project_id} className="bg-white rounded-2xl border border-primary/5 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-lg text-primary">{u.project_name}{u.unit_number && <span className="text-primary/50 text-sm font-sans"> · {u.unit_number}</span>}</h3>
                <span className="text-xs font-bold text-primary">{pct}% · {fmt(recv, u.currency)} / {fmt(total, u.currency)}</span>
              </div>
              <div className="h-2 bg-primary/10 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <ul className="space-y-2">
                {pays.map((p) => {
                  const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                  const icon = p.received ? 'check_circle' : overdue ? 'warning' : 'schedule';
                  const iconColor = p.received ? 'text-green-600' : overdue ? 'text-red-500' : 'text-primary/40';
                  return (
                    <li key={p.id} className={`rounded-lg p-3 text-sm ${p.received ? 'bg-green-50 border border-green-200' : overdue ? 'bg-red-50 border border-red-200' : 'bg-almond/40 border border-primary/10'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`material-symbols-outlined text-lg ${iconColor}`}>{icon}</span>
                          <div className="min-w-0">
                            <div className="font-medium truncate text-primary">{p.label}</div>
                            <div className="text-xs text-primary/60">{p.received && p.paid_at ? t('fix.pay.receivedOn', { date: fmtDate(p.paid_at) }) : p.due_date ? t('fix.pay.dueDateLabel', { date: fmtDate(p.due_date) }) : ''}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary">{fmt(Number(p.amount), p.currency)}</div>
                          <div className="text-xs text-primary/60">{p.received ? t('fix.pay.statusReceived') : overdue ? t('fix.pay.statusOverdue') : t('fix.pay.statusPending')}</div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ClientPaymentsSection;
