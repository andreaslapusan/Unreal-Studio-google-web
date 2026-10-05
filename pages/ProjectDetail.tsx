import React, { useMemo, useEffect, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { translateProjectTerm } from '../lib/projectTerms';
import { brochureFor } from '../lib/brochure';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, WHATSAPP_URL } from '../constants';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import RolePricingBadge from '../components/RolePricingBadge';
import ProjectTimeline, { TimelinePhase } from '../components/ProjectTimeline';
import BookingWidget from '../components/BookingWidget';
import LazyMap from '../components/LazyMap';
import { resolveCanonicalSlug, projectSeoSlug, projectPath } from '../lib/projectUrl';
import { trackViewContent } from '../lib/fbPixel';
import { gtmViewItem } from '../lib/gtm';
import { translateStatus } from '../lib/statusI18n';
import { statusDotClass } from '../lib/statusColor';
import { useAuth } from '../lib/auth-context';

const ProjectDetail: React.FC = () => {
  const { t, i18n } = useTranslation();
  // Descripción localizada: usa la traducción del idioma activo (auto-traducida
  // del español), con respaldo al español si falta.
  const localizedDescription = (): string => {
    const p = project as any;
    if (!p) return '';
    const lang = (i18n.language || 'es').slice(0, 2);
    if (lang === 'en') return p.description_en || p.description || '';
    if (lang === 'ro') return p.description_ro || p.description || '';
    if (lang === 'id') return p.description_id || p.description || '';
    return p.description || '';
  };
  // Amueblado: traduce las claves del formulario de auto-alta (semi/furnished/turnkey);
  // si es texto libre de un proyecto antiguo, lo muestra tal cual.
  const fmtFurnishing = (v: string) => {
    const map: Record<string, string> = {
      semi: t('listingIntake.semiFurnished'),
      furnished: t('listingIntake.furnished'),
      turnkey: t('listingIntake.turnkey'),
      unfurnished: t('listingIntake.unfurnished'),
    };
    return map[String(v).toLowerCase()] || v;
  };
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [similarProjects, setSimilarProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [matchedUnitId, setMatchedUnitId] = useState<string | null>(null);
  const { formatPrice } = useCurrency();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });

  const [showClientLogin, setShowClientLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Helper date formatter
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
        // Free text from admin (e.g. "Diciembre 2027", "DD/MM/YYYY") is shown as-is.
        // Only ISO-like dates (YYYY-MM-DD…) are reformatted; never parse free text
        // (that turned "Diciembre 2027" into 01/01/2027).
        if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateString;
        if (!/^\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString;
        const d = new Date(dateOnly(dateString));
        if (isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString(uiLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateString;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Carga de Configuración
        const { data: configRows } = await supabase.from('app_config').select('*');
        if (configRows && configRows.length > 0) {
            const configObj: Record<string, any> = {};
            configRows.forEach((row: any) => {
              configObj[row.key] = row.value;
            });
            setConfig({ ...DEFAULT_CONFIG, ...configObj } as AppConfig);
        }

        if (slug) {
           // The URL slug may be either the bare DB slug ("golf-bay-lofts-1bd")
           // or the SEO long form ("golf-bay-lofts-1bd-balangan-uluwatu"). Try
           // exact match first; if it misses, fall back to prefix-resolution
           // against the full slug catalog.
           let { data: projectData } = await supabase
             .from('projects')
             .select('*')
             .eq('slug', slug)
             .maybeSingle();

           if (!projectData) {
             const { data: allSlugs } = await supabase
               .from('projects')
               .select('slug');
             const dbSlugs = (allSlugs ?? []).map((r: any) => r.slug as string);
             const canonical = resolveCanonicalSlug(slug, dbSlugs);
             if (canonical) {
               const { data: hit } = await supabase
                 .from('projects')
                 .select('*')
                 .eq('slug', canonical)
                 .maybeSingle();
               projectData = hit;
             }
           }

           if (projectData) {
              const rawProject = projectData as any;
              const loadedProject: Project = {
                  ...rawProject,
                  gallery: parseJsonField(rawProject.gallery, []),
                  investor_tiers: parseJsonField(rawProject.investor_tiers, []),
                  amenities: parseJsonField(rawProject.amenities, [])
              };
              setProject(loadedProject);

              // SEO canonical: if the URL slug differs from the SEO-friendly
              // form (e.g. bare DB slug, or slug+wrong-zone), rewrite the URL
              // in place so reload/share give the canonical long form. Single
              // source of truth in the address bar without a 301 round-trip.
              const seoSlug = projectSeoSlug(loadedProject);
              if (slug !== seoSlug) {
                const search = window.location.search;
                window.history.replaceState({}, '', `/proyecto/${seoSlug}${search}`);
              }

              // Meta Pixel: track that a specific project was viewed.
              trackViewContent({
                content_ids: [loadedProject.slug ?? loadedProject.id],
                content_name: loadedProject.name,
                content_category: loadedProject.location ?? 'project',
                content_type: 'product',
                value: loadedProject.investor_price,
                currency: (loadedProject.price_currency ?? 'EUR').toUpperCase(),
              });
              // GTM dataLayer: GA4-style view_item event.
              gtmViewItem({
                item_id: loadedProject.slug ?? loadedProject.id,
                item_name: loadedProject.name,
                item_category: loadedProject.location ?? 'project',
                price: loadedProject.investor_price,
                currency: (loadedProject.price_currency ?? 'EUR').toUpperCase(),
              });

              // Try to map this slug to a row in the new portal schema
              // (properties → property_units) for role-based pricing.
              try {
                const { data: propRow } = await supabase
                  .from('properties')
                  .select('id')
                  .eq('slug', slug)
                  .maybeSingle();
                if (propRow?.id) {
                  const { data: unitRow } = await supabase
                    .from('property_units')
                    .select('id')
                    .eq('property_id', propRow.id)
                    .eq('available', true)
                    .limit(1)
                    .maybeSingle();
                  if (unitRow?.id) setMatchedUnitId(unitRow.id);
                }
              } catch {
                // schema may not be migrated yet on this Supabase project — that's fine
              }
              document.title = `${loadedProject.name} | Unreal Studio Madrid`;

              // Dynamic OG meta tags
              const setMeta = (property: string, content: string) => {
                let el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
                if (el) { el.setAttribute('content', content); }
                else {
                  el = document.createElement('meta');
                  el.setAttribute(property.startsWith('og:') ? 'property' : 'name', property);
                  el.setAttribute('content', content);
                  document.head.appendChild(el);
                }
              };
              setMeta('og:title', `${loadedProject.name} | Unreal Studio Madrid`);
              setMeta('og:description', loadedProject.description?.substring(0, 160) || '');
              setMeta('og:image', getImageUrl(loadedProject.image));
              setMeta('og:url', window.location.href);
              setMeta('twitter:title', `${loadedProject.name} | Unreal Studio Madrid`);
              setMeta('twitter:description', loadedProject.description?.substring(0, 160) || '');
              setMeta('twitter:image', getImageUrl(loadedProject.image));

              // JSON-LD Schema.org RealEstateListing — gives Google a structured
              // record per project with price, currency, photos, geo, amenities.
              // Replaces any prior listing block on this page so revisits don't
              // accumulate stale schemas in the head.
              const oldLd = document.getElementById('ld-project-listing');
              if (oldLd) oldLd.remove();
              const ld = document.createElement('script');
              ld.type = 'application/ld+json';
              ld.id = 'ld-project-listing';
              const priceCurrency = (loadedProject.price_currency ?? 'EUR').toUpperCase();
              const galleryUrls = [
                getImageUrl(loadedProject.image),
                ...((loadedProject.gallery ?? []) as string[]).slice(0, 6).map((p) => getImageUrl(p)),
              ].filter(Boolean);
              ld.textContent = JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Apartment',
                name: loadedProject.name,
                description: (loadedProject.description ?? '').slice(0, 500),
                url: window.location.href,
                image: galleryUrls,
                numberOfBedrooms: loadedProject.bedrooms || undefined,
                numberOfBathroomsTotal: loadedProject.bathrooms || undefined,
                floorSize:
                  loadedProject.area_m2 > 0
                    ? { '@type': 'QuantitativeValue', value: loadedProject.area_m2, unitCode: 'MTK' }
                    : undefined,
                address: loadedProject.location
                  ? { '@type': 'PostalAddress', addressLocality: loadedProject.location, addressCountry: 'ID' }
                  : undefined,
                offers:
                  loadedProject.investor_price > 0
                    ? {
                        '@type': 'Offer',
                        price: loadedProject.investor_price,
                        priceCurrency,
                        availability: 'https://schema.org/InStock',
                        url: window.location.href,
                      }
                    : undefined,
                provider: {
                  '@type': 'RealEstateAgent',
                  '@id': 'https://unrealstudiobali.com/#organization',
                  name: 'Unreal Studio Bali',
                  url: 'https://unrealstudiobali.com',
                },
              });
              document.head.appendChild(ld);

              // Cargar Proyectos Similares (Misma ubicación/zona)
              const { data: similarData } = await supabase
                .from('projects')
                .select('*')
                .eq('location', loadedProject.location) // Usamos location como zone
                .neq('id', loadedProject.id)
                .eq('is_hidden', false)
                .limit(3);
              
              if (similarData) {
                const safeSimilar = similarData.map((p: any) => ({
                    ...p,
                    gallery: parseJsonField(p.gallery, []),
                    investor_tiers: parseJsonField(p.investor_tiers, [])
                }));
                setSimilarProjects(safeSimilar as unknown as Project[]);
              }
           } else {
              console.error("Project not found for slug:", slug);
           }
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
    // Filtrar y convertir a URLs completas
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

  const tiersArray = useMemo(() => {
    if (!project || !project.investor_tiers) return [];
    return typeof project.investor_tiers === 'string'
        ? project.investor_tiers.split('\n').filter((t: string) => t.trim().length > 0)
        : parseJsonField(project.investor_tiers, []);
  }, [project]);

  const isClientLoggedIn = (): boolean => {
      const session = localStorage.getItem('_ust_client_');
      if (!session) return false;
      try {
          const decoded = atob(session);
          return decoded.startsWith('client_');
      } catch { return false; }
  };

  const handleClientLoginForDoc = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      setLoginLoading(true);
      try {
          const isEmail = loginEmail.includes('@');
          
          const { data, error } = await supabase.rpc('verify_client_login', {
              p_email: isEmail ? loginEmail : null,
              p_phone: !isEmail ? loginEmail : null,
              p_password: loginPassword
          });
          if (error || !data || !data.success) {
              setLoginError(t('fix.pd.wrongCredentials'));
              setLoginLoading(false);
              return;
          }
          const token = btoa(`client_${data.client_id}_${Date.now()}`);
          localStorage.setItem('_ust_client_', token);
          setShowClientLogin(false);
          setLoginEmail('');
          setLoginPassword('');
      } catch (err) {
          setLoginError(t('fix.pd.connectionError'));
      } finally {
          setLoginLoading(false);
      }
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-almond flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="text-primary font-bold text-xs uppercase tracking-widest animate-pulse">{t('projectDetail.loading')}</p>
          </div>
      );
  }

  if (!project) {
      return (
          <div className="min-h-screen bg-almond flex flex-col items-center justify-center p-6 text-center">
              <h1 className="text-4xl font-serif text-primary mb-4">{t('projectDetail.notFound')}</h1>
              <Link to="/proyectos" className="text-primary font-bold uppercase tracking-widest border-b border-primary text-xs">{t('projectDetail.backToProjects')}</Link>
          </div>
      );
  }

  return (
    <div className="bg-almond transition-colors duration-300 overflow-x-hidden text-left relative">
      {/* Lightbox Modal */}
      {lightbox.open && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4">
          <button onClick={() => setLightbox({ open: false, index: 0 })} className="absolute top-8 right-8 text-white z-[110] hover:scale-110 transition">
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>
          <button onClick={prevSlide} className="absolute left-4 md:left-8 text-white z-[110] bg-white/10 p-4 rounded-full hover:bg-white/20 transition">
            <span className="material-symbols-outlined text-4xl">arrow_back</span>
          </button>
          <img src={allImages[lightbox.index]} alt={project.name} onError={imgFallback(allImages[lightbox.index])} className="max-w-full max-h-[90vh] object-contain shadow-2xl animate-in zoom-in-95 duration-300" />
          <button onClick={nextSlide} className="absolute right-4 md:right-8 text-white z-[110] bg-white/10 p-4 rounded-full hover:bg-white/20 transition">
            <span className="material-symbols-outlined text-4xl">arrow_forward</span>
          </button>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 font-bold text-xs uppercase tracking-widest">
            {lightbox.index + 1} / {allImages.length}
          </div>
        </div>
      )}

      <section className="relative h-[75vh] w-full overflow-hidden">
        <img
          alt={project.name}
          className="absolute inset-0 w-full h-full object-cover"
          src={imgSrc(getImageUrl(project.image), 1600)}
          srcSet={imgSrcSet(getImageUrl(project.image), [600, 1000, 1400, 1800])}
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          onError={imgFallback(getImageUrl(project.image))}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5"></div>
        <div className="absolute inset-x-0 bottom-0 z-10">
          <div className="max-w-7xl mx-auto px-6 md:px-12 pb-10 md:pb-16">
            {project.property_type && (
              <p className="inline-flex items-center gap-2.5 text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-almond/80 mb-4">
                <span className="h-px w-8 bg-almond/50"></span>{project.property_type}
              </p>
            )}
            <h1 className="font-serif text-almond text-5xl md:text-7xl leading-[1.0] tracking-[-0.02em] mb-4 drop-shadow-lg max-w-3xl">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {project.location && (
                <div className="flex items-center text-almond/90 text-sm md:text-base font-semibold">
                  <span className="material-symbols-outlined text-base mr-1">location_on</span>
                  {project.location}
                </div>
              )}
              {project.tenure && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-black uppercase px-3 py-1 rounded-full ${(project.tenure||'').toLowerCase()==='freehold' ? 'bg-emerald-50 text-emerald-700' : 'bg-primary/10 text-primary/70'}`}><span className="material-symbols-outlined text-sm">key</span>{t(`projects.card.tenure.${(project.tenure||'').toLowerCase()}`, project.tenure)}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Role-aware pricing pill: only renders when user is logged in
          and has a role (lister/investor/admin). Sits above the public
          stats strip so partners see their personalized number first. */}
      {role && matchedUnitId && (
        <div className="max-w-7xl mx-auto px-6 md:px-12 -mt-4 mb-2 flex justify-end">
          <RolePricingBadge unitId={matchedUnitId} />
        </div>
      )}

      <div className="bg-almond border-y border-primary/10 relative z-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-7 md:py-10 flex flex-col md:flex-row md:items-center gap-7 md:gap-0">
          {(project.investor_price ?? 0) > 0 && (
            <div className="md:pr-12 md:mr-12 md:border-r border-primary/10 shrink-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/40 font-black mb-2.5">{t('projectDetail.kpiInvestorPrice')}</p>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl md:text-[3.25rem] leading-none font-serif text-primary tracking-[-0.02em]">{formatPrice(project.investor_price, project.price_currency)}</p>
                {(project.market_price ?? 0) > Number(project.investor_price) && (
                  <p className="text-base md:text-xl font-serif text-primary/30 line-through">{formatPrice(project.market_price, project.price_currency)}</p>
                )}
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-5 md:gap-12 flex-1">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/40 font-black mb-2.5">{t('projectDetail.kpiRoiRental')}</p>
              <p className="text-2xl md:text-[1.9rem] font-serif text-primary leading-none">{project.annual_rental_projection && project.investor_price ? ((project.annual_rental_projection / project.investor_price) * 100).toFixed(1) + '%' : (project.roi || '—')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/40 font-black mb-2.5">{t('projectDetail.kpiRoiResale')}</p>
              <p className="text-2xl md:text-[1.9rem] font-serif text-primary leading-none">{project.market_price && project.investor_price && project.investor_price > 0 ? (((project.market_price - project.investor_price) / project.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/40 font-black mb-2.5">{t('projectDetail.kpiStatus')}</p>
              <span className="inline-flex items-center gap-2 text-xs md:text-sm font-black uppercase tracking-wide text-primary leading-none pt-1">
                <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(project.status)}`}></span>{translateStatus(project.status, t)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-8 space-y-20">
          <section>
            <h2 className="text-4xl md:text-5xl text-primary mb-8 tracking-[-0.02em] flex items-center gap-4"><span className="h-px w-10 bg-primary/30 shrink-0"></span>{t('projectDetail.sectionProject')}</h2>
            {localizedDescription() && (
              <div className="prose prose-lg text-primary/80 font-light space-y-6 mb-12">
                <p>{localizedDescription()}</p>
              </div>
            )}
            {(() => {
              // Regla del dueño: un campo sin valor NO se muestra (ni card ni label).
              const specs = [
                project.distance_beach && { icon: 'beach_access', label: t('projectDetail.labelDistanceBeach'), value: project.distance_beach },
                project.tenure !== 'Freehold' && project.years_contract && { icon: 'history', label: t('projectDetail.labelYearsContract'), value: project.years_extension ? t('projectDetail.yearsExtValue', { base: project.years_contract, ext: project.years_extension }) : String(project.years_contract) },
                project.available_units && { icon: 'apartment', label: t('projectDetail.labelAvailableUnits'), value: t('projectDetail.unitsValue', { count: project.available_units }) },
                (project.completion_percent > 0) && { icon: 'construction', label: t('projectDetail.labelConstructionProgress'), value: t('projectDetail.completedValue', { pct: project.completion_percent }) },
              ].filter(Boolean) as { icon: string; label: string; value: string }[];
              return specs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {specs.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-primary/5">
                      <div className="bg-almond p-3 rounded-xl"><span className="material-symbols-outlined text-primary">{item.icon}</span></div>
                      <div>
                        <p className="text-[9px] uppercase font-black text-primary/45 tracking-widest">{item.label}</p>
                        <p className="font-bold text-primary text-sm">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              {project.bedrooms > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">bed</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelBedrooms')}</p>
                  <p className="text-lg font-bold text-primary">{project.bedrooms}</p>
                </div>
              )}
              {project.bathrooms > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">shower</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelBathrooms')}</p>
                  <p className="text-lg font-bold text-primary">{project.bathrooms}</p>
                </div>
              )}
              {project.area_m2 > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">straighten</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelArea')}</p>
                  <p className="text-lg font-bold text-primary">{project.area_m2} m²</p>
                </div>
              )}
              {project.furnishing && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">chair</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelFurnishing')}</p>
                  <p className="text-lg font-bold text-primary">{fmtFurnishing(project.furnishing)}</p>
                </div>
              )}
              {Number((project as any).land_area_m2) > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">landscape</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelLandArea')}</p>
                  <p className="text-lg font-bold text-primary">{(project as any).land_area_m2} m²</p>
                </div>
              )}
              {(project as any).view_type && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">visibility</span>
                  <p className="text-[9px] font-black text-primary/45 uppercase tracking-widest mt-2">{t('projectDetail.labelView')}</p>
                  <p className="text-lg font-bold text-primary">{(project as any).view_type}</p>
                </div>
              )}
            </div>
          </section>

          {/* Botones de Descarga en Columna Principal - MOVIDO AQUÍ PARA MAYOR VISIBILIDAD */}
          {(brochureFor(project, i18n.language) || (project.floor_plans && project.floor_plans.length > 0) || (project as any).walkthrough_url) && (
            <section className="bg-white p-8 rounded-3xl border border-primary/10 shadow-sm">
                <h3 className="text-2xl font-serif text-primary mb-6">{t('projectDetail.docsTitle')}</h3>
                <div className="flex flex-wrap gap-4">
                  {brochureFor(project, i18n.language) && (
                    <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-primary text-white px-6 py-5 rounded-2xl font-bold shadow-xl hover:brightness-110 hover:scale-[1.02] transition">
                      <span className="material-symbols-outlined">download</span>
                      {t('fix.pd.downloadBrochure')}
                    </a>
                  )}
                  {(project as any).walkthrough_url && (
                    <a href={(project as any).walkthrough_url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-almond text-primary border border-primary/10 px-6 py-5 rounded-2xl font-bold shadow-sm hover:bg-primary hover:text-white transition">
                      <span className="material-symbols-outlined">smart_display</span>
                      {t('projectDetail.videoTourBtn')}
                    </a>
                  )}
                  {/* Reporte de obra: NO se expone en la página pública (es privado y
                      específico de cada cliente). Se ve solo en el portal /cliente,
                      gateado por las propiedades que el cliente tiene asignadas. */}
                </div>
                
                {project.floor_plans && project.floor_plans.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-primary/10">
                    <h4 className="text-lg font-serif text-primary mb-4">{t('projectDetail.plansTitle')}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {project.floor_plans.map((pdf, idx) => (
                        <a key={idx} href={getImageUrl(pdf)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-almond/50 p-4 rounded-2xl border border-primary/10 hover:bg-primary/10 transition group">
                          <div className="bg-red-100 text-red-500 p-2 rounded-xl group-hover:scale-110 transition">
                            <span className="material-symbols-outlined">picture_as_pdf</span>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold text-primary truncate">{pdf.split('/').pop()}</p>
                            <p className="text-[10px] font-black uppercase text-primary/45 tracking-widest mt-1">{t('projectDetail.viewPdf')}</p>
                          </div>
                          <span className="material-symbols-outlined text-primary/45 group-hover:text-primary transition">open_in_new</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
            </section>
          )}

          {project.amenities && project.amenities.length > 0 && (
            <section>
              <h2 className="text-3xl md:text-4xl text-primary mb-8 tracking-[-0.02em] flex items-center gap-4"><span className="h-px w-10 bg-primary/30 shrink-0"></span>{t('projectDetail.servicesTitle')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(() => {
                  const intakeKeys = ['privatePool','sharedPool','garden','parking','security','gym','kitchen','ac','wifi','rooftop','oceanView','nearBeach','coworking','cleaning'];
                  const resolveLabel = (a: string) => (intakeKeys.indexOf(a) >= 0 ? t(`listingIntake.amenity.${a}`) : translateProjectTerm(a, i18n.language));
                  const seenAmen = new Set<string>();
                  const uniqueAmenities = (project.amenities as string[]).filter((a) => { const k = String(resolveLabel(a)).trim().toLowerCase(); if (!k || seenAmen.has(k)) return false; seenAmen.add(k); return true; });
                  return uniqueAmenities.map((amenity, idx) => {
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
                  // Fichas nuevas (alta por formulario) guardan amenities como CLAVES
                  // camelCase (privatePool, kitchen, ac…); las antiguas, etiquetas ES.
                  const intakeIcons = {
                    privatePool: 'pool', sharedPool: 'pool', garden: 'park', parking: 'local_parking',
                    security: 'shield', gym: 'fitness_center', kitchen: 'kitchen', ac: 'ac_unit',
                    wifi: 'wifi', rooftop: 'deck', oceanView: 'water', nearBeach: 'beach_access',
                    coworking: 'desktop_windows', cleaning: 'cleaning_services',
                  };
                  const isIntakeKey = Object.prototype.hasOwnProperty.call(intakeIcons, amenity);
                  const amenityIcon = isIntakeKey ? intakeIcons[amenity] : (icons[amenity] || 'check_circle');
                  const amenityLabel = isIntakeKey ? t(`listingIntake.amenity.${amenity}`) : translateProjectTerm(amenity, i18n.language);
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-primary/5">
                      <span className="material-symbols-outlined text-primary/40">{amenityIcon}</span>
                      <span className="text-sm font-medium text-primary">{amenityLabel}</span>
                    </div>
                  );
                  });
                })()}
              </div>
            </section>
          )}

          {project.furnishing_items && project.furnishing_items.length > 0 && (() => {
            const categories: Record<string, { icon: string, items: string[] }> = {
              'Baño': { icon: 'shower', items: ['Ducha', 'Grifería', 'Lavabo', 'Espejo de baño', 'Toallero', 'Mampara'] },
              'Instalaciones': { icon: 'electrical_services', items: ['Iluminación', 'Enchufes', 'Interruptores', 'Aire acondicionado', 'Ventilador de techo', 'Puertas', 'Topes de puerta'] },
              'Dormitorio': { icon: 'bed', items: ['Estructura de cama', 'Colchón', 'Mesilla de noche', 'Armario', 'Ropa de cama', 'Almohadas', 'Cortinas'] },
              'Salón': { icon: 'weekend', items: ['Sofá', 'Mesa de centro', 'Sillas', 'Estanterías', 'Alfombra', 'Cojines decorativos', 'Lámpara de pie'] },
              'Exterior': { icon: 'deck', items: ['Tumbonas de piscina', 'Mesa exterior', 'Sillas exterior', 'Sombrilla', 'Macetas'] },
              'Cocina': { icon: 'kitchen', items: ['Nevera', 'Microondas', 'Horno', 'Placa de cocción', 'Campana extractora', 'Fregadero', 'Cafetera', 'Tostadora', 'Hervidor', 'Batidora', 'Utensilios de cocina', 'Cubertería', 'Vajilla', 'Cristalería', 'Sartenes y ollas'] },
              'Decoración': { icon: 'palette', items: ['Cuadros', 'Jarrones', 'Plantas artificiales', 'Espejos decorativos'] }
            };
            const grouped = Object.entries(categories).filter(([_, cat]) => 
              cat.items.some(item => project.furnishing_items!.includes(item))
            );
            if (grouped.length === 0) return null;
            return (
              <section>
                <h2 className="text-3xl text-primary mb-8">{t('projectDetail.equipmentTitle')}</h2>
                <div className="space-y-6">
                  {grouped.map(([catName, cat]) => {
                    const activeItems = cat.items.filter(item => project.furnishing_items!.includes(item));
                    return (
                      <div key={catName}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-primary/30">{cat.icon}</span>
                          <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{translateProjectTerm(catName, i18n.language)}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {activeItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 shadow-sm border border-primary/5">
                              <span className="material-symbols-outlined text-primary/30 text-sm">check_circle</span>
                              <span className="text-sm font-medium text-primary">{translateProjectTerm(item, i18n.language)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}
          
          {showClientLogin && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowClientLogin(false); }}>
                <div className="bg-white w-full max-w-md rounded-3xl p-10 shadow-2xl">
                    <div className="text-center mb-8">
                        <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">lock</span>
                        <h2 className="text-xl font-serif text-primary mb-2">{t('projectDetail.investorAccessTitle')}</h2>
                        <p className="text-sm text-primary/50">{t('projectDetail.investorAccessBody')}</p>
                    </div>
                    {loginError && <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl mb-4 text-center">{loginError}</div>}
                    <form onSubmit={handleClientLoginForDoc} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-primary/45 tracking-widest mb-2">{t('projectDetail.emailOrPhone')}</label>
                            <input type="text" required name="email" id="report-email" autoComplete="username" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder={t('fix.pd.emailOrPhonePlaceholder')} className="w-full px-5 py-4 bg-almond/50 border border-primary/15 rounded-2xl font-bold focus:border-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-primary/45 tracking-widest mb-2">{t('projectDetail.password')}</label>
                            <div className="relative">
                              <input type={showLoginPw ? 'text' : 'password'} required name="password" id="report-password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-5 py-4 pr-12 bg-almond/50 border border-primary/15 rounded-2xl font-bold focus:border-primary focus:outline-none" />
                              <button type="button" onClick={() => setShowLoginPw((v) => !v)} aria-label={showLoginPw ? t('fix.pd.hidePassword') : t('fix.pd.showPassword')} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary p-1">
                                <span className="material-symbols-outlined text-xl">{showLoginPw ? 'visibility_off' : 'visibility'}</span>
                              </button>
                            </div>
                        </div>
                        <button type="submit" disabled={loginLoading} className="w-full bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2">
                            {loginLoading ? <><span className="material-symbols-outlined animate-spin text-sm">refresh</span> {t('fix.pd.verifying')}</> : t('fix.pd.accessReport')}
                        </button>
                    </form>

                    <button onClick={() => setShowClientLogin(false)} className="w-full mt-4 text-primary/40 hover:text-primary text-xs font-bold uppercase tracking-widest py-2 transition">{t('projectDetail.close')}</button>
                    <p className="text-center text-[10px] text-primary/30 mt-6">{t('projectDetail.noAccess')}</p>
                </div>
            </div>
          )}

          {project.google_maps_url && (() => {
            const getEmbedUrl = (url: string): string | null => {
              if (!url) return null;
              if (url.includes('/maps/embed')) return url;
              if (url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps')) {
                return null;
              }
              const placeMatch = url.match(/place\/([^\/]+)/);
              if (placeMatch) {
                const query = encodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${query}`;
              }
              const coordMatch = url.match(/@?(-?\d+\.\d+),(-?\d+\.\d+)/);
              if (coordMatch) {
                // modo 'place' con q=lat,lng SÍ pinta el pin; 'view' con center= NO lo pintaba.
                return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${coordMatch[1]},${coordMatch[2]}&zoom=16`;
              }
              const qMatch = url.match(/[?&]q=([^&]+)/);
              if (qMatch) {
                return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${qMatch[1]}`;
              }
              return null;
            };

            const embedUrl = getEmbedUrl(project.google_maps_url);
            const isShortLink = project.google_maps_url.includes('maps.app.goo.gl') || project.google_maps_url.includes('goo.gl/maps');

            return (
              <section className="mt-12">
                <h2 className="text-3xl text-primary mb-8">{t('projectDetail.locationTitle')}</h2>
                {embedUrl ? (
                  <LazyMap
                    embedUrl={embedUrl}
                    className="rounded-2xl overflow-hidden shadow-lg border border-primary/5"
                  />
                ) : (
                  <div className="rounded-2xl overflow-hidden shadow-lg border border-primary/5 bg-primary/10 flex items-center justify-center" style={{height: '400px'}}>
                    <a href={project.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-3 text-primary/50 hover:text-primary transition">
                      <span className="material-symbols-outlined text-4xl">map</span>
                      <span className="text-sm font-bold uppercase tracking-widest">{t('projectDetail.viewOnMaps')}</span>
                      {isShortLink && <span className="text-[9px] text-primary/30">{t('projectDetail.shortLinkWarning')}</span>}
                    </a>
                  </div>
                )}
              </section>
            );
          })()}

          {/* Inline GHL booking iframe removed — it was capturing wheel events
              and breaking page scroll. The "Agendar llamada" CTAs in the
              Navbar (and the floating button) now open the calendar in a
              new tab with full UTM passthrough via lib/bookingLink.ts.
              Marcelino: gallery should appear before timeline. */}

          {tiersArray && tiersArray.length > 0 && (
            <section className="bg-white p-8 md:p-12 rounded-3xl border border-primary/5 shadow-sm">
              <h3 className="text-3xl md:text-4xl text-primary mb-8 tracking-[-0.02em] flex items-center gap-4"><span className="h-px w-10 bg-primary/30 shrink-0"></span>{t('projectDetail.investmentStructureTitle')}</h3>
              <div className="space-y-1">
                {tiersArray.map((tier: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 py-4 border-b border-primary/10 last:border-0">
                    <span className="font-serif text-primary/30 text-lg leading-none tabular-nums shrink-0 w-7">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="text-primary/80 font-medium">{tier}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {project.construction_gallery && project.construction_gallery.length > 0 && (
            <section>
              <h3 className="text-3xl md:text-4xl text-primary mb-8 text-left tracking-[-0.02em] flex items-center gap-3">
                <span className="material-symbols-outlined text-primary/40 text-4xl">construction</span>
                {t('projectDetail.constructionProgressTitle')}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {project.construction_gallery.map((img, idx) => {
                  // Find the index of this image in the allImages array for the lightbox
                  const globalIdx = allImages.findIndex(url => url === getImageUrl(img));
                  return (
                    <div 
                      key={idx} 
                      onClick={() => globalIdx !== -1 && setLightbox({ open: true, index: globalIdx })}
                      className="relative rounded-2xl overflow-hidden shadow-sm group cursor-pointer aspect-square border border-primary/10"
                    >
                      <img
                        loading="lazy"
                        alt={t('fix.pd.constructionProgressAlt', { n: idx + 1 })}
                        className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-105"
                        src={imgSrc(getImageUrl(img), 600)}
                        srcSet={imgSrcSet(getImageUrl(img), [320, 600, 900])}
                        sizes="(max-width: 768px) 50vw, 33vw"
                        onError={imgFallback(getImageUrl(img))}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-end p-3">
                        <span className="material-symbols-outlined text-white/95 text-lg bg-white/15 backdrop-blur-md rounded-full p-1.5 translate-y-1 group-hover:translate-y-0 transition-transform duration-500">zoom_in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-3xl md:text-4xl text-primary mb-8 text-left tracking-[-0.02em] flex items-center gap-4"><span className="h-px w-10 bg-primary/30 shrink-0"></span>{t('projectDetail.galleryTitle')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setLightbox({ open: true, index: idx })}
                  className={`relative rounded-2xl overflow-hidden shadow-lg group cursor-pointer ${idx === 0 ? 'md:col-span-2 md:row-span-2 aspect-video' : 'aspect-square'}`}
                >
                  <img
                    loading="lazy"
                    alt={t('fix.pd.galleryImageAlt', { name: project.name, n: idx + 1 })}
                    className="absolute inset-0 w-full h-full object-cover transition duration-[900ms] ease-out group-hover:scale-[1.06]"
                    src={imgSrc(img, 800)}
                    srcSet={imgSrcSet(img, [400, 800, 1200])}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    onError={imgFallback(img)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-end p-4">
                    <span className="material-symbols-outlined text-white/95 text-xl bg-white/15 backdrop-blur-md rounded-full p-2 translate-y-1 group-hover:translate-y-0 transition-transform duration-500">zoom_in</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Timeline/hitos del proyecto OCULTOS en la web pública (decisión de
              Andreas: las fechas de entrega podían dar a entender compromisos que
              cambian por delays y preocupaban a clientes). Se gestiona/visualiza
              solo en el admin, dentro de la ficha de la propiedad. */}
        </div>

        <div className="lg:col-span-4 relative">
          {/* Sticky sidebar follows the reader on desktop. max-h + overflow-auto
              guarantees the panel fits the viewport when its content is taller
              than the screen — without that, sticky never engages because the
              element's bottom never enters view before the parent ends. */}
          <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto space-y-6 [scrollbar-width:thin]">
            <div className="bg-white p-8 rounded-2xl shadow-2xl border border-primary/5 text-left">
              <h3 className="text-2xl font-serif text-primary mb-8 pb-4 border-b border-primary/10">{t('projectDetail.assetSummary')}</h3>
              <div className="space-y-8 mb-10">
                {project.completion_percent > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-primary/55 mb-3 uppercase tracking-wider">
                    <span>{t('projectDetail.labelConstructionProgress')}</span>
                    <span className="text-primary">{project.completion_percent}%</span>
                  </div>
                  <div className="w-full bg-primary/10 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${project.completion_percent}%` }}></div>
                  </div>
                </div>
                )}

                {/* Nuevo bloque de datos extra en sidebar */}
                <div>
                    {project.bedrooms > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelBedrooms')}</span><span className="text-sm font-bold">{project.bedrooms}</span></div>}
                    {project.bathrooms > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelBathrooms')}</span><span className="text-sm font-bold">{project.bathrooms}</span></div>}
                    {project.area_m2 > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelArea')}</span><span className="text-sm font-bold">{project.area_m2} m²</span></div>}
                    {project.furnishing && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelFurnishing')}</span><span className="text-sm font-bold">{fmtFurnishing(project.furnishing)}</span></div>}
                    {project.has_pool && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelPool')}</span><span className="text-sm font-bold">{t('projectDetail.yes')}</span></div>}
                    {project.completion_date && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelCompletion')}</span><span className="text-sm font-bold">{formatDate(project.completion_date)}</span></div>}
                </div>

                {(() => {
                  const rental = (project.annual_rental_projection && project.investor_price) ? ((project.annual_rental_projection / project.investor_price) * 100).toFixed(1) + '%' : null;
                  const resale = (project.market_price && project.investor_price && project.investor_price > 0) ? (((project.market_price - project.investor_price) / project.investor_price) * 100).toFixed(1) + '%' : null;
                  return (rental || resale) ? (
                    <div className="space-y-3">
                      {rental && (
                        <div className="flex justify-between text-[11px] font-bold text-primary/55 uppercase tracking-wider">
                          <span>{t('projectDetail.kpiRoiRental')}</span>
                          <span className="text-primary">{rental}</span>
                        </div>
                      )}
                      {resale && (
                        <div className="flex justify-between text-[11px] font-bold text-primary/55 uppercase tracking-wider">
                          <span>{t('projectDetail.kpiRoiResale')}</span>
                          <span className="text-primary">{resale}</span>
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Botones en Sidebar */}
                {brochureFor(project, i18n.language) && (
                  <div className="pt-6 border-t border-primary/10 space-y-3">
                    {brochureFor(project, i18n.language) && (
                      <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-almond/50 hover:bg-primary hover:text-white text-primary py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition group w-full">
                        <span className="material-symbols-outlined text-sm">download</span> {t('projectDetail.downloadBrochure')}
                      </a>
                    )}
                    {/* Reporte de obra: privado → solo en el portal /cliente, gateado por asignación. */}
                  </div>
                )}
              </div>
              <a
                href={`mailto:hello@unrealstudiobali.com?subject=${encodeURIComponent(t('fix.pd.mailSubject', { name: project.name, defaultValue: 'Información: {{name}}' }))}&body=${encodeURIComponent(t('fix.pd.mailBody', { name: project.name, location: project.location || '', defaultValue: 'Hola, me interesa el proyecto "{{name}}" en {{location}}. Me gustaría recibir más información y agendar una reunión.' }))}`}
                className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 hover:brightness-110 transition"
              >
                {t('fix.pd.requestProjectInfo')}
              </a>
            </div>
          </div>
        </div>
      </main>

      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-t border-primary/10">
        <h3 className="text-3xl text-primary mb-12 text-left">{t('projectDetail.similarTitle')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {similarProjects.map((similar) => (
            <Link key={similar.id} to={projectPath(similar)} className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition flex flex-col group border border-primary/5">
              <div className="h-48 overflow-hidden relative">
                <img
                  loading="lazy"
                  alt={similar.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                  src={imgSrc(getImageUrl(similar.image), 500)}
                  srcSet={imgSrcSet(getImageUrl(similar.image), [320, 500, 800])}
                  sizes="(max-width: 768px) 50vw, 33vw"
                  onError={imgFallback(getImageUrl(similar.image))}
                />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-black/35 backdrop-blur-md text-white border border-white/20 text-[8px] font-black px-3 py-1.5 uppercase tracking-widest rounded-full shadow-lg"><span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(similar.status)}`} />{translateStatus(similar.status, t)}</span>
              </div>
              <div className="p-6 text-left">
                <h4 className="text-lg font-bold text-primary mb-2 truncate">{similar.name}</h4>
                <p className="text-[10px] font-black uppercase text-primary/45 tracking-widest mb-4">{similar.location}</p>
                <div className="flex justify-between items-center pt-4 border-t border-primary/10">
                  <p className="font-bold text-primary">{(similar.investor_price ?? 0) > 0 ? formatPrice(similar.investor_price, similar.price_currency) : t('projectDetail.consult')}</p>
                  <span className="material-symbols-outlined text-primary group-hover:translate-x-1 transition">arrow_forward</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProjectDetail;