import React, { useMemo, useEffect, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { translateProjectTerm } from '../lib/projectTerms';
import { brochureFor } from '../lib/brochure';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, WHATSAPP_URL, PUBLIC_PROJECT_COLS } from '../constants';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, imgFallback } from '../lib/imageOptimize';
import RolePricingBadge from '../components/RolePricingBadge';
import ProjectTimeline, { TimelinePhase } from '../components/ProjectTimeline';
import BookingWidget from '../components/BookingWidget';
import LazyMap from '../components/LazyMap';
import { isFinished, deliveryText } from '../lib/deliveryDate';
import { resolveCanonicalSlug, projectSeoSlug, projectPath } from '../lib/projectUrl';
import { trackViewContent } from '../lib/fbPixel';
import { gtmViewItem } from '../lib/gtm';
import { translateStatus } from '../lib/statusI18n';
import { statusDotClass } from '../lib/statusColor';
import { useAuth } from '../lib/auth-context';
import Reveal from '../components/Reveal';
import ProjectCard from '../components/ProjectCard';
import PageLoader from '../components/PageLoader';
import InlineNotFound from '../components/InlineNotFound';

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
             .select(PUBLIC_PROJECT_COLS)
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
                 .select(PUBLIC_PROJECT_COLS)
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
                .select(PUBLIC_PROJECT_COLS)
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
      return <PageLoader label={t('projectDetail.loading')} />;
  }

  if (!project) {
      return (
          <InlineNotFound
            title={t('projectDetail.notFound')}
            backTo="/proyectos"
            backLabel={t('projectDetail.backToProjects')}
            icon="villa"
          />
      );
  }

  return (
    <div className="bg-almond transition-colors duration-300 overflow-x-hidden text-left relative">
      {/* Lightbox Modal */}
      {lightbox.open && (
        <div className="fixed inset-0 z-[100] bg-primary/[0.97] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button onClick={() => setLightbox({ open: false, index: 0 })} className="absolute top-8 right-8 text-white z-[110] hover:scale-110 transition">
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>
          <button onClick={prevSlide} className="absolute left-3 md:left-8 text-almond z-[110] w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full border border-almond/25 hover:bg-almond hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-2xl">arrow_back</span>
          </button>
          <img src={allImages[lightbox.index]} alt={project.name} onError={imgFallback(allImages[lightbox.index])} className="max-w-full max-h-[90vh] object-contain shadow-2xl animate-in zoom-in-95 duration-300" />
          <button onClick={nextSlide} className="absolute right-3 md:right-8 text-almond z-[110] w-12 h-12 md:w-14 md:h-14 flex items-center justify-center rounded-full border border-almond/25 hover:bg-almond hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-2xl">arrow_forward</span>
          </button>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-almond/60 us-label us-num">
            {lightbox.index + 1} / {allImages.length}
          </div>
        </div>
      )}

      <section className="relative min-h-[88svh] md:min-h-[100svh] w-full overflow-hidden bg-primary flex flex-col justify-end">
        <div className="absolute inset-0 us-curtain">
          <img
            alt={project.name}
            className="absolute inset-0 w-full h-full object-cover"
            src={imgSrc(getImageUrl(project.image), 1800)}
            srcSet={imgSrcSet(getImageUrl(project.image), [800, 1200, 1600, 2200])}
            sizes="100vw"
            loading="eager"
            fetchPriority="high"
            onError={imgFallback(getImageUrl(project.image))}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,27,22,0.5)_0%,rgba(30,27,22,0)_28%,rgba(30,27,22,0)_45%,rgba(30,27,22,0.85)_100%)]" aria-hidden="true"></div>
        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-5 md:px-12 pb-8 md:pb-12 pt-32">
          <Link to="/proyectos" className="us-link text-almond/80 hover:text-almond mb-8 md:mb-10 us-rise" style={{ animationDelay: '400ms' }}>
            <span className="material-symbols-outlined text-base">arrow_back</span>{t('projectDetail.backToProjects')}
          </Link>
          <h1 className="font-display uppercase text-almond text-[2.5rem] leading-[0.95] sm:text-6xl md:text-7xl xl:text-[6rem] xl:leading-[0.92] max-w-5xl us-rise" style={{ animationDelay: '550ms' }}>{project.name}</h1>
          <div className="mt-8 md:mt-10 pt-5 border-t border-almond/20 flex flex-wrap items-center gap-x-8 gap-y-3 us-label text-almond/75 us-rise" style={{ animationDelay: '750ms' }}>
            {project.property_type && <span>{project.property_type}</span>}
            {project.location && (
              <span className="inline-flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-clay-light">location_on</span>{project.location}</span>
            )}
            {project.tenure && (
              <span className="inline-flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px] text-clay-light">key</span>{t(`projects.card.tenure.${(project.tenure||'').toLowerCase()}`, project.tenure)}</span>
            )}
            <span className="inline-flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(project.status)}`} />{translateStatus(project.status, t)}</span>
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

      <div className="bg-primary text-almond relative z-10">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 py-8 md:py-12 grid grid-cols-2 lg:grid-cols-12 gap-y-8 gap-x-6">
          {(project.investor_price ?? 0) > 0 && (
            <div className="col-span-2 lg:col-span-5 lg:pr-10 lg:border-r border-almond/15">
              <p className="us-label text-almond/50">{t('projectDetail.kpiInvestorPrice')}</p>
              <div className="flex items-baseline gap-3 mt-3 flex-wrap">
                <p className="font-display text-5xl md:text-6xl xl:text-7xl leading-none us-num">{formatPrice(project.investor_price, project.price_currency)}</p>
                {(project.market_price ?? 0) > Number(project.investor_price) && (
                  <p className="text-lg md:text-xl text-almond/40 line-through us-num">{formatPrice(project.market_price, project.price_currency)}</p>
                )}
              </div>
            </div>
          )}
          <div className="lg:col-span-3 lg:pl-4">
            <p className="us-label text-almond/50">{t('projectDetail.kpiRoiRental')}</p>
            <p className="font-display text-4xl md:text-5xl leading-none mt-3 text-clay-light us-num">{project.annual_rental_projection && project.investor_price ? ((project.annual_rental_projection / project.investor_price) * 100).toFixed(1) + '%' : (project.roi || '—')}</p>
          </div>
          <div className="lg:col-span-3">
            <p className="us-label text-almond/50">{t('projectDetail.kpiRoiResale')}</p>
            <p className="font-display text-4xl md:text-5xl leading-none mt-3 us-num">{project.market_price && project.investor_price && project.investor_price > 0 ? (((project.market_price - project.investor_price) / project.investor_price) * 100).toFixed(1) + '%' : '—'}</p>
          </div>
        </div>
      </div>

      <main className="max-w-[1440px] mx-auto px-5 md:px-12 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-16">
        <div className="lg:col-span-8 space-y-20">
          <section>
            <h2 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.sectionProject')}</h2>
            {localizedDescription() && (
              <div className="text-lg md:text-xl leading-relaxed text-primary/75 space-y-6 mb-12 max-w-[65ch]">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 border-b border-primary/15">
                  {specs.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 py-5 border-t border-primary/15">
                      <span className="material-symbols-outlined text-[26px] text-clay">{item.icon}</span>
                      <div>
                        <p className="us-label text-primary/45">{item.label}</p>
                        <p className="font-medium text-primary text-base mt-0.5">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null;
            })()}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-primary/15 border border-primary/15 mt-10">
              {project.bedrooms > 0 && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">bed</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelBedrooms')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{project.bedrooms}</p>
                </div>
              )}
              {project.bathrooms > 0 && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">shower</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelBathrooms')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{project.bathrooms}</p>
                </div>
              )}
              {project.area_m2 > 0 && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">straighten</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelArea')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{project.area_m2} m²</p>
                </div>
              )}
              {project.furnishing && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">chair</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelFurnishing')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{fmtFurnishing(project.furnishing)}</p>
                </div>
              )}
              {Number((project as any).land_area_m2) > 0 && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">landscape</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelLandArea')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{(project as any).land_area_m2} m²</p>
                </div>
              )}
              {(project as any).view_type && (
                <div className="bg-almond p-5 md:p-6 text-left">
                  <span className="material-symbols-outlined text-clay text-2xl">visibility</span>
                  <p className="us-label text-primary/45 mt-3">{t('projectDetail.labelView')}</p>
                  <p className="font-display text-2xl md:text-3xl text-primary mt-1 us-num">{(project as any).view_type}</p>
                </div>
              )}
            </div>
          </section>

          {/* Botones de Descarga en Columna Principal - MOVIDO AQUÍ PARA MAYOR VISIBILIDAD */}
          {(brochureFor(project, i18n.language) || (project.floor_plans && project.floor_plans.length > 0) || (project as any).walkthrough_url) && (
            <section className="bg-paper p-6 md:p-10 border border-primary/15">
                <h3 className="font-serif text-2xl md:text-3xl text-primary mb-6">{t('projectDetail.docsTitle')}</h3>
                <div className="flex flex-wrap gap-4">
                  {brochureFor(project, i18n.language) && (
                    <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="us-btn flex-1 min-w-[200px]">
                      <span className="material-symbols-outlined">download</span>
                      {t('fix.pd.downloadBrochure')}
                    </a>
                  )}
                  {(project as any).walkthrough_url && (
                    <a href={(project as any).walkthrough_url} target="_blank" rel="noopener noreferrer" className="us-btn us-btn-ghost text-primary flex-1 min-w-[200px] hover:!text-almond hover:!bg-primary">
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
                        <a key={idx} href={getImageUrl(pdf)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-almond p-4 border border-primary/15 hover:border-primary/40 transition-colors group">
                          <div className="text-clay p-1">
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
              <h2 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.servicesTitle')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-10 md:gap-x-14 gap-y-0 border-b border-primary/10">
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
                    // Fila editorial tipo "índice de revista": hairline superior,
                    // icono en marrón de marca, label refinado, hover cálido (taste §5/§6).
                    <div key={idx} className="group flex items-center gap-3.5 py-3.5 border-t border-primary/10 transition-colors duration-300 hover:border-primary/25">
                      <span className="material-symbols-outlined text-[20px] text-primary/50 group-hover:text-primary transition-colors duration-300">{amenityIcon}</span>
                      <span className="text-[13px] md:text-sm font-medium tracking-tight text-primary/75 group-hover:text-primary transition-colors duration-300">{amenityLabel}</span>
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
                <h2 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.equipmentTitle')}</h2>
                <div className="space-y-6">
                  {grouped.map(([catName, cat]) => {
                    const activeItems = cat.items.filter(item => project.furnishing_items!.includes(item));
                    return (
                      <div key={catName}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-primary/30">{cat.icon}</span>
                          <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">{translateProjectTerm(catName, i18n.language)}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-10 md:gap-x-14 gap-y-0 border-b border-primary/10">
                          {activeItems.map((item, idx) => (
                            <div key={idx} className="group flex items-center gap-3 py-3 border-t border-primary/10 transition-colors duration-300 hover:border-primary/25">
                              <span className="material-symbols-outlined text-primary/35 text-[18px] group-hover:text-primary/70 transition-colors duration-300">check_circle</span>
                              <span className="text-[13px] md:text-sm font-medium tracking-tight text-primary/75 group-hover:text-primary transition-colors duration-300">{translateProjectTerm(item, i18n.language)}</span>
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
                <div className="bg-paper w-full max-w-md p-8 md:p-10 shadow-2xl border border-primary/15">
                    <div className="text-center mb-8">
                        <span className="material-symbols-outlined text-4xl text-primary/20 mb-4">lock</span>
                        <h2 className="text-xl font-serif text-primary mb-2">{t('projectDetail.investorAccessTitle')}</h2>
                        <p className="text-sm text-primary/50">{t('projectDetail.investorAccessBody')}</p>
                    </div>
                    {loginError && <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl mb-4 text-center">{loginError}</div>}
                    <form onSubmit={handleClientLoginForDoc} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase text-primary/45 tracking-widest mb-2">{t('projectDetail.emailOrPhone')}</label>
                            <input type="text" required name="email" id="report-email" autoComplete="username" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder={t('fix.pd.emailOrPhonePlaceholder')} className="w-full px-5 py-4 bg-white border border-primary/15 rounded-[3px] font-medium focus:border-clay focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase text-primary/45 tracking-widest mb-2">{t('projectDetail.password')}</label>
                            <div className="relative">
                              <input type={showLoginPw ? 'text' : 'password'} required name="password" id="report-password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-5 py-4 pr-12 bg-white border border-primary/15 rounded-[3px] font-medium focus:border-clay focus:outline-none" />
                              <button type="button" onClick={() => setShowLoginPw((v) => !v)} aria-label={showLoginPw ? t('fix.pd.hidePassword') : t('fix.pd.showPassword')} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary/40 hover:text-primary p-1">
                                <span className="material-symbols-outlined text-xl">{showLoginPw ? 'visibility_off' : 'visibility'}</span>
                              </button>
                            </div>
                        </div>
                        <button type="submit" disabled={loginLoading} className="us-btn w-full disabled:opacity-50">
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
              // Las COORDENADAS (@lat,lng) mandan: son precisas. Antes se usaba
              // primero el nombre del sitio (place/The+Nook) y Google no lo
              // geocodificaba → el mapa salía con el MUNDO ENTERO. Con q=lat,lng
              // el pin cae exacto. (modo 'place' con q=lat,lng SÍ pinta el pin.)
              const coordMatch = url.match(/@?(-?\d+\.\d+),(-?\d+\.\d+)/);
              if (coordMatch) {
                return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${coordMatch[1]},${coordMatch[2]}&zoom=16`;
              }
              const placeMatch = url.match(/place\/([^\/]+)/);
              if (placeMatch) {
                const query = encodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                return `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${query}`;
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
                <h2 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.locationTitle')}</h2>
                {embedUrl ? (
                  <LazyMap
                    embedUrl={embedUrl}
                    className="overflow-hidden border border-primary/15"
                  />
                ) : (
                  <div className="overflow-hidden border border-primary/15 bg-paper flex items-center justify-center" style={{height: '400px'}}>
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
            <section className="border-t border-primary/15 pt-10">
              <h3 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.investmentStructureTitle')}</h3>
              <div className="space-y-1">
                {tiersArray.map((tier: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-4 py-4 border-b border-primary/10 last:border-0">
                    <span className="font-display text-clay text-xl leading-none tabular-nums shrink-0 w-9">{String(idx + 1).padStart(2, '0')}</span>
                    <span className="text-primary/80 font-medium">{tier}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {project.construction_gallery && project.construction_gallery.length > 0 && (
            <section>
              <h3 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">
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
                      className="relative overflow-hidden group cursor-pointer aspect-square bg-primary/10"
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
                      <div className="absolute inset-0 bg-primary/35 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-end p-3">
                        <span className="material-symbols-outlined text-lg bg-almond text-primary rounded-full p-1.5 translate-y-1 group-hover:translate-y-0 transition-transform duration-500">zoom_in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <Reveal as="section">
            <h3 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-8 md:mb-10">{t('projectDetail.galleryTitle')}</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {allImages.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setLightbox({ open: true, index: idx })}
                  className={`relative overflow-hidden group cursor-pointer bg-primary/10 ${idx === 0 ? 'col-span-2 lg:row-span-2 aspect-[4/3] lg:aspect-auto' : 'aspect-square'}`}
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
                  <div className="absolute inset-0 bg-primary/35 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-end p-4">
                    <span className="material-symbols-outlined text-xl bg-almond text-primary rounded-full p-2 translate-y-1 group-hover:translate-y-0 transition-transform duration-500">zoom_in</span>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

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
          <div className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto space-y-6 [scrollbar-width:thin]">
            <div className="bg-paper p-6 md:p-8 border border-primary/15 text-left">
              <h3 className="font-serif text-2xl text-primary mb-6 pb-4 border-b border-primary/15">{t('projectDetail.assetSummary')}</h3>
              <div className="space-y-8 mb-10">
                {project.completion_percent > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-primary/55 mb-3 uppercase tracking-wider">
                    <span>{t('projectDetail.labelConstructionProgress')}</span>
                    <span className="text-primary">{project.completion_percent}%</span>
                  </div>
                  <div className="w-full bg-primary/10 h-[3px] overflow-hidden">
                    <div className="bg-clay h-full transition-all duration-1000" style={{ width: `${project.completion_percent}%` }}></div>
                  </div>
                </div>
                )}

                {/* Nuevo bloque de datos extra en sidebar */}
                <div>
                    {project.bedrooms > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelBedrooms')}</span><span className="text-sm font-semibold us-num">{project.bedrooms}</span></div>}
                    {project.bathrooms > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelBathrooms')}</span><span className="text-sm font-semibold us-num">{project.bathrooms}</span></div>}
                    {project.area_m2 > 0 && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelArea')}</span><span className="text-sm font-semibold us-num">{project.area_m2} m²</span></div>}
                    {project.furnishing && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelFurnishing')}</span><span className="text-sm font-semibold us-num">{fmtFurnishing(project.furnishing)}</span></div>}
                    {project.has_pool && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelPool')}</span><span className="text-sm font-semibold us-num">{t('projectDetail.yes')}</span></div>}
                    {!isFinished(project.status) && project.completion_date && <div className="flex justify-between py-2 border-b border-primary/10"><span className="text-xs text-primary/50">{t('projectDetail.labelCompletion')}</span><span className="text-sm font-semibold us-num">{deliveryText(formatDate(project.completion_date), t('projects.card.deliveryFrom'))}</span></div>}
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
                      <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="us-btn us-btn-ghost text-primary w-full hover:!bg-primary hover:!text-almond">
                        <span className="material-symbols-outlined text-sm">download</span> {t('projectDetail.downloadBrochure')}
                      </a>
                    )}
                    {/* Reporte de obra: privado → solo en el portal /cliente, gateado por asignación. */}
                  </div>
                )}
              </div>
              <a
                href={`mailto:hello@unrealstudiobali.com?subject=${encodeURIComponent(t('fix.pd.mailSubject', { name: project.name, defaultValue: 'Información: {{name}}' }))}&body=${encodeURIComponent(t('fix.pd.mailBody', { name: project.name, location: project.location || '', defaultValue: 'Hola, me interesa el proyecto "{{name}}" en {{location}}. Me gustaría recibir más información y agendar una reunión.' }))}`}
                className="us-btn w-full"
              >
                {t('fix.pd.requestProjectInfo')}
              </a>
            </div>
          </div>
        </div>
      </main>

      {similarProjects.length > 0 && (
        <section className="bg-paper py-16 md:py-24">
          <div className="max-w-[1440px] mx-auto px-5 md:px-12">
            <h2 className="font-display uppercase text-[2rem] leading-[0.95] md:text-5xl text-primary mb-10 md:mb-14">{t('projectDetail.similarTitle')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 lg:gap-x-8 gap-y-14">
              {similarProjects.map((similar) => (
                <ProjectCard key={similar.id} project={similar} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default ProjectDetail;