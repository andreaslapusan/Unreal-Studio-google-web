/**
 * ClientUnitsSection — "Tus unidades + seguimiento de pagos" para el portal Cliente.
 *
 * Movido desde el portal Inversores (que se fusiona en Cliente). Como el cliente
 * no tiene sesión Supabase Auth, los datos vienen del RPC SECURITY DEFINER
 * `client_get_units(p_client_id)`, que mapea el cliente a su inversor por email
 * y devuelve sus unidades + hitos de pago. Pensado para iterar: la lógica de
 * datos vive en el RPC; aquí solo se presenta.
 */
import React, { useEffect, useState } from 'react';
import { dateOnly } from '../lib/timezone';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { uiLocale } from '../lib/dateLocale';

interface ClientUnit {
  investor_unit_id: string;
  project_name: string | null;
  unit_name: string | null;
  price_paid: number | null;
  reservation_paid: boolean | null;
  full_paid: boolean | null;
  contract_signed_at: string | null;
  delivery_date: string | null;
  pct_progress: number | null;
  hero_image_url: string | null;
  walkthrough_url: string | null;
}

interface Milestone {
  label: string;
  done: boolean;
  value?: string;
}

const fmtEUR = (n: number | null | undefined) =>
  typeof n === 'number'
    ? new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as any).format(n)
    : '—';

const ClientUnitsSection: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { t } = useTranslation();
  const [units, setUnits] = useState<ClientUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    void (async () => {
      try {
        const { data } = await supabase.rpc('client_get_units', { p_client_id: clientId });
        setUnits(Array.isArray(data) ? (data as ClientUnit[]) : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  if (loading) return null;
  if (units.length === 0) return null; // sin unidades aún → no mostramos la sección

  return (
    <section className="mt-10">
      <h2 className="text-2xl md:text-3xl text-primary mb-6 tracking-[-0.02em] flex items-center gap-4"><span className="h-px w-10 bg-primary/30 shrink-0"></span>{t('inversoresDashboard.yourUnits')}</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {units.map((u) => {
          const milestones: Milestone[] = [
            { label: t('inversoresDashboard.labelReservation'), done: Boolean(u.reservation_paid) },
            { label: t('inversoresDashboard.labelFullPayment'), done: Boolean(u.full_paid) },
            {
              label: t('inversoresDashboard.labelContractSigned'),
              done: Boolean(u.contract_signed_at),
              value: u.contract_signed_at ? new Date(dateOnly(u.contract_signed_at)).toLocaleDateString(uiLocale()) : undefined,
            },
            { label: t('inversoresDashboard.labelDelivery'), done: false, value: u.delivery_date ? new Date(dateOnly(u.delivery_date)).toLocaleDateString(uiLocale()) : undefined },
          ];
          return (
            <article key={u.investor_unit_id} className="group bg-white rounded-3xl overflow-hidden border border-primary/8 shadow-[0_18px_44px_-28px_rgba(63,35,5,0.35)] hover:shadow-[0_28px_60px_-30px_rgba(63,35,5,0.45)] hover:-translate-y-0.5 transition-all duration-300">
              {u.hero_image_url && (
                <div className="overflow-hidden">
                  <img src={u.hero_image_url} alt={u.project_name ?? ''} className="w-full h-44 object-cover transition-transform duration-700 ease-out group-hover:scale-105" loading="lazy" />
                </div>
              )}
              <div className="p-6">
                <h3 className="font-serif text-xl md:text-2xl text-primary tracking-[-0.01em]">{u.project_name ?? t('inversoresDashboard.labelProject')}</h3>
                {u.unit_name && <p className="text-sm text-primary/55 mb-4">{u.unit_name}</p>}
                {typeof u.price_paid === 'number' && (
                  <div className="mb-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-0.5">{t('inversoresDashboard.labelPricePaid')}</p>
                    <p className="font-serif text-2xl text-primary">{fmtEUR(u.price_paid)}</p>
                  </div>
                )}

                {/* Seguimiento de pagos (hitos) */}
                <ul className="space-y-2 mb-4">
                  {milestones.map((m, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          m.done ? 'bg-green-600 text-white' : 'border-2 border-primary/20 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className={m.done ? 'text-primary font-medium' : 'text-primary/50'}>{m.label}</span>
                      {m.value && <span className="ml-auto text-primary/50 text-xs">{m.value}</span>}
                    </li>
                  ))}
                </ul>

                {typeof u.pct_progress === 'number' && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>{t('inversoresDashboard.constructionProgress')}</span>
                      <span className="font-bold">{u.pct_progress}%</span>
                    </div>
                    <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${u.pct_progress}%` }} />
                    </div>
                  </div>
                )}

                {u.walkthrough_url && (
                  <a
                    href={u.walkthrough_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-4 text-xs bg-white border border-primary text-primary px-3 py-2 rounded-full hover:bg-primary/5 transition"
                  >
                    {t('inversoresDashboard.walkthrough')}
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ClientUnitsSection;
