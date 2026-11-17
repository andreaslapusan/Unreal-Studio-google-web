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

  // Visitas a su enlace (lead_attributions event_type='visit'): total, últimos 30 días y por proyecto (sin proyecto = catálogo)
  const visitRows = rows.filter((r) => r.event_type === 'visit');
  const since30 = Date.now() - 30 * 24 * 3600 * 1000;
  const visits30 = visitRows.filter((r) => Date.parse(r.created_at) >= since30).length;
  const counts = new Map<string, number>();
  visitRows.forEach((r) => { const k = r.property_slug || ''; counts.set(k, (counts.get(k) ?? 0) + 1); });
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = top[0]?.[1] ?? 1;
  const nameOf = (slug: string) => (slug ? data.nameOf(slug) ?? slug : t('agencyPortal.stats.catalog'));

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
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-1">{t('agencyPortal.stats.visitsTitle')}</h3>
          <p className="text-sm text-primary/70 mb-4" data-link-visits>{t('agencyPortal.stats.visitsLine', { total: visits, d30: visits30 })}</p>
          {top.length === 0 && <p className="text-primary/50 text-sm">{t('agenciasStats.topEmpty')}</p>}
          <ul className="space-y-3">
            {top.map(([slug, count]) => (
              <li key={slug || 'catalog'}>
                <div className="flex items-center justify-between text-sm gap-3">
                  {slug ? <Link to={langPath(`/proyecto/${slug}`)} target="_blank" className="font-medium text-primary hover:underline truncate">{nameOf(slug)}</Link> : <span className="font-medium text-primary truncate">{nameOf(slug)}</span>}
                  <span className="text-primary/50 text-xs whitespace-nowrap">{t('agencyPortal.stats.visitsN', { count })}</span>
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
