/**
 * Presentación de artículo (hero con imagen + tarjeta blanca + prose + compartir).
 * Extraído de BlogDetail para reutilizarlo en las landings SEO (pages/LandingPage).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';

export interface ArticleViewProps {
  title: string;
  image: string;
  tagLabel?: string;
  dateText: string;
  html: string;
  backTo: string;
  backLabel: string;
}

const ArticleView: React.FC<ArticleViewProps> = ({ title, image, tagLabel, dateText, html, backTo, backLabel }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-almond min-h-screen pb-24 transition-colors duration-300">
       <div className="h-[60vh] w-full relative overflow-hidden">
           <img
             src={imgSrc(image, 1600)}
             srcSet={imgSrcSet(image, [600, 1000, 1400, 1800])}
             sizes="100vw"
             onError={imgFallback(image)}
             className="w-full h-full object-cover"
             alt={title}
             loading="eager"
             fetchPriority="high"
           />
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
           <div className="absolute inset-0 flex flex-col justify-end p-6 pb-24 md:p-12 md:pb-28 lg:p-20 lg:pb-28 max-w-7xl mx-auto">
               {tagLabel && <span className="bg-primary text-white text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg w-fit mb-6 shadow-xl">{tagLabel}</span>}
               <h1 className="text-4xl md:text-6xl lg:text-7xl text-white font-serif leading-tight max-w-5xl">{title}</h1>
           </div>
       </div>

       <div className="max-w-6xl mx-auto px-4 md:px-12 -mt-16 relative z-10">
           <div className="bg-white rounded-[2rem] md:rounded-[3rem] p-6 md:p-16 lg:p-20 shadow-2xl border border-primary/5">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 md:mb-16 border-b border-gray-100 pb-8 gap-4">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary/30">calendar_today</span>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{dateText}</span>
                    </div>
                    <Link to={backTo} className="text-[10px] font-black text-primary uppercase tracking-widest hover:translate-x-[-4px] transition-transform flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> {backLabel}
                    </Link>
                </div>

                {/* Renderizado de HTML enriquecido para SEO. Saneado con DOMPurify:
                    permite formato del blog pero elimina scripts/eventos (anti-XSS). */}
                <div
                  className="prose prose-lg md:prose-xl max-w-none prose-p:text-primary/70 prose-p:font-light prose-headings:text-primary prose-headings:font-serif prose-strong:text-primary prose-strong:font-bold prose-img:rounded-3xl"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html, { ADD_ATTR: ['target'] }) }}
                />

                <div className="mt-20 pt-12 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <h4 className="text-xl font-bold text-primary mb-2">{t('blog.shareTitle')}</h4>
                        <p className="text-sm text-primary/50 font-medium">{t('blog.shareBody')}</p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            type="button"
                            title={t('blog.copyLink', 'Copiar enlace')}
                            onClick={() => { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }}
                            className="w-12 h-12 rounded-full bg-primary border border-primary flex items-center justify-center text-white hover:bg-almond hover:text-primary transition shadow-sm group">
                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition">link</span>
                        </button>
                        <button
                            type="button"
                            title={t('blog.share', 'Compartir')}
                            onClick={() => {
                                const data = { title: document.title, url: window.location.href };
                                if (navigator.share) { void navigator.share(data).catch(() => {}); }
                                else { try { navigator.clipboard?.writeText(window.location.href); } catch { /* ignore */ } }
                            }}
                            className="w-12 h-12 rounded-full bg-primary border border-primary flex items-center justify-center text-white hover:bg-almond hover:text-primary transition shadow-sm group">
                            <span className="material-symbols-outlined text-base group-hover:scale-110 transition">share</span>
                        </button>
                    </div>
                </div>
           </div>
       </div>
    </div>
  );
};

export default ArticleView;
