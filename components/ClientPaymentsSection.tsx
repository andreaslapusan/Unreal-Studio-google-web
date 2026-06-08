/**
 * ClientPaymentsSection — read-only payment calendar shown in the client portal.
 *
 * Data comes from the SECURITY DEFINER RPC client_get_payments(p_client_id)
 * (no Supabase Auth session for clients). Mirrors PaymentTimeline's visual
 * language but reads the new client_payments table and frames each due_date as
 * the deadline for Unreal Studio to RECEIVE the funds (not the send date).
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Payment {
  id: string; label: string; amount: number; currency: string;
  due_date: string | null; paid_at: string | null; received: boolean; position: number;
}
interface Unit { client_project_id: string; project_name: string; unit_number: string | null; currency: string; payments: Payment[]; }

const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'IDR', maximumFractionDigits: 0 }).format(n); }
  catch { return `${c} ${n}`; }
};
const fmtDate = (s: string | null) => {
  if (!s) return null;
  try { return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return s; }
};

const ClientPaymentsSection: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  // "Ya he pagado": id del pago que se está avisando, nota opcional y avisados.
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    void (async () => {
      try {
        const { data } = await supabase.rpc('client_get_payments', { p_client_id: clientId });
        setUnits(data?.success ? (data.units || []) : []);
      } finally { setLoading(false); }
    })();
  }, [clientId]);

  const submitClaim = async (paymentId: string) => {
    setSending(true);
    try {
      await supabase.rpc('client_claim_payment', { p_client_id: clientId, p_payment_id: paymentId, p_note: claimNote.trim() || null });
      setClaimedIds((prev) => new Set(prev).add(paymentId));
      setClaimingId(null);
      setClaimNote('');
    } finally { setSending(false); }
  };

  if (loading || units.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-primary mb-1">Calendario de pagos</h2>
      <p className="text-xs text-primary/50 mb-4">Las fechas indican el día límite para que el importe esté <strong>recibido</strong> por Unreal Studio. Inicia las transferencias con margen.</p>

      <div className="space-y-6">
        {units.map((u) => {
          const total = u.payments.reduce((s, p) => s + Number(p.amount), 0);
          const recv = u.payments.filter((p) => p.received).reduce((s, p) => s + Number(p.amount), 0);
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
                {u.payments.map((p) => {
                  const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                  const claimed = claimedIds.has(p.id);
                  return (
                    <li key={p.id} className={`rounded-lg p-3 text-sm ${p.received ? 'bg-green-50 border border-green-200' : overdue ? 'bg-red-50 border border-red-200' : 'bg-almond/40 border border-primary/10'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl">{p.received ? '✅' : overdue ? '⚠️' : '⏳'}</span>
                          <div className="min-w-0">
                            <div className="font-medium truncate text-primary">{p.label}</div>
                            <div className="text-xs text-primary/60">
                              {p.received && p.paid_at ? `Recibido el ${fmtDate(p.paid_at)}` : p.due_date ? `Fecha límite: ${fmtDate(p.due_date)}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-primary">{fmt(Number(p.amount), p.currency)}</div>
                          <div className="text-xs text-primary/60">{p.received ? 'Recibido' : overdue ? 'Vencido' : 'Pendiente'}</div>
                        </div>
                      </div>
                      {/* Botón "Ya he pagado" para pagos aún no recibidos */}
                      {!p.received && (
                        <div className="mt-2 pl-9">
                          {claimed ? (
                            <span className="text-xs font-bold text-green-700">✓ Aviso enviado. Lo verificaremos y te confirmaremos.</span>
                          ) : claimingId === p.id ? (
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                              <input
                                type="text"
                                value={claimNote}
                                onChange={(e) => setClaimNote(e.target.value)}
                                placeholder="Referencia / nota (opcional)"
                                className="flex-1 rounded-lg border border-primary/15 px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-primary"
                              />
                              <div className="flex gap-2">
                                <button onClick={() => void submitClaim(p.id)} disabled={sending}
                                  className="bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50">
                                  {sending ? 'Enviando…' : 'Confirmar aviso'}
                                </button>
                                <button onClick={() => { setClaimingId(null); setClaimNote(''); }} className="text-xs text-primary/50 px-2">Cancelar</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => { setClaimingId(p.id); setClaimNote(''); }}
                              className="text-xs font-bold text-primary border border-primary/20 rounded-full px-3 py-1.5 hover:bg-primary hover:text-white transition">
                              Ya he pagado
                            </button>
                          )}
                        </div>
                      )}
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
