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
import { supabase } from '../lib/supabase';

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
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'IDR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${c} ${n}`; }
};
const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; }
};
const byDate = (a: Payment, b: Payment) => {
  const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
  const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
  if (da !== db) return da - db;
  return (a.position || 0) - (b.position || 0);
};

const ClientPaymentsSection: React.FC<Props> = ({ clientId, filterName, filterUnit, variant = 'list' }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, { id: string; html: string; no_seq: number }>>({});

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

  // Descarga DIRECTA del recibí en PDF (sin abrir pestaña ni diálogo de imprimir).
  const viewReceipt = async (html: string, no: number) => {
    const { downloadPdfFromHtml } = await import('../lib/pdf');
    await downloadPdfFromHtml(html, `recibi_${no}.pdf`);
  };

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

  if (loading) return <p className="text-sm text-primary/40 py-4">Cargando calendario…</p>;
  if (shown.length === 0) return <p className="text-sm text-primary/40 py-4">No hay pagos registrados todavía.</p>;

  // ===== Variante TABLA (modal) =====
  if (variant === 'table') {
    return (
      <div className="space-y-8">
        {shown.map((u) => {
          const pays = [...u.payments].sort(byDate);
          const total = pays.reduce((s, p) => s + Number(p.amount), 0);
          const recv = pays.filter((p) => p.received).reduce((s, p) => s + Number(p.amount), 0);
          const pct = total > 0 ? Math.round((recv / total) * 100) : 0;
          return (
            <div key={u.client_project_id}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-primary/50">Resumen</span>
                <span className="text-xs font-bold text-primary">{pct}% recibido · {fmt(recv, u.currency)} / {fmt(total, u.currency)}</span>
              </div>
              <div className="h-2 bg-primary/10 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="overflow-x-auto rounded-xl border border-primary/10">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-almond/50 text-[10px] uppercase tracking-widest text-primary/50">
                    <tr>
                      <th className="text-left px-4 py-3">Concepto</th>
                      <th className="text-left px-4 py-3">Fecha límite</th>
                      <th className="text-right px-4 py-3">Cantidad</th>
                      <th className="text-right px-4 py-3">Recibida</th>
                      <th className="text-left px-4 py-3">Fecha cobro</th>
                      <th className="text-right px-4 py-3">Balance</th>
                      <th className="text-left px-4 py-3">Estado</th>
                      <th className="text-right px-4 py-3">Recibí</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pays.map((p) => {
                      const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                      const received = recvOf(p);
                      const balance = Number(p.amount) - received;
                      // Rojo cuando llegó algo pero falta (p.ej. comisiones): 4.995 de 5.000 → balance 5.
                      const shortfall = received > 0 && balance > 0;
                      const claimed = claimedIds.has(p.id);
                      return (
                        <tr key={p.id} className="border-t border-primary/5">
                          <td className="px-4 py-3 font-medium text-primary">{p.label}</td>
                          <td className="px-4 py-3 text-primary/70 whitespace-nowrap">{fmtDate(p.due_date)}</td>
                          <td className="px-4 py-3 text-right font-bold text-primary whitespace-nowrap">{fmt(Number(p.amount), p.currency)}</td>
                          <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">{received > 0 ? fmt(received, p.currency) : '—'}</td>
                          <td className="px-4 py-3 text-primary/60 whitespace-nowrap">{received > 0 ? fmtDate(p.paid_at) : '—'}</td>
                          <td className={`px-4 py-3 text-right whitespace-nowrap ${shortfall ? 'text-red-600 font-bold' : 'text-primary/70'}`}>{fmt(balance, p.currency)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${p.received ? 'bg-green-50 text-green-600' : overdue ? 'bg-red-50 text-red-500' : 'bg-almond text-primary/50'}`}>
                              <span className="material-symbols-outlined text-sm">{p.received ? 'check_circle' : overdue ? 'warning' : 'schedule'}</span>
                              {p.received ? 'Recibido' : overdue ? 'Vencido' : 'Pendiente'}
                            </span>
                            {!p.received && (
                              <div className="mt-1">
                                {claimed ? (
                                  <span className="text-[11px] font-bold text-green-700">Aviso enviado</span>
                                ) : claimingId === p.id ? (
                                  <div className="flex items-center gap-1 mt-1">
                                    <input type="text" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder="Referencia (opcional)" className="rounded border border-primary/15 px-2 py-1 text-[11px] bg-white w-32" />
                                    <button onClick={() => void submitClaim(p.id)} disabled={sending} className="bg-primary text-white text-[10px] font-bold px-2 py-1 rounded disabled:opacity-50">{sending ? '…' : 'Confirmar'}</button>
                                    <button onClick={() => { setClaimingId(null); setClaimNote(''); }} className="text-[10px] text-primary/50 px-1">×</button>
                                  </div>
                                ) : (
                                  <button onClick={() => { setClaimingId(p.id); setClaimNote(''); }} className="text-[10px] font-bold text-primary border border-primary/20 rounded-full px-2 py-0.5 hover:bg-primary hover:text-white transition mt-1">Ya he pagado</button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {receipts[p.id] ? (
                              <button onClick={() => void viewReceipt(receipts[p.id].html, receipts[p.id].no_seq)} className="inline-flex items-center gap-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-black transition">
                                <span className="material-symbols-outlined text-sm">download</span>Recibí
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
                          <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">{fmt(total, u.currency)}</td>
                          <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">{fmt(tRecv, u.currency)}</td>
                          <td className="px-4 py-3" />
                          <td className={`px-4 py-3 text-right whitespace-nowrap ${tBal > 0 ? 'text-red-600' : ''}`}>{fmt(tBal, u.currency)}</td>
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
    );
  }

  // ===== Variante LISTA (full, uso antiguo) =====
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-primary mb-1">Calendario de pagos</h2>
      <p className="text-xs text-primary/50 mb-4">Las fechas indican el día límite para que el importe esté <strong>recibido</strong> por Unreal Studio.</p>
      <div className="space-y-6">
        {shown.map((u) => {
          const pays = [...u.payments].sort(byDate);
          const total = pays.reduce((s, p) => s + Number(p.amount), 0);
          const recv = pays.filter((p) => p.received).reduce((s, p) => s + Number(p.amount), 0);
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
                            <div className="text-xs text-primary/60">{p.received && p.paid_at ? `Recibido el ${fmtDate(p.paid_at)}` : p.due_date ? `Fecha límite: ${fmtDate(p.due_date)}` : ''}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary">{fmt(Number(p.amount), p.currency)}</div>
                          <div className="text-xs text-primary/60">{p.received ? 'Recibido' : overdue ? 'Vencido' : 'Pendiente'}</div>
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
