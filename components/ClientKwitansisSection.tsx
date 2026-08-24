/**
 * ClientKwitansisSection — recibos (kwitansis) del cliente en su portal.
 *
 * Solo aparecen los que el admin YA ha generado (existir = generado). El HTML
 * del recibo se guarda en la tabla `kwitansis`; aquí se lista y se puede ver /
 * descargar. Datos por la RPC `client_get_kwitansis()` (resuelve el cliente por
 * la sesión Supabase Auth).
 */
import React, { useEffect, useState } from 'react';
import { dateOnly } from '../lib/timezone';
import DOMPurify from 'dompurify';
import { uiLocale } from '../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface Kwitansi {
  id: string; no_seq: number; for_payment: string; amount: number;
  currency: string; kwitansi_date: string; html: string; drive_url: string | null;
}

const fmt = (n: number, c: string) => {
  try { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: c || 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n); }
  catch { return `${c} ${n}`; }
};

const ClientKwitansisSection: React.FC<{ clientId: string; embedded?: boolean }> = ({ embedded }) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Kwitansi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc('client_get_kwitansis');
      setRows(data?.success ? (data.kwitansis || []) : []);
      setLoading(false);
    })();
  }, []);

  const view = (k: Kwitansi) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const title = t('fix.kwit.receiptTitle', { no: k.no_seq, defaultValue: 'Recibo Nº {{no}}' });
    w.document.write(`<html><head><title>${title}</title></head><body style="margin:0;padding:24px;background:#fff">${DOMPurify.sanitize(k.html)}</body></html>`);
    w.document.close();
  };

  if (loading || rows.length === 0) return null;

  return (
    <section className={embedded ? 'mt-8 pt-6 border-t border-gray-100' : 'mt-10'}>
      <h2 className={embedded ? 'text-[10px] font-black uppercase tracking-widest text-primary/40 mb-3' : 'font-serif text-2xl text-primary mb-4'}>{t('admin.clientDash.receiptsTitle', 'Recibos de pago generados')}</h2>
      <div className="space-y-3">
        {rows.map((k) => (
          <div key={k.id} className="bg-white rounded-2xl p-4 border border-primary/5 shadow-sm flex items-center gap-4">
            <span className="material-symbols-outlined text-primary text-2xl">receipt_long</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-primary truncate">{k.for_payment}</p>
              <p className="text-[11px] text-primary/50">{new Date(dateOnly(k.kwitansi_date)).toLocaleDateString(uiLocale())} · {fmt(Number(k.amount), k.currency)}</p>
            </div>
            <button onClick={() => view(k)} className="shrink-0 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-lg hover:bg-black transition flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">download</span>{t('admin.clientDash.receiptsView', 'Ver / Descargar')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ClientKwitansisSection;
