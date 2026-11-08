/** Novedades: avance de obra y actualizaciones de las fichas de los proyectos a la venta (solo lectura). */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { translateStatus } from '../../lib/statusI18n';
import { AgencyData, fmtDate, shortProjectName } from './useAgencyData';
import { card, Empty, ListRow, SectionTitle } from './ui';
import { reportHref } from '../../lib/reportFiles';

const validDate = (s: string | null | undefined) => !!s && !Number.isNaN(Date.parse(s));

export default function AgencyNews({ data }: { data: AgencyData }) {
  const { t } = useTranslation();
  const { projects, projectInfo } = data;

  const rows = projects.map((p) => ({ p, info: p.slug ? projectInfo[p.slug] : undefined }));
  const items = rows.flatMap(({ p, info }) => {
    const name = shortProjectName(p.name);
    const pct = info?.completion_percent ?? p.pct_progress ?? 0;
    const out: { id: string; at: string; icon: string; title: string; sub: string; extra?: string; url?: string | null }[] = [];
    if (info && validDate(info.construction_update_date)) {
      out.push({ id: `c-${p.id}`, at: info.construction_update_date as string, icon: 'construction', title: t('agencyPortal.news.construction'), sub: name, url: reportHref(info.construction_update_url) });
    }
    if (info?.updated_at) {
      out.push({ id: `u-${p.id}`, at: info.updated_at, icon: 'update', title: t('agencyPortal.news.updated'), sub: name, extra: t('agencyPortal.news.state', { status: translateStatus(info.status ?? '', t), pct }) });
    }
    return out;
  }).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.news')} sub={t('agencyPortal.news.sub')} />

      {projects.length > 0 && (
        <section className={card}>
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 mb-4">{t('agencyPortal.news.progress')}</h3>
          <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {rows.map(({ p, info }) => {
              const pct = Math.max(0, Math.min(100, info?.completion_percent ?? p.pct_progress ?? 0));
              return (
                <li key={p.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-primary truncate">{shortProjectName(p.name)}</span>
                    <span className={`text-xs font-bold ${pct === 100 ? 'text-green-700' : 'text-primary/60'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-600' : 'bg-primary/70'}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {items.length === 0 ? <Empty icon="update" text={t('agencyPortal.news.empty')} /> : (
        <div className={`${card} !p-0 overflow-hidden`}>
          <ul className="divide-y divide-gray-100">
            {items.map((it) => (
              <ListRow key={it.id} icon={it.icon} title={it.title} sub={it.sub} extra={it.extra} wrap
                right={<>
                  <span className="text-xs text-primary/40 whitespace-nowrap">{fmtDate(it.at)}</span>
                  {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary underline underline-offset-2 whitespace-nowrap">{t('agencyPortal.news.open')}</a>}
                </>}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
