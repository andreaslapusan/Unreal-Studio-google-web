/**
 * Comisiones: libro real (agency_commissions, lo escribe el equipo con + Reserva / + Venta)
 * + estimación del pipeline (precio de la web × % de la agencia) + potencial del inventario.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../App';
import { AgencyData, AgencyLead, fmtDate, partnerPct, potentialEUR, projectCommission } from './useAgencyData';
import { card, Empty, ListRow, SectionTitle, Stat, StatusPill } from './ui';

export default function AgencyCommissions({ data, go }: { data: AgencyData; go: (v: string) => void }) {
  const { t } = useTranslation();
  const { formatPrice, convert } = useCurrency();
  const { partner, leads, units, projects, commissions } = data;
  if (!partner) return null;

  // Comisión estimada del proyecto del cliente: precio de la web × % (no sabemos la unidad exacta).
  const est = (l: AgencyLead) => { const p = projects.find((x) => x.id === l.property_id); return p?.investor_price ? { v: projectCommission(p, units, partnerPct(partner)), cur: (p.price_currency || 'EUR') as any } : null; };
  const live = commissions.filter((c) => c.status !== 'cancelled');
  const ledgerEUR = (st: string[]) => live.filter((c) => st.includes(c.status)).reduce((s, c) => s + convert(Number(c.amount), c.currency as any, 'EUR'), 0);
  const leadName = (id: string) => leads.find((l) => l.id === id)?.client_name ?? '—';
  const unitName = (id: string | null) => units.find((u) => u.id === id)?.unit_name;
  const won = leads.filter((l) => l.status === 'won' && !live.some((c) => c.lead_id === l.id));
  const open = leads.filter((l) => l.status === 'new' || l.status === 'contacted');
  const sumEUR = (ls: AgencyLead[]) => ls.reduce((s, l) => { const e = est(l); return s + (e ? convert(e.v, e.cur, 'EUR') : 0); }, 0);
  const inventory = potentialEUR(data, partnerPct(partner), convert);
  const projectName = (id: string | null) => data.nameOf(id) ?? t('agencyPortal.commissions.noProject');

  const List = ({ items }: { items: AgencyLead[] }) => (
    <div className={`${card} !p-0 overflow-hidden`}>
      <ul className="divide-y divide-gray-100">
        {items.map((l) => (
          <ListRow key={l.id}
            title={l.client_name}
            sub={projectName(l.property_id)}
            extra={fmtDate(l.created_at)}
            right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{(() => { const e = est(l); return e ? formatPrice(e.v, e.cur) : '—'; })()}</span><StatusPill status={l.status} label={t(`agenciasDashboard.leads.status.${l.status}`)} /></>}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-8">
      <SectionTitle title={t('agencyPortal.nav.commissions')} sub={t('agencyPortal.commissions.sub')} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon="bookmark_added" label={t('agencyFunnel.comm.reserved')} value={formatPrice(ledgerEUR(['reserved']), 'EUR')} />
        <Stat icon="request_quote" label={t('agencyFunnel.comm.due')} value={formatPrice(ledgerEUR(['due']), 'EUR')} accent={ledgerEUR(['due']) > 0} />
        <Stat icon="paid" label={t('agencyFunnel.comm.paid')} value={formatPrice(ledgerEUR(['paid']), 'EUR')} />
      </div>

      <section>
        <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-3">{t('agencyFunnel.comm.ledgerTitle')}</h3>
        {live.length ? (
          <div className={`${card} !p-0 overflow-hidden`}>
            <ul className="divide-y divide-gray-100">
              {live.map((c) => (
                <ListRow key={c.id}
                  title={leadName(c.lead_id)}
                  sub={[t(`agencyFunnel.comm.kind.${c.kind}`), data.nameOf(c.property_id), unitName(c.unit_id)].filter(Boolean).join(' · ')}
                  extra={`${formatPrice(Number(c.sale_price), c.currency as any)} × ${Number(c.pct)}% · ${fmtDate(c.created_at)}`}
                  right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{formatPrice(Number(c.amount), c.currency as any)}</span><StatusPill status={c.status === 'paid' ? 'won' : c.status === 'due' ? 'contacted' : 'new'} label={t(`agencyFunnel.comm.st.${c.status}`)} /></>}
                />
              ))}
            </ul>
          </div>
        ) : <Empty icon="payments" text={t('agencyFunnel.comm.ledgerEmpty')} />}
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon="emoji_events" label={t('agencyPortal.commissions.wonEst')} value={formatPrice(sumEUR(won), 'EUR')} accent={won.length > 0} />
        <Stat icon="pending_actions" label={t('agencyPortal.commissions.pipelineEst')} value={formatPrice(sumEUR(open), 'EUR')} />
        <Stat icon="inventory_2" label={t('agencyPortal.kpi.potential')} value={formatPrice(inventory, 'EUR')} onClick={() => go('projects')} />
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
