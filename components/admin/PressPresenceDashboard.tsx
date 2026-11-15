import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

// Prensa y presencia online (solo admin). Lee pi_status.presence (fila 1), que calcula el daemon
// ~/jobs/estudio-prensa/presence_stats.py cada ~12 s a partir de PUBLICACIONES/TRACKER/SENT-LOG/… y press@.
type Cat = { label: string; count: number; week: number };
type P = Record<string, any>;
const CAT_COLORS: Record<string, string> = {
  prensa: 'bg-[#3F2305]', revistas: 'bg-[#7A4A1E]', portales: 'bg-[#A8743F]',
  directorios: 'bg-[#C99A6B]', blogs: 'bg-[#8C6B4F]', notas: 'bg-[#5C3A1A]',
};
const fmtDate = (d?: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—');
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

const Delta: React.FC<{ n?: number }> = ({ n }) => (n ? <span className="ml-2 align-middle text-xs font-black text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">+{n}</span> : null);

const Kpi: React.FC<{ label: string; value: React.ReactNode; week?: number; sub?: string; hero?: boolean }> = ({ label, value, week, sub, hero }) => (
  <div className={`rounded-2xl p-5 shadow-sm border ${hero ? 'bg-primary text-almond border-primary col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-between' : 'bg-white border-gray-100'}`}>
    <div className={`text-[11px] font-black uppercase tracking-widest ${hero ? 'text-almond/60' : 'text-primary/40'}`}>{label}</div>
    <div>
      <div className={`font-serif mt-1 ${hero ? 'text-6xl lg:text-7xl' : 'text-4xl text-primary'}`}>{value}<Delta n={week} /></div>
      {sub && <div className={`text-xs mt-1 ${hero ? 'text-almond/70' : 'text-primary/50'}`}>{sub}</div>}
    </div>
  </div>
);

const PressPresenceDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [d, setD] = useState<P | null>(null);
  const [err, setErr] = useState('');
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.from('pi_status').select('presence').eq('id', 1).maybeSingle();
      if (!alive) return;
      if (error) setErr(error.message); else if ((data as any)?.presence) { setD((data as any).presence); setErr(''); }
    };
    void load();
    const poll = setInterval(() => void load(), 1500);
    return () => { alive = false; clearInterval(poll); };
  }, []);
  useEffect(() => {
    const tick = setInterval(() => { if (d?.generated_at) setAgo(Math.round((Date.now() - new Date(d.generated_at).getTime()) / 1000)); }, 1000);
    return () => clearInterval(tick);
  }, [d?.generated_at]);

  if (!d) return <div className="text-primary/50 p-8">{err || t('admin.presence.loading', 'Cargando presencia…')}</div>;
  const cats = Object.entries((d.by_cat || {}) as Record<string, Cat>);
  const max = Math.max(1, ...cats.map(([, c]) => c.count));
  const pr = d.press || {};
  const paid = d.paid || {};
  const blog = d.own_blog || {};
  const bl = d.backlinks || {};
  // ago = segundos desde el último cambio real de cifras (el daemon solo escribe si cambian)
  const agoLabel = ago < 60 ? `${ago}s` : ago < 3600 ? `${Math.round(ago / 60)} min` : `${Math.round(ago / 3600)} h`;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-serif text-primary">{t('admin.presence.title', 'Prensa y presencia')}</h2>
          <div className="text-sm text-primary/50">{t('admin.presence.subtitle', 'Dónde aparece Unreal Studio Bali fuera de nuestra web')}</div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest bg-emerald-50 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />{t('admin.presence.live', 'En vivo')} · {t('admin.presence.changed', 'cambio hace')} {agoLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi hero label={t('admin.presence.pages', 'Páginas publicadas')} value={d.total_pages ?? 0} week={d.total_week}
          sub={t('admin.presence.pagesSub', 'URLs públicas únicas · +7 días')} />
        <Kpi label={t('admin.presence.emails', 'Emails de prensa')} value={pr.emails_sent ?? 0} week={pr.emails_week}
          sub={`${pr.outlets ?? 0} ${t('admin.presence.outlets', 'medios distintos')}`} />
        <Kpi label={t('admin.presence.replies', 'Respuestas de medios')} value={pr.replies_human ?? '—'}
          sub={`${pr.replies_auto ?? 0} ${t('admin.presence.auto', 'automáticas')} · ${pr.bounces ?? 0} ${t('admin.presence.bounces', 'rebotes')}`} />
        <Kpi label={t('admin.presence.accepted', 'Aceptadas')} value={pr.accepted ?? 0}
          sub={`${pr.in_review ?? 0} ${t('admin.presence.inReview', 'en revisión')}`} />
        <Kpi label={t('admin.presence.backlinks', 'Backlinks dofollow')} value={bl.dofollow_third ?? 0}
          sub={`${t('admin.presence.thirdParty', 'de terceros')} · +${bl.dofollow_own ?? 0} ${t('admin.presence.own', 'propios')}`} />
        <Kpi label={t('admin.presence.ownBlog', 'Blog en nuestra web')} value={blog.published ?? '—'} week={blog.week}
          sub={t('admin.presence.ownBlogSub', 'artículos publicados')} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-4">{t('admin.presence.byCat', 'Por categoría')}</div>
        <div className="space-y-3">
          {cats.map(([k, c]) => (
            <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] sm:grid-cols-[14rem_1fr_auto] items-center gap-3">
              <div className="text-sm font-bold text-primary truncate" title={c.label}>{t(`admin.presence.cat.${k}`, c.label)}</div>
              <div className="h-3 rounded-full bg-almond/60 overflow-hidden">
                <div className={`h-full rounded-full ${CAT_COLORS[k] || 'bg-primary'} transition-[width] duration-700`} style={{ width: `${c.count ? Math.max(3, (c.count / max) * 100) : 0}%` }} />
              </div>
              <div className="text-sm font-mono text-primary w-16 text-right">{c.count}{c.week ? <span className="text-emerald-700"> +{c.week}</span> : null}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm min-w-0">
          <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-3">{t('admin.presence.latest', 'Últimas publicaciones')}</div>
          <ol className="divide-y divide-gray-50">
            {(d.latest || []).map((p: any) => (
              <li key={p.url} className="py-2 flex items-start gap-3 min-w-0">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${CAT_COLORS[p.cat] || 'bg-primary'}`} />
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 group">
                  <div className="text-sm font-bold text-primary group-hover:underline truncate">{p.title || host(p.url)}</div>
                  <div className="text-xs text-primary/40 truncate">{host(p.url)} · {t(`admin.presence.cat.${p.cat}`, d.by_cat?.[p.cat]?.label || p.cat)}</div>
                </a>
                <span className="text-xs text-primary/50 shrink-0 tabular-nums">{fmtDate(p.date)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-3">{t('admin.presence.latestReplies', 'Últimas respuestas')}</div>
            {(pr.latest_replies || []).length === 0 && <div className="text-sm text-primary/40">—</div>}
            {(pr.latest_replies || []).map((r: any, i: number) => (
              <div key={i} className="py-1.5 border-b border-gray-50 last:border-0 min-w-0">
                <div className="text-sm font-bold text-primary truncate">{r.from} <span className="font-normal text-primary/40">· {r.domain}</span></div>
                <div className="text-xs text-primary/50 truncate">{r.subject}</div>
              </div>
            ))}
            {(pr.accepted_list || []).map((a: any, i: number) => (
              <div key={'a' + i} className="mt-2 text-xs rounded-xl bg-emerald-50 text-emerald-800 px-3 py-2">✓ {a.outlet}: {a.note}</div>
            ))}
          </div>

          <div className="bg-almond rounded-2xl p-5">
            <div className="text-[11px] font-black uppercase tracking-widest text-primary/50 mb-2">{t('admin.presence.paid', 'Prensa de pago')}</div>
            <div className="text-sm text-primary">
              <span className="font-serif text-2xl">{paid.purchased ?? 0}</span> {t('admin.presence.paidBought', 'contratadas')} · {paid.options_researched ?? 0} {t('admin.presence.paidOptions', 'opciones estudiadas')}
            </div>
            {(paid.actions || []).map((a: any, i: number) => (
              <div key={i} className="mt-2 text-xs text-primary/70"><span className="font-bold">{a.service}</span> · {a.status} · {fmtDate(a.date)}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PressPresenceDashboard;
