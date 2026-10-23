/**
 * ProjectCard — ficha de proyecto del catálogo (rediseño 2026). Sin "tarjeta"
 * blanca: fotografía a sangre + pie editorial sobre la piedra, como una lámina
 * de monografía de arquitectura. Compartida por Home y /proyectos para que el
 * catálogo se vea idéntico en ambos sitios.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Project } from '../types';
import { useCurrency } from '../App';
import { getImageUrl } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import { projectPath } from '../lib/projectUrl';
import { translateStatus } from '../lib/statusI18n';
import { statusDotClass } from '../lib/statusColor';
import { isFinished, deliveryText } from '../lib/deliveryDate';

const localizedCompletion = (p: Project, lang: string): string => {
  const l = (lang || 'es').slice(0, 2);
  if (l === 'en') return (p as any).completion_date_en || p.completion_date || '';
  if (l === 'id') return (p as any).completion_date_id || p.completion_date || '';
  return p.completion_date || '';
};

interface Props {
  project: Project;
  /** Primera imagen above-the-fold: carga prioritaria. */
  eager?: boolean;
  /** Formato alto para la pieza principal de una composición asimétrica. */
  tall?: boolean;
  sizes?: string;
  /** Vendido: sin enlace, en gris, con "precio final". */
  sold?: boolean;
}

const ProjectCard: React.FC<Props> = ({ project: p, eager, tall, sizes, sold }) => {
  const { t, i18n } = useTranslation();
  const { formatPrice } = useCurrency();
  const img = getImageUrl(p.image);
  const tenure = (p.tenure || '').toLowerCase();
  const delivery = !sold && !isFinished(p.status) ? localizedCompletion(p, i18n.language) : '';

  const body = (
    <>
      <div className={`us-zoom relative overflow-hidden bg-primary/10 ${tall ? 'aspect-[4/3] sm:aspect-[4/5] lg:aspect-[5/6]' : 'aspect-[4/3] sm:aspect-[4/5]'} ${sold ? 'grayscale-[0.6]' : ''}`}>
        <img
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          alt={p.name}
          className="absolute inset-0 w-full h-full object-cover"
          src={imgSrc(img, 900)}
          srcSet={imgSrcSet(img, [480, 700, 900, 1300])}
          sizes={sizes || '(max-width: 640px) 90vw, (max-width: 1024px) 50vw, 33vw'}
          onError={imgFallback(img)}
        />
        <div className="absolute top-3 left-3 md:top-4 md:left-4 flex flex-wrap gap-1.5">
          {sold ? (
            <span className="us-tag"><span className="w-1.5 h-1.5 rounded-full bg-red-600" />{t('projects.statusSold')}</span>
          ) : (
            <span className="us-tag"><span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(p.status)}`} />{translateStatus(p.status, t)}</span>
          )}
          {p.has_real_photos && !sold && (
            <span className="us-tag"><span className="material-symbols-outlined text-[13px] text-emerald-700">photo_camera</span>{t('projects.card.realPhotos')}</span>
          )}
        </div>
      </div>

      <div className="pt-5 md:pt-6 flex flex-col flex-1 text-left">
        {p.location && <p className="us-label text-primary/50 truncate">{p.location}</p>}
        <h3 className="font-serif text-[1.45rem] md:text-[1.7rem] leading-[1.08] text-primary mt-2 transition-colors duration-300 group-hover:text-clay">{p.name}</h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[13px] text-primary/65">
          {Number(p.bedrooms) > 0 && <span className="inline-flex items-center gap-1.5"><span className="material-symbols-outlined text-[17px] text-primary/40">bed</span>{p.bedrooms}</span>}
          {Number(p.bathrooms) > 0 && <span className="inline-flex items-center gap-1.5"><span className="material-symbols-outlined text-[17px] text-primary/40">bathtub</span>{p.bathrooms}</span>}
          {Number(p.area_m2) > 0 && <span className="inline-flex items-center gap-1.5 us-num"><span className="material-symbols-outlined text-[17px] text-primary/40">square_foot</span>{p.area_m2} m²</span>}
          {p.tenure && (
            <span className={`inline-flex items-center gap-1.5 ${tenure === 'freehold' ? 'text-emerald-800' : ''}`}>
              <span className="material-symbols-outlined text-[17px] opacity-60">key</span>{t(`projects.card.tenure.${tenure}`, p.tenure)}
            </span>
          )}
        </div>

        {delivery && (
          <p className="mt-2 text-[13px] text-primary/55">
            {t('projects.card.delivery')}: {deliveryText(delivery, t('projects.card.deliveryFrom'))}
          </p>
        )}

        {!sold && p.completion_percent > 0 && p.completion_percent < 100 && (
          <div className="flex items-center gap-3 mt-3" aria-label={`${t('projects.card.work')} ${p.completion_percent}%`}>
            <span className="us-label text-primary/45">{t('projects.card.work')}</span>
            <div className="flex-1 h-px bg-primary/15 relative">
              <div className="absolute inset-y-[-0.5px] left-0 h-[2px] bg-clay" style={{ width: `${p.completion_percent}%` }} />
            </div>
            <span className="text-xs font-semibold text-primary us-num">{p.completion_percent}%</span>
          </div>
        )}

        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-4 border-t border-primary/15 pt-4">
            <div className="min-w-0">
              <p className="us-label text-primary/45">{sold ? t('projects.card.finalPrice') : t('projects.card.from')}</p>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                <p className="text-xl md:text-[1.4rem] font-medium text-primary us-num tracking-tight">{Number(p.investor_price) > 0 ? formatPrice(p.investor_price, p.price_currency) : t('projectDetail.consult')}</p>
                {!sold && Number(p.market_price) > Number(p.investor_price) && (
                  <p className="text-xs text-primary/40 line-through us-num">{formatPrice(Number(p.market_price), p.price_currency)}</p>
                )}
              </div>
            </div>
            {!sold && (
              <span className="shrink-0 w-11 h-11 rounded-full border border-primary/20 flex items-center justify-center text-primary transition-all duration-500 ease-out group-hover:bg-primary group-hover:text-almond group-hover:border-primary" aria-hidden="true">
                <span className="material-symbols-outlined text-[20px] transition-transform duration-500 ease-out group-hover:-rotate-45">arrow_forward</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );

  if (sold) return <div className="flex flex-col h-full opacity-75">{body}</div>;
  return (
    <Link
      to={projectPath(p)}
      aria-label={`${p.name} — ${t('projects.card.viewDetails', 'Ver detalles')}`}
      className="group flex flex-col h-full outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-4 focus-visible:ring-offset-almond"
    >
      {body}
    </Link>
  );
};

export default ProjectCard;
