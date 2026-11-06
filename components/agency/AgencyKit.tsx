/**
 * Material de venta: archivos oficiales del proyecto (tabla projects) + textos listos para
 * WhatsApp / Instagram / email en 4 idiomas, generados SOLO con datos de la ficha y con el
 * link UTM de la agencia. Sin cifras de rentabilidad.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { projectSeoSlug } from '../../lib/projectUrl';
import { AgencyData, PropertyRow, copyText, fmtEUR, isUnitAvailable, partnerParam, shortProjectName } from './useAgencyData';
import { card, btnGhost, Empty, SectionTitle } from './ui';

const LANGS = ['es', 'en', 'ro', 'id'] as const;
const CHANNELS = ['whatsapp', 'instagram', 'email'] as const;

export default function AgencyKit({ data }: { data: AgencyData }) {
  const { t, i18n: { language } } = useTranslation();
  const { partner, projects, units, projectInfo } = data;
  const [pid, setPid] = useState(projects[0]?.id ?? '');
  const [lang, setLang] = useState<string>((LANGS as readonly string[]).includes(language?.slice(0, 2)) ? language.slice(0, 2) : 'es');
  const [copied, setCopied] = useState('');
  if (!partner) return null;
  if (!projects.length) return <div className="animate-in fade-in duration-500"><SectionTitle title={t('agencyPortal.nav.kit')} sub={t('agencyPortal.kit.sub')} /><Empty icon="folder_open" text={t('agenciasDashboard.noProjectsYet')} /></div>;

  const p: PropertyRow = projects.find((x) => x.id === pid) ?? projects[0];
  const info = p.slug ? projectInfo[p.slug] : undefined;
  const link = p.slug
    ? `${window.location.origin}/${lang}/proyecto/${projectSeoSlug({ slug: p.slug, location: p.area ?? null })}?utm_source=lister&utm_partner=${partnerParam(partner)}&utm_property=${p.slug}`
    : '';

  // Archivos: solo los que existen en la ficha.
  const brochures = Object.entries(info?.brochures ?? {}).filter(([, u]) => !!u);
  if (!brochures.length && (info?.brochure_url || p.brand_pdf_url)) brochures.push(['', (info?.brochure_url || p.brand_pdf_url) as string]);
  const files: { key: string; icon: string; label: string; url: string | null | undefined }[] = [
    ...brochures.map(([l, u]) => ({ key: `b-${l}`, icon: 'picture_as_pdf', label: l ? t('agencyPortal.kit.brochure', { lang: l.toUpperCase() }) : t('agencyPortal.projects.dossier'), url: u })),
    { key: 'renders', icon: 'image', label: t('agencyPortal.kit.renders'), url: info?.drive_renders_url },
    { key: 'plans', icon: 'architecture', label: t('agencyPortal.kit.plans'), url: info?.drive_2d_plans_url },
    { key: 'folder', icon: 'folder_open', label: t('agencyPortal.kit.folder'), url: info?.drive_brochure_folder_url },
    { key: 'video', icon: 'play_circle', label: t('agencyPortal.kit.video'), url: info?.video_url || p.drone_video_url },
    { key: 'tour', icon: 'videocam', label: t('agencyPortal.kit.tour'), url: info?.walkthrough_url || p.walkthrough_url },
    { key: 'construction', icon: 'construction', label: t('agencyPortal.kit.construction'), url: info?.construction_update_url },
  ].filter((f) => !!f.url);

  // Datos para los textos (todos de la ficha).
  const avail = units.filter((u) => u.property_id === p.id && isUnitAvailable(u));
  const prices = avail.map((u) => u.price_agencia ?? u.price_publico) // price_agencia = PVP cerrado del canal agencias (FAQ 7).filter((n): n is number => !!n);
  const beds = avail.map((u) => u.bedrooms).filter((n): n is number => !!n);
  const ft = i18n.getFixedT(lang);
  const pct = info?.completion_percent ?? p.pct_progress;
  const facts = [
    beds.length ? ft('agencyPortal.kit.tpl.beds', { n: Math.min(...beds) }) : null,
    pct === 100 ? ft('agencyPortal.kit.tpl.finished') : typeof pct === 'number' && pct > 0 ? ft('agencyPortal.kit.tpl.building', { pct }) : ft('agencyPortal.kit.tpl.offPlan'),
    prices.length ? ft('agencyPortal.kit.tpl.from', { price: fmtEUR(Math.min(...prices)) }) : null,
    info?.tenure ? [info.tenure, info.years_contract ? ft('agencyPortal.kit.tpl.years', { n: info.years_contract }) : null].filter(Boolean).join(' ') : null,
  ].filter(Boolean).join(' · ');
  const vars = { name: shortProjectName(p.name), area: p.area || info?.location || 'Bali', facts, agency: partner.agency_name, link };
  const texts: Record<string, string> = Object.fromEntries(CHANNELS.map((c) => [c, ft(`agencyPortal.kit.tpl.${c}`, vars)]));

  const copy = async (key: string, text: string) => {
    if (await copyText(text, t('agenciasDashboard.copyPrompt'))) { setCopied(key); setTimeout(() => setCopied(''), 2000); }
  };

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <SectionTitle title={t('agencyPortal.nav.kit')} sub={t('agencyPortal.kit.sub')} />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {projects.map((x) => (
          <button key={x.id} onClick={() => setPid(x.id)}
            className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold transition ${x.id === p.id ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-primary/70 hover:bg-gray-50'}`}>
            {shortProjectName(x.name)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 [&>*]:min-w-0">
        <section className={`${card} lg:col-span-2 !p-0 overflow-hidden self-start`}>
          {p.hero_image_url && <img src={p.hero_image_url} alt={p.name} className="w-full h-40 object-cover" loading="lazy" />}
          <div className="p-5">
            <h3 className="font-serif text-xl text-primary">{shortProjectName(p.name)}</h3>
            {p.area && <p className="text-xs text-primary/50 mt-0.5">{p.area}</p>}
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary/40 mt-5 mb-2">{t('agencyPortal.kit.files')}</h4>
            {files.length === 0 && <p className="text-sm text-primary/50">{t('agencyPortal.kit.noFiles')}</p>}
            <ul className="divide-y divide-gray-100">
              {files.map((f) => (
                <li key={f.key}>
                  <a href={f.url as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 text-sm font-bold text-primary hover:text-primary/70">
                    <span className="material-symbols-outlined text-xl text-primary/40">{f.icon}</span>
                    <span className="flex-1 truncate">{f.label}</span>
                    <span className="material-symbols-outlined text-base text-primary/30">open_in_new</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 mt-4">
              {link && (
                <button onClick={() => copy('link', link)} className={copied === 'link' ? `${btnGhost} !bg-green-600 !text-white !border-green-600` : btnGhost}>
                  <span className="material-symbols-outlined text-base">{copied === 'link' ? 'check' : 'link'}</span>{copied === 'link' ? t('agencyPortal.copiedShort') : t('agencyPortal.kit.listing')}
                </button>
              )}
              {p.slug && (
                <Link to={`/agencias/${p.slug}`} target="_blank" className={btnGhost}>
                  <span className="material-symbols-outlined text-base">folder_open</span>{t('agencyPortal.kit.pack')}
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className={`${card} lg:col-span-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary/40 whitespace-nowrap">{t('agencyPortal.kit.texts')}</h3>
            <div className="flex bg-gray-100 rounded-full p-1" role="group" aria-label={t('agencyPortal.kit.textLang')}>
              {LANGS.map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase transition ${lang === l ? 'bg-primary text-white' : 'text-primary/60'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {CHANNELS.map((c) => (
              <div key={c} className="rounded-xl border border-gray-100">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <span className="text-xs font-black uppercase tracking-widest text-primary/60">{t(`agencyPortal.kit.ch${c[0].toUpperCase()}${c.slice(1)}`)}</span>
                  <button onClick={() => copy(c, texts[c])} className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition ${copied === c ? 'bg-green-600 text-white' : 'bg-gray-100 text-primary hover:bg-gray-200'}`}>
                    <span className="material-symbols-outlined text-sm">{copied === c ? 'check' : 'content_copy'}</span>{copied === c ? t('agencyPortal.copiedShort') : t('agencyPortal.kit.copy')}
                  </button>
                </div>
                <p className="px-4 py-3 text-sm text-primary/80 whitespace-pre-line break-words leading-relaxed">{texts[c]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-primary/40 mt-4">{t('agencyPortal.kit.disclaimer')}</p>
        </section>
      </div>
    </div>
  );
}
