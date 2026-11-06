/** Estadísticas del link de la agencia (antes /agencias/stats): eventos atribuidos, top proyectos, actividad. */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { langPath } from '../LocaleRoute';
import { uiLocale } from '../../lib/dateLocale';
import { AgencyData } from './useAgencyData';
import { card, SectionTitle, Stat } from './ui';

export default function AgencyStats({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const rows = data.events;
  const n = (type: string) => rows.filter((r) => r.event_type === type).length;
  const visits = n('visit');
  const formSubmits = n('form_submit');
  const conversionRate = visits > 0 ? Math.round((formSubmits / visits) * 100) : 0;

  const counts = new Map<string, number>();
  rows.forEach((r) => { if (r.property_slug) counts.set(r.property_slug, (counts.get(r.property_slug) ?? 0) + 1); });
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] ?? 1;
  const nameOf = (slug: string) => data.nameOf(slug) ?? slug;

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.stats')} sub={t('agencyPortal.stats.sub')} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat icon="visibility" label={t('agenciasStats.kpiVisits')} value={visits} />
        <Stat icon="edit_note" label={t('agenciasStats.kpiSubmissions')} value={formSubmits} />
        <Stat icon="bookmark" label={t('agenciasStats.kpiReservations')} value={n('reservation')} />
        <Stat icon="handshake" label={t('agenciasStats.kpiSales')} value={n('sale')} accent={n('sale') > 0} />
        <div className="col-span-2 lg:col-span-1"><Stat icon="percent" label={t('agenciasStats.kpiConversion')} value={`${conversionRate}%`} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agenciasStats.topTitle')}</h3>
          {top.length === 0 && <p className="text-primary/50 text-sm">{t('agenciasStats.topEmpty')}</p>}
          <ul className="space-y-3">
            {top.map(([slug, count]) => (
              <li key={slug}>
                <div className="flex items-center justify-between text-sm gap-3">
                  <Link to={langPath(`/proyecto/${slug}`)} target="_blank" className="font-medium text-primary hover:underline truncate">{nameOf(slug)}</Link>
                  <span className="text-primary/50 text-xs whitespace-nowrap">{count} {t('agenciasStats.events')}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agenciasStats.recentTitle')}</h3>
          {rows.length === 0 && <p className="text-primary/50 text-sm">{t('agenciasStats.recentEmpty')}</p>}
          <ul className="divide-y divide-gray-100 text-sm">
            {rows.slice(0, 25).map((r) => (
              <li key={r.id} className="py-2.5 flex items-center gap-3">
                <span className="text-xs text-primary/50 w-24 shrink-0">{new Date(r.created_at).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-medium text-primary shrink-0">{t(`agenciasStats.eventType.${r.event_type}`, { defaultValue: r.event_type })}</span>
                <span className="text-primary/60 truncate flex-1 text-right">{r.property_slug ? nameOf(r.property_slug) : t('agencyPortal.stats.catalog')}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
