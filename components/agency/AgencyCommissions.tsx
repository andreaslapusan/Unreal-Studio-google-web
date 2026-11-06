/**
 * Comisiones: estimación por cliente ganado / en curso a partir de las unidades del proyecto
 * de interés (precio agencia × % de la agencia) + comisión potencial del inventario disponible.
 * shortcut: no hay tabla de comisiones pagadas; cuando exista, añadir aquí el estado de pago.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { AgencyData, AgencyLead, shortProjectName, fmtDate, fmtEUR, isUnitAvailable, unitCommission } from './useAgencyData';
import { card, Empty, ListRow, SectionTitle, Stat, StatusPill } from './ui';

export default function AgencyCommissions({ data, go }: { data: AgencyData; go: (v: string) => void }) {
  const { t } = useTranslation();
  const { partner, leads, units, projects } = data;
  if (!partner) return null;

  // Rango de comisión del proyecto del cliente (no sabemos la unidad exacta).
  const range = (l: AgencyLead): [number, number] | null => {
    const vals = units.filter((u) => u.property_id === l.property_id && u.price_agencia).map((u) => unitCommission(u, partner.id));
    return vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
  };
  const fmtRange = (r: [number, number] | null) => (!r ? '—' : r[0] === r[1] ? fmtEUR(r[0]) : `${fmtEUR(r[0])} – ${fmtEUR(r[1])}`);
  const won = leads.filter((l) => l.status === 'won');
  const open = leads.filter((l) => l.status === 'new' || l.status === 'contacted');
  const sumMin = (ls: AgencyLead[]) => ls.reduce((s, l) => s + (range(l)?.[0] ?? 0), 0);
  const inventory = units.filter(isUnitAvailable).reduce((s, u) => s + unitCommission(u, partner.id), 0);
  const projectName = (id: string | null) => { const n = projects.find((p) => p.id === id)?.name; return n ? shortProjectName(n) : t('agencyPortal.commissions.noProject'); };

  const List = ({ items }: { items: AgencyLead[] }) => (
    <div className={`${card} !p-0 overflow-hidden`}>
      <ul className="divide-y divide-gray-100">
        {items.map((l) => (
          <ListRow key={l.id}
            title={l.client_name}
            sub={projectName(l.property_id)}
            extra={fmtDate(l.created_at)}
            right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{fmtRange(range(l))}</span><StatusPill status={l.status} label={t(`agenciasDashboard.leads.status.${l.status}`)} /></>}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <SectionTitle title={t('agencyPortal.nav.commissions')} sub={t('agencyPortal.commissions.sub')} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon="emoji_events" label={t('agencyPortal.commissions.wonEst')} value={fmtEUR(sumMin(won))} accent={won.length > 0} />
        <Stat icon="pending_actions" label={t('agencyPortal.commissions.pipelineEst')} value={fmtEUR(sumMin(open))} />
        <Stat icon="inventory_2" label={t('agencyPortal.kpi.potential')} value={fmtEUR(inventory)} onClick={() => go('projects')} />
      </div>

      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.commissions.wonTitle')}</h3>
        {won.length ? <List items={won} /> : <Empty icon="emoji_events" text={t('agencyPortal.commissions.wonEmpty')} />}
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyPortal.commissions.pipelineTitle')}</h3>
        {open.length ? <List items={open} /> : <Empty icon="group" text={t('agencyPortal.commissions.pipelineEmpty')} />}
      </section>

      <p className="text-xs text-primary/50 leading-relaxed">{t('agencyPortal.commissions.disclaimer')}</p>
    </div>
  );
}
