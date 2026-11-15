/**
 * "+ Reserva / + Venta" de un cliente de agencia (plan item 14): unidad + precio + modo → RPC agency_lead_event,
 * que en una transacción marca el lead como ganado, la unidad reservada/vendida, crea la fila de comisión,
 * escribe lead_attributions, evita duplicados y (por trigger) avisa a la agencia por email.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Modal, Toast, inputCls, useErrText } from './agencyAdminUi';

interface Props { lead: any; kind: 'reservation' | 'sale'; onClose: () => void; onDone: () => void; toast: Toast }

export default function AgencyLeadEventModal({ lead, kind, onClose, onDone, toast }: Props) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [units, setUnits] = useState<any[]>([]);
  const [form, setForm] = useState({ unit: '', price: '', currency: 'EUR', mode: 'close' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let b = supabase.from('property_units').select('id, unit_name, property_id, price_publico, currency, reserved, sold, properties(name)').eq('sold', false).order('unit_name');
    if (lead.property_id) b = b.eq('property_id', lead.property_id);
    void b.then(({ data }) => setUnits(data ?? []));
  }, [lead.property_id]);

  const pickUnit = (id: string) => {
    const u = units.find((x) => x.id === id);
    setForm((f) => ({ ...f, unit: id, price: f.price || (u?.price_publico ? String(u.price_publico) : ''), currency: u?.currency || f.currency }));
  };

  const submit = async () => {
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) { toast(t('agencyFunnel.event.priceRequired'), false); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('agency_lead_event', { p_lead: lead.id, p_unit: form.unit || null, p_kind: kind, p_price: price, p_mode: form.mode, p_currency: form.currency });
    setBusy(false);
    const r = data as any;
    if (error || r?.status !== 'ok') { toast(errText(error ?? r?.status), false); return; }
    toast(t('agencyFunnel.event.ok', { pct: r.pct, amount: `${r.amount} ${form.currency}` }));
    onDone();
    onClose();
  };

  return (
    <Modal title={t(`agencyFunnel.event.title.${kind}`, { name: lead.client_name })} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">{t('agencyFunnel.event.unit')}
          <select value={form.unit} onChange={(e) => pickUnit(e.target.value)} className={inputCls}>
            <option value="">{t('agencyFunnel.event.noUnit')}</option>
            {units.map((u) => <option key={u.id} value={u.id}>{[u.properties?.name, u.unit_name, u.reserved ? t('agencyFunnel.event.reserved') : null].filter(Boolean).join(' · ')}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm font-medium col-span-2">{t('agencyFunnel.event.price')}
            <input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })} className={inputCls} />
          </label>
          <label className="block text-sm font-medium">{t('agencyFunnel.event.currency')}
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls}>
              {['EUR', 'USD', 'IDR'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">{t('agencyFunnel.event.mode')}
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className={inputCls}>
            <option value="close">{t('agencyFunnel.event.modeClose')}</option>
            <option value="referral">{t('agencyFunnel.event.modeReferral')}</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2 mt-5">
        <button type="button" disabled={busy} onClick={() => void submit()} className="flex-1 bg-primary text-white py-2 rounded-lg disabled:opacity-50">{t(`admin.agencyLeads.ev.${kind}`)}</button>
        <button type="button" onClick={onClose} className="flex-1 bg-white border border-primary/30 text-primary py-2 rounded-lg">{t('fix.apm.cancel')}</button>
      </div>
    </Modal>
  );
}
