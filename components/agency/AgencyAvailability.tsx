/** Disponibilidad: todo lo que está a la venta en la web, al precio de la web, con la comisión estimada de la agencia. */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappUrl } from '../../constants';
import { useCurrency } from '../../App';
import { AgencyData, availableUnits, groupUnits, projectPct, shortProjectName, unitPct } from './useAgencyData';
import { card, Empty, ListRow, SectionTitle, Stat } from './ui';

export default function AgencyAvailability({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { formatPrice, convert } = useCurrency();
  const { partner, projects, units } = data;
  const [project, setProject] = useState('all');
  const [sort, setSort] = useState<'commission' | 'price'>('commission');
  if (!partner) return null;

  // Una fila por grupo de unidades iguales; si la agencia no ve unidades (RLS), una fila por proyecto a la venta.
  const rows = projects.flatMap((p) => {
    const cur = (p.price_currency || 'EUR') as any;
    const price = Number(p.investor_price) || 0;
    const row = (key: string, n: number, reserved: boolean, pct: number) => {
      const com = (price * pct) / 100;
      return { key, p, cur, price, n, reserved, pct, com, comEUR: convert(com, cur, 'EUR'), priceEUR: price ? convert(price, cur, 'EUR') : Infinity };
    };
    const groups = groupUnits(availableUnits(p, units));
    return groups.length
      ? groups.map(({ u, n }) => row(u.id, n, !!u.reserved, unitPct(u, partner.id)))
      : [row(p.id, 0, false, projectPct(p, units, partner.id))];
  });
  const shown = rows.filter((r) => project === 'all' || r.p.id === project)
    .sort((a, b) => (sort === 'commission' ? b.comEUR - a.comEUR : a.priceEUR - b.priceEUR));
  const best = Math.max(0, ...rows.map((r) => r.comEUR));
  const nUnits = rows.reduce((s, r) => s + r.n, 0);

  return (
    <div className="animate-in fade-in duration-500">
      <SectionTitle title={t('agencyPortal.nav.availability')} sub={t('agencyPortal.availability.sub')} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat icon="home_work" label={t('agencyPortal.availability.units')} value={nUnits || '—'} />
        <Stat icon="apartment" label={t('agencyPortal.nav.projects')} value={projects.length} />
        <Stat icon="bookmark" label={t('agencyPortal.availability.reservedN')} value={rows.filter((r) => r.reserved).reduce((s, r) => s + r.n, 0)} />
        <Stat icon="payments" label={t('agencyPortal.availability.sortCommission')} value={formatPrice(best, 'EUR')} accent={best > 0} />
      </div>

      {rows.length === 0 ? <Empty icon="home_work" text={t('agencyPortal.availability.empty')} /> : (
        <>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 flex-1">
              {[{ id: 'all', name: t('agencyPortal.availability.allProjects') }, ...projects.map((p) => ({ id: p.id, name: shortProjectName(p.name) }))].map((p) => (
                <button key={p.id} onClick={() => setProject(p.id)}
                  className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold transition ${project === p.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-primary/70 hover:bg-gray-50'}`}>
                  {p.name}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'commission' | 'price')} className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-primary bg-white md:w-48">
              <option value="commission">{t('agencyPortal.availability.sortCommission')}</option>
              <option value="price">{t('agencyPortal.availability.sortPrice')}</option>
            </select>
          </div>

          <div className={`${card} !p-0 overflow-hidden`}>
            <ul className="divide-y divide-gray-100">
              {shown.map(({ key, p, cur, price, n, reserved, pct, com }) => {
                const pName = shortProjectName(p.name);
                const uName = [pName, p.bedrooms ? t('agencyPortal.projects.bedrooms', { count: p.bedrooms }) : null].filter(Boolean).join(' · ');
                return (
                  <ListRow key={key}
                    title={<>{uName}{reserved && <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-amber-600">{t('agencyPortal.projects.reserved')}</span>}</>}
                    sub={n ? t('agencyPortal.projects.availableN', { count: n }) : t('agencyPortal.projects.onSale')}
                    extra={<>
                      {/* Mismo precio y formato que la tarjeta de la web ("Desde 90.000 €") */}
                      {price ? `${t('projects.card.from')} ${formatPrice(price, cur)} · ` : ''}
                      <a href={whatsappUrl(t('agencyPortal.availability.waUnit', { agency: partner.agency_name, unit: uName, project: pName }))} target="_blank" rel="noopener noreferrer" className="font-bold text-primary/70 underline underline-offset-2">{t('agencyPortal.availability.ask')}</a>
                    </>}
                    right={<><span className="text-sm font-bold text-green-700 whitespace-nowrap">{com ? formatPrice(com, cur) : '—'}</span><span className="text-xs text-primary/40 whitespace-nowrap">{pct}%</span></>}
                  />
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
