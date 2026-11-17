import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

// Emails (QuickMail propio) — solo admin. Lee outreach_status.data (fila 1, RLS is_admin()), que escribe el daemon
// ~/jobs/outreach-engine/outreach_stats.py cada ~12 s (solo si cambia) a partir de outreach.db, SENT-LOG y QuickMail.
type O = Record<string, any>;
const num = (n?: number | null) => (n === null || n === undefined ? '—' : n.toLocaleString('es-ES'));
const when = (ts?: string | null) => (ts ? new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const LABEL_CLS: Record<string, string> = {
  interested: 'bg-emerald-50 text-emerald-700', question: 'bg-emerald-50 text-emerald-700', not_interested: 'bg-gray-100 text-gray-600',
  bounce: 'bg-red-50 text-red-700', unsubscribe_angry: 'bg-red-50 text-red-700', ooo: 'bg-amber-50 text-amber-700',
  wrong_person: 'bg-gray-100 text-gray-600', low_confidence: 'bg-amber-50 text-amber-700', pending: 'bg-almond text-primary/70',
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: string; hero?: boolean }> = ({ label, value, sub, hero }) => (
  <div className={`rounded-2xl p-5 shadow-sm border min-w-0 ${hero ? 'bg-primary text-almond border-primary col-span-2 lg:col-span-1 lg:row-span-2 flex flex-col justify-between' : 'bg-white border-gray-100'}`}>
    <div className={`text-[11px] font-black uppercase tracking-widest ${hero ? 'text-almond/60' : 'text-primary/40'}`}>{label}</div>
    <div>
      <div className={`font-serif mt-1 ${hero ? 'text-6xl lg:text-7xl' : 'text-4xl text-primary'}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${hero ? 'text-almond/70' : 'text-primary/50'}`}>{sub}</div>}
    </div>
  </div>
);

const Pill: React.FC<{ on: boolean; label: string; state: string }> = ({ on, label, state }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
    <span className={`w-2 h-2 rounded-full ${on ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />{label}: {state}
  </div>
);

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-gray-100 p-5 shadow-sm min-w-0 ${className}`}>
    <div className="text-[11px] font-black uppercase tracking-widest text-primary/40 mb-3">{title}</div>
    {children}
  </div>
);

const OutreachDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [d, setD] = useState<O | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<any>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.from('outreach_status').select('data').eq('id', 1).maybeSingle();
      if (!alive) return;
      if (error) setErr(error.message); else if ((data as any)?.data) { setD((data as any).data); setErr(''); }
    };
    void load();
    const poll = setInterval(() => void load(), 2000);
    return () => { alive = false; clearInterval(poll); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!d) return <div className="text-primary/50 p-8">{err || t('admin.outreach.loading', 'Cargando emails…')}</div>;
  const tot = d.totals || {};
  const eng = d.engine || {};
  const lab = (k: string) => t(`admin.outreach.label.${k}`, k);
  const st = (live: boolean) => (live ? t('admin.outreach.live', 'en vivo') : t('admin.outreach.paused', 'pausado'));
  const replies = (d.replies || []).filter((r: any) => filter === 'all' || (filter === 'positive' ? ['interested', 'question'].includes(r.label) : r.campaign === filter));
  const since = tot.sent_7d_since ? ` · ${t('admin.outreach.since', 'desde')} ${when(tot.sent_7d_since)}` : '';

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h2 className="text-3xl font-serif text-primary">{t('admin.outreach.title', 'Emails (QuickMail propio)')}</h2>
          <div className="text-sm text-primary/50">{t('admin.outreach.subtitle', 'Campañas a agencias: envíos, respuestas y estado del motor')} · {t('admin.outreach.updated', 'actualizado')} {when(d.generated_at)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill on={eng.quickmail === 'live'} label="QuickMail" state={st(eng.quickmail === 'live')} />
          <Pill on={eng.reply_bot === 'live'} label={t('admin.outreach.replyBot', 'Bot respuestas')} state={st(eng.reply_bot === 'live')} />
          <Pill on={eng.sequencer === 'live'} label={t('admin.outreach.sequencer', 'Secuenciador')} state={eng.sequencer === 'live' ? st(true) : t('admin.outreach.dry', 'simulación')} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi hero label={t('admin.outreach.sentTotal', 'Emails enviados')} value={num(tot.sent_total)}
          sub={`${num(tot.sent_today)} ${t('admin.outreach.today', 'hoy')} · ${num(tot.sent_7d)} ${t('admin.outreach.week', '7 días')}${since}`} />
        <Kpi label={t('admin.outreach.contacts', 'Contactos')} value={num(tot.contacts)} sub={t('admin.outreach.contactsSub', 'agencias en las listas')} />
        <Kpi label={t('admin.outreach.replies', 'Respuestas')} value={num(tot.replies)} sub={`${num(tot.positive)} ${t('admin.outreach.positive', 'positivas')}`} />
        <Kpi label={t('admin.outreach.bounces', 'Rebotes')} value={num(tot.bounces)} />
        <Kpi label={t('admin.outreach.deliverability', 'Entregabilidad')} value={tot.deliverability == null ? '—' : `${tot.deliverability} %`} sub={t('admin.outreach.deliverabilitySub', '(enviados − rebotes) / enviados')} />
        <Kpi label={t('admin.outreach.sentToday', 'Enviados hoy')} value={num(tot.sent_today)} sub={t('admin.outreach.sentTodaySub', 'hora de Madrid')} />
        <Kpi label={t('admin.outreach.positive', 'positivas')} value={num(tot.positive)} sub={t('admin.outreach.positiveSub', 'interesados + preguntas')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(d.campaigns || []).map((c: any) => (
          <Card key={c.key} title={`${c.via} · ${st(!c.paused)}`}>
            <div className="font-serif text-xl text-primary break-words">{c.name}</div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              {[['sent_total', t('admin.outreach.sent', 'Enviados')], ['replies', t('admin.outreach.replies', 'Respuestas')], ['bounces', t('admin.outreach.bounces', 'Rebotes')]].map(([k, l]) => (
                <div key={k} className="bg-almond/50 rounded-xl py-2 min-w-0"><div className="font-serif text-2xl text-primary">{num(c[k])}</div><div className="text-[10px] font-black uppercase tracking-widest text-primary/50 truncate px-1">{l}</div></div>
              ))}
            </div>
            <div className="text-xs text-primary/60 mt-3">
              {num(c.leads?.total)} {t('admin.outreach.leads', 'contactos')} · {num(c.leads?.available)} {t('admin.outreach.pending', 'sin contactar')} · {num(c.sent_today)} {t('admin.outreach.today', 'hoy')} · {num(c.positive)} {t('admin.outreach.positive', 'positivas')}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] font-black uppercase tracking-widest text-primary/40 text-left">
                  <th className="py-1 pr-2">#</th><th className="py-1 pr-2">{t('admin.outreach.subject', 'Asunto')}</th>
                  <th className="py-1 pr-2 text-right">{t('admin.outreach.delivered', 'Entreg.')}</th><th className="py-1 pr-2 text-right">{t('admin.outreach.repliesShort', 'Resp.')}</th><th className="py-1 text-right">{t('admin.outreach.bouncesShort', 'Reb.')}</th>
                </tr></thead>
                <tbody>{(c.steps || []).map((s: any) => (
                  <tr key={s.step} className="border-t border-gray-50">
                    <td className="py-1.5 pr-2 font-bold text-primary">{s.step}</td>
                    <td className="py-1.5 pr-2 text-primary/70 max-w-0 w-full"><div className="truncate" title={s.subject}>{s.subject}</div>{s.wait_days ? <div className="text-[11px] text-primary/40">+{s.wait_days} {t('admin.outreach.days', 'días háb.')}</div> : null}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{num(s.delivered)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{num(s.replies)}</td><td className="py-1.5 text-right tabular-nums">{num(s.bounces)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            {(c.lists || []).map((l: any) => (
              <div key={l.name} className="text-xs text-primary/60 mt-1">{l.name}: {num(l.sent)} / {num(l.targets)} {t('admin.outreach.sent', 'Enviados').toLowerCase()}</div>
            ))}
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title={t('admin.outreach.inbox', 'Bandeja de respuestas')} className="lg:col-span-2">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[['all', t('admin.outreach.all', 'Todas')], ['positive', t('admin.outreach.positive', 'positivas')], ['es', t('admin.outreach.spain', 'España')], ['world', t('admin.outreach.world', 'Internacional')]].map(([k, l]) => (
              <button type="button" key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-full text-xs font-bold transition ${filter === k ? 'bg-primary text-white' : 'bg-almond/60 text-primary/70 hover:bg-almond'}`}>{l}</button>
            ))}
          </div>
          {replies.length === 0 && <div className="text-sm text-primary/40">—</div>}
          {replies.map((r: any) => (
            <button type="button" key={r.id} onClick={() => setOpen(r)} className="flex w-full items-start gap-3 text-left py-2 border-b border-gray-50 last:border-0 min-w-0 rounded-lg hover:bg-almond/40 focus-visible:bg-almond/40 outline-none transition-colors">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-primary truncate">{r.from}</div>
                <div className="text-xs text-primary/50 truncate">{when(r.ts)} · {r.subject}</div>
              </div>
              <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 ${LABEL_CLS[r.label] || 'bg-gray-100 text-gray-600'}`}>{lab(r.label)}</span>
            </button>
          ))}
        </Card>

        <div className="space-y-4 min-w-0">
          <Card title={t('admin.outreach.labels', 'Clasificación')}>
            {Object.entries(d.labels || {}).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]: any) => (
              <div key={k} className="flex justify-between text-sm py-0.5"><span className="text-primary/70">{lab(k)}</span><span className="font-mono text-primary">{v}</span></div>
            ))}
          </Card>
          <Card title={t('admin.outreach.engine', 'Motor')}>
            <div className="text-sm text-primary/70 space-y-1">
              <div>{t('admin.outreach.replyBot', 'Bot respuestas')}: <b>{st(eng.reply_bot === 'live')}</b>{eng.paused_since && <> · {when(eng.paused_since)}</>}</div>
              <div>{t('admin.outreach.sequencer', 'Secuenciador')}: <b>{eng.sequencer === 'live' ? st(true) : t('admin.outreach.dry', 'simulación')}</b></div>
              <div>{t('admin.outreach.warmup', 'Calentamiento')}: <b>{eng.warmup === 'live' ? st(true) : t('admin.outreach.dry', 'simulación')}</b> · {num(d.warmup?.sent)} {t('admin.outreach.sent', 'Enviados').toLowerCase()}</div>
              <div>{t('admin.outreach.agencySender', 'Envío press@')}: <b>{st(eng.agency_sender === 'live')}</b></div>
            </div>
            <div className="mt-3 text-[11px] text-primary/40 space-y-0.5">
              {Object.entries(eng.last_runs || {}).map(([k, v]: any) => <div key={k} className="flex justify-between gap-2"><span className="truncate">{k}</span><span className="tabular-nums shrink-0">{when(v)}</span></div>)}
            </div>
          </Card>
        </div>
      </div>

      <Card title={t('admin.outreach.mailboxes', 'Buzones y calentamiento')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(d.mailboxes || []).map((m: any) => (
            <div key={m.addr} className="flex items-center gap-2 rounded-xl bg-almond/40 px-3 py-2 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.paused ? 'bg-red-500' : 'bg-emerald-500'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-primary truncate" title={m.addr}>{m.addr}</div>
                <div className="text-[11px] text-primary/50 truncate">{m.via} · {t('admin.outreach.cap', 'límite')} {num(m.daily_cap)}/{t('admin.outreach.day', 'día')}{m.sent_today != null && <> · {num(m.sent_today)} {t('admin.outreach.today', 'hoy')}</>} · {t('admin.outreach.warmupDay', 'calent. día')} {num(m.warmup_day)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-primary/40 mt-3">{t('admin.outreach.inboxes', 'Bandejas leídas')}: {(d.inboxes || []).map((b: any) => b.name).join(' · ')}</div>
      </Card>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="outreach-subj" className="relative bg-white w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl">
            <button type="button" onClick={() => setOpen(null)} aria-label={t('admin.common.close', 'Cerrar')} className="absolute top-3 right-3 z-10 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition"><span className="material-symbols-outlined">close</span></button>
            <div className="p-5 pr-14 border-b border-gray-100">
              <div id="outreach-subj" className="font-serif text-xl text-primary break-words">{open.subject}</div>
              <div className="text-sm text-primary/60 mt-1 break-words">{open.from}</div>
              <div className="text-xs text-primary/40 mt-0.5">{when(open.ts)} · {lab(open.label)}</div>
            </div>
            <div className="p-5 overflow-y-auto whitespace-pre-wrap break-words text-sm text-primary/90 leading-relaxed">{open.body || t('admin.outreach.noBody', 'Sin texto.')}</div>
            {open.from && (
              <div className="p-4 border-t border-gray-100 flex justify-end">
                <a href={`mailto:${open.from}?subject=${encodeURIComponent(/^re:/i.test(open.subject || '') ? open.subject : 'Re: ' + (open.subject || ''))}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary px-4 py-2 rounded-full bg-almond hover:bg-almond/70 transition">
                  <span className="material-symbols-outlined text-base">mail</span>{t('admin.outreach.reply', 'Responder')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutreachDashboard;
