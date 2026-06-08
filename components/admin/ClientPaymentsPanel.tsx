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
import { supabase } from '../../lib/supabase';
import { renderKwitansiHtml, formatFigure } from '../../lib/kwitansi';

interface Payment {
  id: string;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  received: boolean;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  position: number;
}
interface Unit {
  client_project_id: string;
  project_name: string;
  unit_number: string | null;
  currency: string;
  payments: Payment[];
}
interface Props {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  adminUserId: string;
  onClose: () => void;
}

const emptyPayment = (cur: string): Partial<Payment> => ({
  label: '', amount: 0, currency: cur || 'IDR', due_date: null, paid_at: null,
  received: false, payment_method: '', reference: '', notes: '', position: 0,
});
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'IDR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${n}`; }
};

const ClientPaymentsPanel: React.FC<Props> = ({ clientId, clientName, clientEmail, adminUserId, onClose }) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ cp: string; cur: string; pay: Partial<Payment> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [kw, setKw] = useState<null | {
    cp: string; payId?: string; received_from: string; amount: number; currency: string;
    for_payment: string; place: string; date: string; sending: boolean;
  }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('admin_list_client_payments', { p_user_id: adminUserId, p_client_id: clientId });
    setUnits(data?.success ? (data.units || []) : []);
    setLoading(false);
  }, [adminUserId, clientId]);

  useEffect(() => { void load(); }, [load]);

  const savePayment = async () => {
    if (!editing) return;
    setSaving(true);
    const payload: any = { ...editing.pay, client_project_id: editing.cp };
    const { data, error } = await supabase.rpc('admin_save_client_payment', { p_user_id: adminUserId, p_payment: payload });
    setSaving(false);
    if (error || !data?.success) { alert('Error al guardar el pago.'); return; }
    setEditing(null);
    await load();
  };

  const deletePayment = async (id: string) => {
    if (!window.confirm('¿Eliminar este pago?')) return;
    await supabase.rpc('admin_delete_client_payment', { p_user_id: adminUserId, p_payment_id: id });
    await load();
  };

  const toggleReceived = async (p: Payment) => {
    await supabase.rpc('admin_save_client_payment', {
      p_user_id: adminUserId,
      p_payment: { id: p.id, client_project_id: '', received: !p.received, paid_at: !p.received ? (p.paid_at || todayISO()) : p.paid_at },
    });
    await load();
  };

  const openKwitansi = (u: Unit, p?: Payment) => {
    setKw({
      cp: u.client_project_id,
      payId: p?.id,
      received_from: clientName,
      amount: p?.amount ?? 0,
      currency: p?.currency ?? u.currency ?? 'IDR',
      for_payment: `${u.project_name}${u.unit_number ? ' · Unidad ' + u.unit_number : ''}${p?.label ? ' — ' + p.label : ''}`,
      place: 'Bali',
      date: p?.paid_at ? p.paid_at.slice(0, 10) : todayISO(),
      sending: false,
    });
  };

  const kwitansiHtml = (no: string | number) => kw && renderKwitansiHtml({
    no, receivedFrom: kw.received_from, amount: kw.amount, currency: kw.currency,
    forPayment: kw.for_payment, place: kw.place, date: kw.date,
    logoUrl: `${window.location.origin}/img/Logos/logo-06.png`,
  });

  const downloadKwitansi = () => {
    if (!kw) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Kwitansi</title></head><body style="margin:0;padding:24px;background:#fff">${kwitansiHtml('—')}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const createAndSend = async () => {
    if (!kw) return;
    if (!clientEmail) { alert('El cliente no tiene email. Añádelo antes de enviar.'); return; }
    setKw({ ...kw, sending: true });
    // 1) Create the kwitansi record (assigns the sequential No.)
    const html0 = kwitansiHtml('…') || '';
    const { data: created, error: cErr } = await supabase.rpc('admin_create_kwitansi', {
      p_user_id: adminUserId,
      p_kwitansi: {
        client_project_id: kw.cp, client_payment_id: kw.payId ?? '',
        received_from: kw.received_from, amount: String(kw.amount), currency: kw.currency,
        for_payment: kw.for_payment, place: kw.place, kwitansi_date: kw.date, html: html0,
      },
    });
    if (cErr || !created?.success) { setKw({ ...kw, sending: false }); alert('No se pudo crear el kwitansi.'); return; }
    const no = created.no_seq;
    const html = kwitansiHtml(no) || html0;
    // 2) Send it from hello@unrealstudiobali.com via the edge function
    const { data: sent, error: sErr } = await supabase.functions.invoke('send-client-email', {
      body: {
        adminUserId, to: clientEmail, kwitansiId: created.id,
        subject: `Kwitansi #${no} · Unreal Studio`,
        html: `<p style="font-family:Manrope,Arial,sans-serif;color:#3F2305">Hola ${clientName}, adjuntamos tu recibo de pago. ¡Gracias!</p>${html}`,
      },
    });
    setKw({ ...kw, sending: false });
    if (sErr || !sent?.success) {
      const msg = sent?.error === 'transport_not_configured'
        ? 'Kwitansi #' + no + ' creado, pero el buzón hello@ aún no tiene SMTP configurado. Avísale a Andreas para meter la contraseña.'
        : 'Kwitansi creado pero el envío falló: ' + (sent?.error || sErr?.message || 'error');
      alert(msg);
      setKw(null); await load();
      return;
    }
    alert(`Kwitansi #${no} enviado a ${clientEmail} ✅`);
    setKw(null); await load();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-3xl">
          <div>
            <h2 className="text-xl font-black text-primary">Pagos · {clientName}</h2>
            <p className="text-xs text-gray-400">{clientEmail || 'sin email'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
        </div>

        <div className="p-6 space-y-6">
          {loading && <p className="text-sm text-gray-400">Cargando…</p>}
          {!loading && units.length === 0 && <p className="text-sm text-gray-400 italic">Este cliente no tiene unidades asignadas todavía.</p>}

          {units.map((u) => {
            const total = u.payments.reduce((s, p) => s + Number(p.amount), 0);
            const recv = u.payments.filter((p) => p.received).reduce((s, p) => s + Number(p.amount), 0);
            return (
              <div key={u.client_project_id} className="border border-gray-100 rounded-2xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-primary">{u.project_name}{u.unit_number && <span className="text-gray-400 font-normal"> · {u.unit_number}</span>}</p>
                    <p className="text-[11px] text-gray-400">Recibido {fmt(recv, u.currency)} / {fmt(total, u.currency)}</p>
                  </div>
                  <button onClick={() => setEditing({ cp: u.client_project_id, cur: u.currency, pay: { ...emptyPayment(u.currency), position: u.payments.length } })}
                    className="bg-primary text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg flex items-center gap-1 hover:bg-black">
                    <span className="material-symbols-outlined text-xs">add</span> Pago
                  </button>
                </div>

                <div className="divide-y divide-gray-50">
                  {u.payments.length === 0 && <p className="px-5 py-4 text-xs text-gray-300 italic">Sin pagos. Añade el calendario.</p>}
                  {u.payments.map((p) => {
                    const overdue = !p.received && p.due_date && new Date(p.due_date) < new Date();
                    return (
                      <div key={p.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                        <button onClick={() => toggleReceived(p)} title="Marcar recibido"
                          className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition ${p.received ? 'bg-green-600 text-white' : overdue ? 'bg-red-100 text-red-500 hover:bg-green-600 hover:text-white' : 'border-2 border-gray-300 text-gray-300 hover:border-green-600 hover:text-green-600'}`}>✓</button>
                        <div className="flex-1 min-w-[140px]">
                          <p className="font-semibold text-sm text-primary">{p.label || '(sin etiqueta)'}</p>
                          <p className="text-[11px] text-gray-400">
                            {p.due_date ? `Límite: ${new Date(p.due_date).toLocaleDateString('es-ES')}` : 'sin fecha'}
                            {p.received && p.paid_at && ` · pagado ${new Date(p.paid_at).toLocaleDateString('es-ES')}`}
                          </p>
                        </div>
                        <span className="font-bold text-sm">{fmt(Number(p.amount), p.currency)}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${p.received ? 'bg-green-50 text-green-600' : overdue ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-600'}`}>
                          {p.received ? 'Recibido' : overdue ? 'Vencido' : 'Pendiente'}
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => openKwitansi(u, p)} title="Generar y enviar kwitansi"
                            className="p-1.5 text-primary bg-almond rounded-lg hover:brightness-95"><span className="material-symbols-outlined text-sm">receipt_long</span></button>
                          <button onClick={() => setEditing({ cp: u.client_project_id, cur: u.currency, pay: { ...p } })}
                            className="p-1.5 text-primary bg-gray-50 rounded-lg hover:bg-gray-100"><span className="material-symbols-outlined text-sm">edit</span></button>
                          <button onClick={() => deletePayment(p.id)}
                            className="p-1.5 text-red-500 bg-red-50 rounded-lg hover:bg-red-100"><span className="material-symbols-outlined text-sm">delete</span></button>
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
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-3">
            <h3 className="font-black text-primary">{editing.pay.id ? 'Editar pago' : 'Nuevo pago'}</h3>
            <input className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder="Etiqueta (ej. 2º plazo / Reserva)"
              value={editing.pay.label || ''} onChange={(e) => setEditing({ ...editing, pay: { ...editing.pay, label: e.target.value } })} />
            <div className="flex gap-2">
              <input type="number" className="flex-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder="Importe"
                value={editing.pay.amount || ''} onChange={(e) => setEditing({ ...editing, pay: { ...editing.pay, amount: Number(e.target.value) } })} />
              <select className="pl-3 pr-8 py-2 bg-gray-50 border rounded-lg text-sm" value={editing.pay.currency || 'IDR'}
                onChange={(e) => setEditing({ ...editing, pay: { ...editing.pay, currency: e.target.value } })}>
                <option>IDR</option><option>EUR</option><option>USD</option>
              </select>
            </div>
            <label className="block text-[10px] font-black uppercase text-gray-400">Fecha límite (recibir)</label>
            <input type="date" className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm"
              value={editing.pay.due_date || ''} onChange={(e) => setEditing({ ...editing, pay: { ...editing.pay, due_date: e.target.value } })} />
            <input className="w-full px-3 py-2 bg-gray-50 border rounded-lg text-sm" placeholder="Notas (opcional)"
              value={editing.pay.notes || ''} onChange={(e) => setEditing({ ...editing, pay: { ...editing.pay, notes: e.target.value } })} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-lg border text-sm font-bold text-gray-500">Cancelar</button>
              <button disabled={saving} onClick={savePayment} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Kwitansi preview + send */}
      {kw && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center overflow-y-auto py-6 px-4 z-[60]">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-primary">Kwitansi</h3>
              <button onClick={() => setKw(null)} className="text-gray-400 hover:text-primary"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <input className="px-3 py-2 bg-gray-50 border rounded-lg col-span-2" placeholder="Telah terima dari (recibido de)"
                value={kw.received_from} onChange={(e) => setKw({ ...kw, received_from: e.target.value })} />
              <input type="number" className="px-3 py-2 bg-gray-50 border rounded-lg" placeholder="Importe"
                value={kw.amount || ''} onChange={(e) => setKw({ ...kw, amount: Number(e.target.value) })} />
              <select className="pl-3 pr-8 py-2 bg-gray-50 border rounded-lg" value={kw.currency} onChange={(e) => setKw({ ...kw, currency: e.target.value })}>
                <option>IDR</option><option>EUR</option><option>USD</option>
              </select>
              <input className="px-3 py-2 bg-gray-50 border rounded-lg col-span-2" placeholder="Untuk pembayaran (concepto)"
                value={kw.for_payment} onChange={(e) => setKw({ ...kw, for_payment: e.target.value })} />
              <input className="px-3 py-2 bg-gray-50 border rounded-lg" placeholder="Lugar" value={kw.place} onChange={(e) => setKw({ ...kw, place: e.target.value })} />
              <input type="date" className="px-3 py-2 bg-gray-50 border rounded-lg" value={kw.date} onChange={(e) => setKw({ ...kw, date: e.target.value })} />
            </div>
            <div className="text-[11px] text-gray-400">Importe en cifras: <b>{formatFigure(kw.amount, kw.currency)}</b></div>
            <div className="border rounded-xl p-3 bg-gray-50 max-h-[40vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: kwitansiHtml('—') || '' }} />
            <div className="flex gap-2">
              <button onClick={downloadKwitansi} className="flex-1 py-2.5 rounded-lg border text-sm font-bold text-primary">Descargar / Imprimir</button>
              <button disabled={kw.sending} onClick={createAndSend} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">
                {kw.sending ? 'Enviando…' : 'Crear y enviar al cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPaymentsPanel;
