import React, { useMemo, useEffect, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { Project } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';

const LandingGlobalitae: React.FC = () => {
  const { t } = useTranslation();
  const [project, setProject] = useState<Project | null>(null);
  const { formatPrice } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });

  const slug = "golf-bay-lofts-1bd";

  // Helper date formatter
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
        if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateString;
        return new Date(dateString).toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: projectData, error } = await supabase
          .from('projects')
          .select('*')
          .eq('slug', slug)
          .single();

        if (projectData) {
          const rawProject = projectData as any;
          const loadedProject: Project = {
              ...rawProject,
              gallery: parseJsonField(rawProject.gallery, []),
              investor_tiers: parseJsonField(rawProject.investor_tiers, []),
              amenities: parseJsonField(rawProject.amenities, [])
          };
          setProject(loadedProject);
          document.title = `${loadedProject.name} | Unreal Studio × Globalitae`;
        } else if (error) {
          console.error("Project not found:", error);
        }
      } catch (error) {
        console.error("Error loading project details:", error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [slug]);

  const allImages = useMemo(() => {
    if (!project) return [];
    const list = [project.image];
    if (project.gallery) list.push(...project.gallery);
    if (project.construction_gallery) list.push(...project.construction_gallery);
    return list.filter(img => img && img.length > 0).map(path => getImageUrl(path));
  }, [project]);

  const nextSlide = () => setLightbox(p => ({ ...p, index: (p.index + 1) % allImages.length }));
  const prevSlide = () => setLightbox(p => ({ ...p, index: (p.index - 1 + allImages.length) % allImages.length }));

  useEffect(() => {
    if (!lightbox.open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
      if (e.key === 'Escape') setLightbox({ open: false, index: 0 });
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox.open, lightbox.index]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://link.msgsndr.com/js/form_embed.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    // Meta Pixel - load via script tag injection
    const loadPixel = () => {
      if ((window as any).fbq) return; // Already loaded
      
      const f = window as any;
      const n = f.fbq = function() {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [] as any[];
      
      const t = document.createElement('script');
      t.async = true;
      t.src = 'https://connect.facebook.net/en_US/fbevents.js';
      const s = document.getElementsByTagName('script')[0];
      if (s && s.parentNode) {
        s.parentNode.insertBefore(t, s);
      } else {
        document.head.appendChild(t);
      }
      
      (window as any).fbq('init', '2063788554445408');
      (window as any).fbq('track', 'PageView');
    };
    
    loadPixel();

    // Listen for GHL form submission via postMessage
    const handleMessage = (event: MessageEvent) => {
      try {
        if (typeof event.data === 'string' && event.data.includes('form_submitted')) {
          if ((window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration');
          }
        }
        // Also check for GHL specific message format
        if (event.data && typeof event.data === 'object' && event.data.type === 'hsFormCallback' && event.data.eventName === 'onFormSubmit') {
          if ((window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration');
          }
        }
      } catch (e) {
        // Ignore cross-origin errors
      }
    };

    window.addEventListener('message', handleMessage);

    // Also observe the iframe for URL changes (form completion usually redirects)
    const checkFormCompletion = setInterval(() => {
      try {
        const iframe = document.getElementById('inline-sJULfOixnegP6pWUFDy1') as HTMLIFrameElement;
        if (iframe && iframe.contentDocument) {
          const thankYou = iframe.contentDocument.querySelector('.thank-you, .success-message, [data-form-submitted]');
          if (thankYou && (window as any).fbq) {
            (window as any).fbq('track', 'CompleteRegistration');
            clearInterval(checkFormCompletion);
          }
        }
      } catch (e) {
        // Cross-origin - can't access iframe content, rely on postMessage
      }
    }, 2000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkFormCompletion);
    };
  }, []);

  if (loading) {
      return (
          <div className="min-h-screen bg-[#f5f0eb] flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">{t('fix.lg.loadingProject')}</p>
          </div>
      );
  }

  if (!project) {
      return (
          <div className="min-h-screen bg-[#f5f0eb] flex flex-col items-center justify-center text-center px-6">
              <h1 className="text-6xl font-serif text-primary mb-4">{t('fix.lg.projectNotFound')}</h1>
              <p className="text-xl text-primary/70">{t('fix.lg.projectNotAvailable')}</p>
          </div>
      );
  }

  return (
    <div className="bg-[#f5f0eb] min-h-screen font-sans text-primary selection:bg-primary selection:text-white pb-12">
      <noscript>
        <img height="1" width="1" style={{display: 'none'}} src="https://www.facebook.com/tr?id=2063788554445408&ev=PageView&noscript=1" alt="" />
      </noscript>
      <style>{`
        .font-serif { font-family: 'Nexa Heavy', serif !important; }
        .font-sans { font-family: 'Anglemoxi Regular', sans-serif !important; }
        .font-light { font-family: 'Nexa Extra Light', sans-serif !important; }
      `}</style>
      {/* HEADER MÍNIMO */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#f5f0eb]/90 backdrop-blur-md border-b border-primary/10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-3 md:h-20 flex flex-col md:flex-row items-center justify-center relative gap-2 md:gap-0">
          <div className="md:absolute md:left-12 flex items-center gap-2">
            <span className="font-serif text-2xl md:text-3xl font-bold text-primary tracking-tighter">Unreal Studio</span>
          </div>
          <h1 className="text-xs md:text-base font-bold tracking-[0.2em] uppercase text-primary text-center">
            × GLOBALITAE
          </h1>
        </div>
      </header>

      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none px-6">
        <button onClick={() => document.getElementById('inline-sJULfOixnegP6pWUFDy1')?.scrollIntoView({behavior: 'smooth'})} className="pointer-events-auto bg-primary text-white px-6 py-4 rounded-full font-bold text-xs md:text-sm uppercase tracking-widest shadow-2xl hover:bg-black transition flex items-center gap-2">
          {t('fix.lg.downloadDossier')} <span className="material-symbols-outlined text-sm">arrow_downward</span>
        </button>
      </div>

      {/* HERO */}
      <section className="relative h-screen min-h-[600px] flex items-end pb-24 pt-40 px-6 md:px-12">
        <div className="absolute inset-0 z-0">
          <img 
            src={getImageUrl(project.image)} 
            alt={project.name} 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto">
          <div className="inline-block bg-white text-primary text-[10px] md:text-xs font-black px-4 py-2 uppercase tracking-widest rounded-full mb-6 shadow-lg">
            {t('fix.lg.lastUnits')}
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif text-white mb-4 leading-[1.1] drop-shadow-lg">
            {project.name}
          </h1>
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8 text-white/90">
            <p className="text-lg md:text-2xl font-light flex items-center gap-2">
              <span className="material-symbols-outlined">location_on</span>
              {project.location}
            </p>
            <div className="hidden md:block w-1.5 h-1.5 rounded-full bg-white/50"></div>
            <p className="text-xl md:text-3xl font-bold text-white">
              {t('fix.lg.fromPrice', { price: formatPrice(project.investor_price, project.price_currency) })}
            </p>
          </div>
        </div>
      </section>

      {/* DATOS CLAVE */}
      <section className="relative z-20 -mt-12 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="bg-white rounded-[2rem] md:rounded-[3rem] shadow-2xl p-6 md:p-10 grid grid-cols-2 lg:flex lg:flex-row justify-between items-center gap-6 md:gap-4 lg:divide-x divide-gray-100">
          <div className="px-2 md:px-4 lg:first:pl-0 text-center lg:text-left w-full lg:w-auto">
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('fix.lg.availableUnits')}</p>
            <p className="text-2xl md:text-3xl font-serif text-primary">
              {project.available_units != null ? project.available_units : t('fix.lg.consult')}
            </p>
          </div>
          <div className="px-2 md:px-4 text-center lg:text-left w-full lg:w-auto">
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('fix.lg.constructionProgress')}</p>
            <p className="text-2xl md:text-3xl font-serif text-primary">
              {project.completion_percent != null ? project.completion_percent + '%' : t('fix.lg.consult')}
            </p>
          </div>
          <div className="px-2 md:px-4 text-center lg:text-left w-full lg:w-auto">
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('fix.lg.investorPrice')}</p>
            <p className="text-2xl md:text-3xl font-serif text-primary">{formatPrice(project.investor_price, project.price_currency)}</p>
          </div>
          <div className="px-2 md:px-4 text-center lg:text-left w-full lg:w-auto">
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('fix.lg.marketPrice')}</p>
            <p className="text-2xl md:text-3xl font-serif line-through opacity-40 text-primary">{formatPrice(project.market_price, project.price_currency)}</p>
          </div>
          <div className="px-2 md:px-4 lg:border-r-0 text-center lg:text-left w-full lg:w-auto col-span-2 lg:col-span-1 mt-4 lg:mt-0">
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('fix.lg.status')}</p>
            <p className="text-lg md:text-xl font-bold flex items-center justify-center md:justify-start gap-2 h-full uppercase tracking-tighter text-primary">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
              {project.status}
            </p>
          </div>
        </div>
      </section>

      {/* EL PROYECTO */}
      <section className="py-20 px-6 md:px-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
          <div className="lg:col-span-2 space-y-12">
            <div>
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-primary/40 mb-4">{t('fix.lg.theProject')}</h2>
              <h3 className="text-4xl md:text-5xl font-serif text-primary leading-tight mb-8">
                {project.name}
              </h3>
              <div className="prose prose-lg prose-p:text-primary/70 prose-p:font-light prose-p:leading-relaxed max-w-none">
                {project.description?.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="mb-6">{paragraph}</p>
                ))}
              </div>
            </div>

            <div className="text-center py-8">
              <button onClick={() => document.getElementById('inline-sJULfOixnegP6pWUFDy1')?.scrollIntoView({behavior: 'smooth'})} className="bg-primary text-white px-8 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg hover:bg-black transition w-full md:w-auto">
                {t('fix.lg.requestInfo')}
              </button>
            </div>

            {/* DETALLES */}
            <div className="pt-12 border-t border-primary/10">
              <h3 className="text-2xl font-serif text-primary mb-8">{t('fix.lg.details')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.beachDistance')}</p>
                  <p className="text-xl font-bold">{project.distance_beach || t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.contract')}</p>
                  <p className="text-xl font-bold">{project.years_contract ? t('fix.lg.contractYears', { years: project.years_contract, ext: project.years_extension || 0 }) : t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.available')}</p>
                  <p className="text-xl font-bold">{project.available_units || t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.progress')}</p>
                  <p className="text-xl font-bold">{project.completion_percent}%</p>
                </div>
              </div>
            </div>

            {/* CARACTERÍSTICAS */}
            <div className="pt-12 border-t border-primary/10">
              <h3 className="text-2xl font-serif text-primary mb-8">{t('fix.lg.features')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.bedrooms')}</p>
                  <p className="text-xl font-bold">{project.bedrooms || t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.bathrooms')}</p>
                  <p className="text-xl font-bold">{project.bathrooms || t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.area')}</p>
                  <p className="text-xl font-bold">{project.area_m2 ? `${project.area_m2} m²` : t('fix.lg.consult')}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-primary/40 mb-2">{t('fix.lg.furnishing')}</p>
                  <p className="text-xl font-bold">{project.furnishing || t('fix.lg.consult')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="lg:col-span-1">
            <div className="sticky top-32 space-y-8">
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-primary/5">
                <h3 className="text-xl font-serif text-primary mb-6 pb-4 border-b border-primary/10">{t('fix.lg.assetSummary')}</h3>
                <ul className="space-y-4">
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.bedrooms')}</span>
                    <span className="font-bold">{project.bedrooms}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.bathrooms')}</span>
                    <span className="font-bold">{project.bathrooms}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.area')}</span>
                    <span className="font-bold">{project.area_m2 ? `${project.area_m2} m²` : t('fix.lg.consult')}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.furnishing')}</span>
                    <span className="font-bold">{project.furnishing}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.pool')}</span>
                    <span className="font-bold">{project.has_pool ? t('fix.lg.yes') : t('fix.lg.no')}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.completion')}</span>
                    <span className="font-bold">{formatDate(project.completion_date)}</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span className="text-sm text-primary/60">{t('fix.lg.constructionProgress')}</span>
                    <span className="font-bold">{project.completion_percent}%</span>
                  </li>
                  <li className="flex justify-between items-center pt-4 border-t border-primary/10">
                    <span className="text-sm text-primary/60">{t('fix.lg.contract')}</span>
                    <span className="font-bold">{project.years_contract ? t('fix.lg.contractYearsShort', { years: project.years_contract, ext: project.years_extension || 0 }) : t('fix.lg.consult')}</span>
                  </li>
                </ul>
              </div>

              {project.construction_update_url && (
                <a 
                  href={getImageUrl(project.construction_update_url)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full bg-white text-primary border border-primary/10 px-8 py-5 rounded-2xl font-bold hover:bg-gray-50 transition flex items-center justify-center gap-3 shadow-sm"
                >
                  <span className="material-symbols-outlined">analytics</span>
                  {t('fix.lg.viewConstructionReport')}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* GALERÍA */}
      {project.gallery && project.gallery.length > 0 && (
        <section className="py-20 px-6 md:px-12 max-w-7xl mx-auto border-t border-primary/10">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-primary/40 mb-12 text-center">{t('fix.lg.projectGallery')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {project.gallery.slice(0, 6).map((img: string, idx: number) => (
              <div 
                key={idx} 
                className="aspect-square rounded-2xl overflow-hidden cursor-pointer group relative"
                onClick={() => setLightbox({ open: true, index: idx + 1 })}
              >
                <img src={getImageUrl(img)} alt={t('fix.lg.galleryAlt', { num: idx + 1 })} className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 transition duration-300 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white opacity-0 group-hover:opacity-100 transition-opacity transform scale-50 group-hover:scale-100 duration-300">zoom_in</span>
                </div>
              </div>
            ))}
          </div>
          {project.gallery.length > 6 && (
            <div className="mt-8 text-center">
              <button 
                onClick={() => setLightbox({ open: true, index: 0 })}
                className="text-sm font-bold uppercase tracking-widest text-primary hover:text-primary/70 transition"
              >
                {t('fix.lg.viewAllPhotos', { count: allImages.length })}
              </button>
            </div>
          )}
        </section>
      )}

      {/* SERVICIOS INCLUIDOS */}
      {project.amenities && project.amenities.length > 0 && (
        <section className="py-20 px-6 md:px-12 max-w-7xl mx-auto border-t border-primary/10">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-primary/40 mb-12 text-center">{t('fix.lg.includedServices')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {project.amenities.map((amenity: string, idx: number) => {
              const icons: Record<string, string> = {
                'Piscina privada': 'pool', 'Piscina compartida': 'pool', 'Gimnasio': 'fitness_center',
                'Coworking': 'desktop_windows', 'Jardín tropical': 'park', 'Terraza': 'deck',
                'Parking': 'local_parking', 'Seguridad 24h': 'shield', 'Cámaras de seguridad': 'videocam',
                'WiFi': 'wifi', 'Aire acondicionado': 'ac_unit', 'Ventilador': 'mode_fan_off',
                'Cocina equipada': 'kitchen', 'Lavandería': 'local_laundry_service', 'Zona barbacoa': 'outdoor_grill',
                'Vistas al mar': 'water', 'Cercano a la playa': 'beach_access', 'Recepción': 'concierge',
                'Bar': 'local_bar', 'Almacén': 'warehouse', 'Spa': 'spa',
                'Sala de juegos': 'sports_esports', 'Servicio de limpieza': 'cleaning_services', 'Alquiler de motos': 'two_wheeler'
              };
              return (
                <div key={idx} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-primary/5">
                  <span className="material-symbols-outlined text-primary/40">{icons[amenity] || 'check_circle'}</span>
                  <span className="text-sm font-medium text-primary">{amenity}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="text-center py-12">
        <button onClick={() => document.getElementById('inline-sJULfOixnegP6pWUFDy1')?.scrollIntoView({behavior: 'smooth'})} className="bg-primary text-white px-8 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg hover:bg-black transition w-full md:w-auto max-w-[90%] mx-auto">
          {t('fix.lg.downloadDossierArrow')}
        </button>
      </div>

      {/* CTA / FORMULARIO GHL */}
      <section className="py-24 px-6 md:px-12 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-serif text-primary mb-6">{t('fix.lg.requestInfoThisProject')}</h2>
          <p className="text-lg text-primary/70 mb-12">{t('fix.lg.requestInfoSubtitle')}</p>
          
          <div id="ghl-form" className="bg-[#f5f0eb] p-4 md:p-12 rounded-[2rem] shadow-inner text-left">
            <div className="w-full" style={{minHeight: '735px'}}>
              <iframe
                src="https://api.leadconnectorhq.com/widget/form/sJULfOixnegP6pWUFDy1"
                style={{width: '100%', height: '735px', border: 'none', borderRadius: '0px'}}
                id="inline-sJULfOixnegP6pWUFDy1"
                data-layout="{'id':'INLINE'}"
                data-trigger-type="alwaysShow"
                data-trigger-value=""
                data-activation-type="alwaysActivated"
                data-activation-value=""
                data-deactivation-type="neverDeactivate"
                data-deactivation-value=""
                data-form-name="UNR - Pagina Web"
                data-height="735"
                data-layout-iframe-id="inline-sJULfOixnegP6pWUFDy1"
                data-form-id="sJULfOixnegP6pWUFDy1"
                title="UNR - Pagina Web"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER MÍNIMO */}
      <footer className="py-8 text-center border-t border-primary/10">
        <p className="text-xs text-primary/40 font-bold tracking-widest uppercase">
          {t('fix.lg.footerCopyright')}
        </p>
      </footer>

      {/* LIGHTBOX */}
      {lightbox.open && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-sm">
          <button onClick={() => setLightbox({ open: false, index: 0 })} className="absolute top-6 right-6 text-white/50 hover:text-white transition z-50">
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>
          
          <button onClick={prevSlide} className="absolute left-4 md:left-12 text-white/50 hover:text-white transition z-50 p-4">
            <span className="material-symbols-outlined text-4xl md:text-6xl">chevron_left</span>
          </button>
          
          <div className="w-full max-w-6xl px-4 md:px-24 h-[80vh] flex items-center justify-center">
            <img 
              src={allImages[lightbox.index]} 
              alt={t('fix.lg.galleryLightboxAlt')}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
            />
          </div>
          
          <button onClick={nextSlide} className="absolute right-4 md:right-12 text-white/50 hover:text-white transition z-50 p-4">
            <span className="material-symbols-outlined text-4xl md:text-6xl">chevron_right</span>
          </button>

          <div className="absolute bottom-8 left-0 right-0 text-center text-white/50 font-mono text-sm tracking-widest">
            {lightbox.index + 1} / {allImages.length}
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingGlobalitae;
