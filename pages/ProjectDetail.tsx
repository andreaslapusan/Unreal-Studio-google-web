import React, { useMemo, useEffect, useState } from 'react';
import { uiLocale } from '../lib/dateLocale';
import { dateOnly } from '../lib/timezone';
import { translateProjectTerm, amenityLabel, amenityIcon, normalizeAmenities, localizedField, localizedCompletion, propertyTypeLabel } from '../lib/projectTerms';
import { brochureFor } from '../lib/brochure';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_CONFIG, whatsappProjectUrl, PUBLIC_PROJECT_COLS } from '../constants';
import { Project, AppConfig } from '../types';
import { useCurrency } from '../App';
import { supabase, getImageUrl, parseJsonField } from '../lib/supabase';
import { imgSrc, imgSrcSet, thumbSrc, imgFallback } from '../lib/imageOptimize';
import RolePricingBadge from '../components/RolePricingBadge';
import ProjectTimeline, { TimelinePhase } from '../components/ProjectTimeline';
import LazyMap from '../components/LazyMap';
import ConstructionReportButton from '../components/ConstructionReportButton';
import { isFinished, deliveryText } from '../lib/deliveryDate';
import { fmtThousands } from '../lib/numberFormat';
import { resolveCanonicalSlug, projectSeoSlug, projectPath } from '../lib/projectUrl';
import { trackViewContent, trackLead } from '../lib/fbPixel';
import { gtmViewItem, gtmWhatsappClick } from '../lib/gtm';
import { translateStatus } from '../lib/statusI18n';
import { useAuth } from '../lib/auth-context';
import { usePageMeta } from '../components/PageMeta';
import seoMap from '../content/seo/projects.json';

// Nombre visible de un plano: el del fichero si es legible; si es un id autogenerado
// (subidas "1791014938804-jtm08y.pdf") o un enlace Drive (".../preview") → "Plano N".
const floorPlanLabel = (url: string, idx: number, t: (k: string, o?: any) => string) => {
  let raw = (url.split('?')[0].split('/').pop() || '');
  try { raw = decodeURIComponent(raw); } catch { /* nombre tal cual */ }
  raw = raw.replace(/\.pdf$/i, '');
  const auto = !raw || /^(preview|view|edit)$/i.test(raw) || /^\d{8,}/.test(raw) || /^[0-9a-f-]{16,}$/i.test(raw);
  return auto ? t('projectDetail.planN', { n: idx + 1 }) : raw;
};

// 3 preguntas de la ficha. Réplica en scripts/prerender-og.mjs (projectFaq): mantener sincronizado.
const projectFaq = (p: Project, t: (k: string, o?: any) => string): [string, string][] => {
  const name = p.name;
  const years = Number((p as any).years_contract) || 0;
  const tenure = String((p as any).tenure || '');
  const out: [string, string][] = [];
  if (years > 0) out.push([t('projectDetail.faq.tenureQ', { name }), t(/freehold/i.test(tenure) && /leasehold/i.test(tenure) ? 'projectDetail.faq.tenureBothA' : 'projectDetail.faq.tenureLeaseholdA', { years })]);
  out.push([t('projectDetail.faq.payQ'), t(isFinished(p.status) ? 'projectDetail.faq.payDoneA' : 'projectDetail.faq.payBuildA')]);
  out.push([t('projectDetail.faq.remoteQ'), t('projectDetail.faq.remoteA')]);
  return out;
};

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
  // si es texto libre, usa la columna traducida (furnishing_en/ro/id).
  const fmtFurnishing = (v: string) => {
    const map: Record<string, string> = {
      semi: t('listingIntake.semiFurnished'),
      furnished: t('listingIntake.furnished'),
      turnkey: t('listingIntake.turnkey'),
      unfurnished: t('listingIntake.unfurnished'),
    };
    return map[String(v).toLowerCase()] || localizedField(project, 'furnishing', i18n.language) || v;
  };
  // Importe con separador de miles + símbolo de divisa (para la renta).
  const CUR_SYM: Record<string, string> = { EUR: '€', USD: '$', IDR: 'Rp', AUD: 'A$' };
  const fmtMoney = (amount: any, cur?: string | null): string => {
    const c = (cur || 'EUR').toUpperCase();
    const sym = CUR_SYM[c] || c;
    return `${fmtThousands(String(amount))} ${sym}`.trim();
  };
  // Extensiones del leasehold como filas de tabla: +5 años · Total 25 años.
  // Andreas 29-oct: en la web NUNCA el precio de la extensión, solo los años (el precio queda en BD/admin).
  // Array `extensions` [{years, price}]; respaldo al campo único `years_extension`. Sin extensión → [] (card oculta).
  const extensionRows = (): { years: string; total: string }[] => {
    const p = project as any;
    if (!p) return [];
    const base = Number(p.years_contract) || 0;
    const row = (years: any) => ({
      years: t('projectDetail.extYears', { years }),
      total: base && Number(years) ? t('projectDetail.extTotal', { total: base + Number(years) }) : '',
    });
    const exts = Array.isArray(p.extensions) ? p.extensions.filter((e: any) => e && e.years != null) : [];
    if (exts.length) return exts.map((e: any) => row(e.years));
    if (p.years_extension) return [row(p.years_extension)];
    return [];
  };
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  // Para el botón flotante de WhatsApp: mensaje con el nombre de este proyecto.
  useEffect(() => {
    if (!project?.name) return;
    document.body.dataset.projectName = project.name;
    return () => { delete document.body.dataset.projectName; };
  }, [project?.name]);
  const [similarProjects, setSimilarProjects] = useState<Project[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [matchedUnitId, setMatchedUnitId] = useState<string | null>(null);
  const { formatPrice } = useCurrency();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });
  // Title/meta/subtítulo del H1: mismo JSON que el prerender (content/seo/projects.json).
  const lang2 = (i18n.language || 'es').slice(0, 2);
  const seoEntry = project ? (seoMap as Record<string, Record<string, { title: string; description: string; h1sub: string }>>)[project.slug] : undefined;
  // Solo el idioma exacto: ro/id sin entrada usan nombre + descripción localizada (sin mezclar EN).
  const seo = seoEntry?.[lang2];
  usePageMeta({
    title: project ? (seo?.title ?? `${project.name} | Unreal Studio Bali`) : '',
    description: project ? (seo?.description ?? localizedDescription().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)) : undefined,
    image: project ? getImageUrl(project.image) : undefined,
    type: 'article',
  });


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
                // Conserva el prefijo de idioma (sin él nginx manda 301 a /es) y deja que
                // el router/LocaleSeo vean el slug largo (canonical coherente con el prerender).
                const pathLang = window.location.pathname.match(/^\/(es|en|ro|id)\//)?.[1] || (i18n.language || 'es').slice(0, 2);
                navigate(`/${pathLang}/proyecto/${seoSlug}${window.location.search}`, { replace: true });
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
              // Proyectos similares: siempre 3 si hay disponibles; primero misma ubicación, luego misma zona, luego el resto
              const { data: similarData } = await supabase
                .from('projects')
                .select(PUBLIC_PROJECT_COLS)
                .neq('id', loadedProject.id)
                .eq('is_hidden', false)
                .neq('visibility_status', 'sold_out');

              if (similarData) {
                const zones = new Set(String(loadedProject.location || '').split(',').map((z: string) => z.trim()).filter(Boolean));
                const score = (p: any) => p.location === loadedProject.location ? 2
                  : String(p.location || '').split(',').some((z: string) => zones.has(z.trim())) ? 1 : 0;
                const ranked = [...similarData].sort((a: any, b: any) => score(b) - score(a)).slice(0, 3);
                const safeSimilar = ranked.map((p: any) => ({
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

  if (loading) {
      return (
          // Solo el spinner, centrado en la pantalla (no en el hueco bajo el header). Andreas 28-oct: sin texto "Cargando…".
          <div className="min-h-screen bg-almond">
              <div className="fixed inset-0 flex items-center justify-center pointer-events-none" role="status" aria-label={t('projectDetail.loading')}>
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              </div>
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

  const soldOut = project.visibility_status === 'sold_out';
  return (
    <div className="bg-almond transition-colors duration-300 overflow-x-clip text-left relative">
      {/* Lightbox Modal */}
      {lightbox.open && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4">
          <button onClick={() => setLightbox({ open: false, index: 0 })} className="absolute top-8 right-8 text-white z-[110] hover:scale-110 transition">
            <span className="material-symbols-outlined text-4xl">close</span>
          </button>
          <button onClick={prevSlide} className="absolute left-4 md:left-8 text-white z-[110] bg-white/10 p-4 rounded-full hover:bg-white/20 transition">
            <span className="material-symbols-outlined text-4xl">arrow_back</span>
          </button>
          <img src={thumbSrc(allImages[lightbox.index], 1600)} alt={project.name} decoding="async" onError={imgFallback(allImages[lightbox.index])} className="max-w-full max-h-[90vh] object-contain shadow-2xl animate-in zoom-in-95 duration-300" />
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
        <div className="absolute bottom-12 left-6 right-6 md:left-12 md:right-auto max-w-md md:w-full">
          <div className="bg-white/95 backdrop-blur-md p-8 rounded-xl shadow-2xl border-l-4 border-primary">
            {project.property_type && (
              <span className="bg-primary text-white text-[10px] uppercase font-bold px-3 py-2 rounded tracking-wide mb-4 inline-block">
                {propertyTypeLabel(project.property_type, i18n.language)}
              </span>
            )}
            <h1 className="text-3xl md:text-5xl text-primary mb-2 leading-tight">{project.name}{seo?.h1sub && <span className="block text-base md:text-lg font-sans font-normal text-primary/60 mt-2">{seo.h1sub}</span>}</h1>
            {project.tenure && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-black uppercase px-3 py-1 rounded-full mb-2 ${(project.tenure||'').toLowerCase()==='freehold' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}><span className="material-symbols-outlined text-sm">key</span>{t(`projects.card.tenure.${(project.tenure||'').toLowerCase()}`, project.tenure)}</span>
            )}
            {(project as any).already_rented && (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase px-3 py-1 rounded-full mb-2 ml-2 bg-amber-50 text-amber-700"><span className="material-symbols-outlined text-sm">night_shelter</span>{t('projectDetail.alreadyRented')}</span>
            )}
            {project.location && (
              <div className="flex items-center text-gray-500 text-sm font-medium text-left">
                <span className="material-symbols-outlined text-base mr-1">location_on</span>
                {project.location}
              </div>
            )}
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

      {/* Bloque KPI: cuadrícula con líneas finas (gap-px sobre fondo white/10), 2 / 3 / 6 columnas.
          Estado se estira hasta el final de la última fila para que nunca quede un hueco. */}
      {(() => {
        const rent = Number((project as any).annual_rental_projection) || 0;
        const roiRental = rent && project.investor_price ? ((rent / project.investor_price) * 100).toFixed(1) + '%' : project.roi || t('projectDetail.consult');
        const roiResale = project.market_price && project.investor_price && project.investor_price > 0 ? (((project.market_price - project.investor_price) / project.investor_price) * 100).toFixed(1) + '%' : t('projectDetail.consult');
        const cells = [
          { key: 'roiRental', label: t('projectDetail.kpiRoiRental'), value: roiRental, caption: t('projectDetail.kpiRoiSuffix') },
          rent > 0 && { key: 'rent', label: t('projectDetail.kpiRent'), value: formatPrice(rent, (project as any).rent_currency || project.price_currency), caption: t('projectDetail.kpiRoiSuffix') },
          !soldOut && (project.investor_price ?? 0) > 0 && { key: 'investor', label: t('projectDetail.kpiInvestorPrice'), value: formatPrice(project.investor_price, project.price_currency) },
          (project.market_price ?? 0) > 0 && { key: 'market', label: t('projectDetail.kpiMarketPrice'), value: formatPrice(project.market_price, project.price_currency), strike: !soldOut },
          { key: 'roiResale', label: t('projectDetail.kpiRoiResale'), value: roiResale },
        ].filter(Boolean) as { key: string; label: string; value: string; caption?: string; strike?: boolean }[];
        const n = cells.length;
        // literales completos para que Tailwind genere las clases
        const statusSpan = [
          ['col-span-2', 'col-span-1'][n % 2],
          ['md:col-span-3', 'md:col-span-2', 'md:col-span-1'][n % 3],
          ['xl:col-span-6', 'xl:col-span-5', 'xl:col-span-4', 'xl:col-span-3', 'xl:col-span-2', 'xl:col-span-1'][n % 6],
        ].join(' ');
        return (
      <div className="bg-primary text-white py-4 px-4 md:px-12 shadow-xl relative z-10">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-white/10">
          {cells.map((c) => (
            <div key={c.key} className="bg-primary px-3 py-5 md:px-6 text-center md:text-left">
              <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{c.label}</p>
              <p className={`text-2xl md:text-3xl font-serif ${c.strike ? 'line-through opacity-40' : ''}`}>{c.value}</p>
              {c.caption && <p className="mt-1 text-[10px] md:text-xs opacity-70">{c.caption}</p>}
            </div>
          ))}
          <div className={`bg-primary px-3 py-5 md:px-6 text-center md:text-left ${statusSpan}`}>
            <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{t('projectDetail.kpiStatus')}</p>
            {/* punto en línea: si el texto no cabe (EN CONSTRUCCIÓN en media columna) parte limpio; pt-1.5 lo centra con los valores */}
            <p className="text-sm md:text-base font-bold uppercase leading-5 md:leading-6 pt-1.5">
              <span className={`inline-block w-2 h-2 mr-2 -mt-0.5 align-middle rounded-full ${soldOut ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`}></span>
              {soldOut ? t('projects.soldOutBadge') : translateStatus(project.status, t)}
            </p>
          </div>
        </div>
      </div>
        );
      })()}

      <main className="max-w-7xl mx-auto px-6 md:px-12 py-20 grid grid-cols-1 lg:grid-cols-12 gap-16">
        <div className="lg:col-span-8 space-y-20">
          <section>
            <h2 className="text-4xl text-primary mb-8">{t('projectDetail.sectionProject')}</h2>
            {localizedDescription() && (
              <div className="prose prose-lg text-primary/80 font-light space-y-6 mb-12">
                <p>{localizedDescription()}</p>
              </div>
            )}
            {(() => {
              // Regla del dueño: un campo sin valor NO se muestra (ni card ni label).
              const specs = [
                project.distance_beach && { icon: 'beach_access', label: t('projectDetail.labelDistanceBeach'), value: localizedField(project, 'distance_beach', i18n.language) },
                project.tenure !== 'Freehold' && project.years_contract && { icon: 'history', label: t('projectDetail.labelYearsContract'), value: `${project.years_contract} ${t('projectDetail.yearsWord')}` },
                ((project as any).annual_rental_projection > 0) && { icon: 'payments', label: t('projectDetail.labelAnnualRent'), value: `${fmtMoney((project as any).annual_rental_projection, (project as any).rent_currency || project.price_currency)} ${t('projectDetail.perYear')}` },
                project.tenure !== 'Freehold' && extensionRows().length > 0 && { icon: 'update', label: t('projectDetail.labelExtensions'), value: (
                  <table className="w-full mt-1 text-sm"><tbody>
                    {extensionRows().map((r, i) => (
                      <tr key={i} className="border-t first:border-t-0 border-primary/10">
                        <td className="py-1 pr-3 whitespace-nowrap">{r.years}</td>
                        <td className="py-1 text-right whitespace-nowrap font-normal text-primary/60">{r.total}</td>
                      </tr>
                    ))}
                  </tbody></table>
                ) },
                (project.completion_percent > 0) && { icon: 'construction', label: t('projectDetail.labelConstructionProgress'), value: t('projectDetail.completedValue', { pct: project.completion_percent }) },
              ].filter(Boolean) as { icon: string; label: string; value: React.ReactNode }[];
              return specs.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {specs.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-primary/5">
                      <div className="bg-almond p-3 rounded-xl"><span className="material-symbols-outlined text-primary">{item.icon}</span></div>
                      <div>
                        <p className="text-[9px] uppercase font-black text-gray-400 tracking-widest">{item.label}</p>
                        <div className="font-bold text-primary text-sm">{item.value}</div>
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
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelBedrooms')}</p>
                  <p className="text-lg font-bold text-primary">{project.bedrooms}</p>
                </div>
              )}
              {project.bathrooms > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">shower</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelBathrooms')}</p>
                  <p className="text-lg font-bold text-primary">{project.bathrooms}</p>
                </div>
              )}
              {project.area_m2 > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">straighten</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelArea')}</p>
                  <p className="text-lg font-bold text-primary">{project.area_m2} m²</p>
                </div>
              )}
              {project.furnishing && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">chair</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelFurnishing')}</p>
                  <p className="text-sm md:text-base leading-tight font-bold text-primary hyphens-auto">{fmtFurnishing(project.furnishing)}</p>
                </div>
              )}
              {Number(project.total_units) > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">apartment</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelTotalUnits')}</p>
                  <p className="text-lg font-bold text-primary">{project.total_units}</p>
                </div>
              )}
              {Number((project as any).land_size_m2 || (project as any).land_area_m2) > 0 && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">landscape</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelLandArea')}</p>
                  <p className="text-lg font-bold text-primary">{(project as any).land_size_m2 || (project as any).land_area_m2} m²</p>
                </div>
              )}
              {(project as any).view_type && (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-primary/5 text-center">
                  <span className="material-symbols-outlined text-primary/40 text-2xl">visibility</span>
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">{t('projectDetail.labelView')}</p>
                  <p className="text-lg font-bold text-primary">{translateProjectTerm((project as any).view_type, i18n.language)}</p>
                </div>
              )}
            </div>
          </section>

          {/* Botones de Descarga en Columna Principal - MOVIDO AQUÍ PARA MAYOR VISIBILIDAD */}
          {(
            <section className="bg-white p-8 rounded-3xl border border-primary/10 shadow-sm">
                <h3 className="text-2xl font-serif text-primary mb-6">{t('projectDetail.docsTitle')}</h3>
                <div className="flex flex-wrap gap-4">
                  {brochureFor(project, i18n.language) && (
                    <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-primary text-white px-6 h-14 rounded-2xl font-bold shadow-xl border border-primary hover:bg-almond hover:text-primary transition">
                      <span className="material-symbols-outlined">download</span>
                      {t('fix.pd.downloadBrochure')}
                    </a>
                  )}
                  {((project as any).video_url || (project as any).walkthrough_url) && (
                    <a href={(project as any).video_url || (project as any).walkthrough_url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-primary text-white px-6 h-14 rounded-2xl font-bold shadow-xl border border-primary hover:bg-almond hover:text-primary transition">
                      <span className="material-symbols-outlined">smart_display</span>
                      {t('projectDetail.videoTourBtn')}
                    </a>
                  )}
                  {/* Reporte de obra: privado → el botón solo abre acceso al portal o petición por email. */}
                  <ConstructionReportButton projectName={project.name} className="flex-1 min-w-[200px] flex items-center justify-center gap-3 bg-primary text-white px-6 h-14 rounded-2xl font-bold shadow-xl border border-primary hover:bg-almond hover:text-primary transition" />
                </div>
                
                {project.floor_plans && project.floor_plans.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-100">
                    <h4 className="text-lg font-serif text-primary mb-4">{t('projectDetail.plansTitle')}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {project.floor_plans.map((pdf, idx) => (
                        <a key={idx} href={getImageUrl(pdf)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-primary px-4 h-14 rounded-2xl border border-primary hover:bg-almond transition group">
                          <div className="bg-white/10 text-white group-hover:text-primary p-1.5 rounded-xl transition">
                            <span className="material-symbols-outlined">picture_as_pdf</span>
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold text-white group-hover:text-primary truncate">{floorPlanLabel(pdf, idx, t)}</p>
                            <p className="text-[10px] font-black uppercase text-white/60 group-hover:text-primary/60 tracking-widest">{t('projectDetail.viewPdf')}</p>
                          </div>
                          <span className="material-symbols-outlined text-white/60 group-hover:text-primary transition">open_in_new</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
            </section>
          )}

          {project.amenities && project.amenities.length > 0 && (
            <section>
              <h2 className="text-3xl text-primary mb-8">{t('projectDetail.servicesTitle')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {normalizeAmenities(project.amenities).map((amenity, idx) => {
                  return (
                    <div key={idx} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm border border-primary/5">
                      <span className="material-symbols-outlined text-primary/40">{amenityIcon(amenity)}</span>
                      <span className="text-sm font-medium text-primary">{amenityLabel(amenity, i18n.language)}</span>
                    </div>
                  );
                })}
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
                  <div className="rounded-2xl overflow-hidden shadow-lg border border-primary/5 bg-gray-100 flex items-center justify-center" style={{height: '400px'}}>
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
              <h3 className="text-3xl text-primary mb-8">{t('projectDetail.investmentStructureTitle')}</h3>
              <div className="space-y-4">
                {tiersArray.map((tier: string, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-4 border-b border-gray-100 last:border-0">
                    <span className="text-primary/80 font-medium">{tier}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {project.construction_gallery && project.construction_gallery.length > 0 && (
            <section>
              <h3 className="text-3xl text-primary mb-8 text-left flex items-center gap-3">
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
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '240px' } as React.CSSProperties}
                      className="relative rounded-2xl overflow-hidden shadow-sm group cursor-pointer aspect-square border border-gray-100"
                    >
                      <img
                        loading="lazy"
                        decoding="async"
                        alt={t('fix.pd.constructionProgressAlt', { n: idx + 1 })}
                        className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-105"
                        src={thumbSrc(getImageUrl(img), 700)}
                        sizes="(max-width: 768px) 50vw, 33vw"
                        onError={imgFallback(getImageUrl(img))}
                      />
                      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-3xl">zoom_in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}


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
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-primary/5 text-left">
              <h3 className="text-2xl font-serif text-primary mb-5 pb-3 border-b border-gray-100">{t('projectDetail.assetSummary')}</h3>
              <div className="space-y-5 mb-6">
                {project.completion_percent > 0 && (
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-gray-500 mb-3 uppercase tracking-wider">
                    <span>{t('projectDetail.labelConstructionProgress')}</span>
                    <span className="text-primary">{project.completion_percent}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${project.completion_percent}%` }}></div>
                  </div>
                </div>
                )}

                {/* Nuevo bloque de datos extra en sidebar */}
                <div>
                    {project.bedrooms > 0 && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelBedrooms')}</span><span className="text-sm font-bold">{project.bedrooms}</span></div>}
                    {project.bathrooms > 0 && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelBathrooms')}</span><span className="text-sm font-bold">{project.bathrooms}</span></div>}
                    {project.area_m2 > 0 && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelArea')}</span><span className="text-sm font-bold">{project.area_m2} m²</span></div>}
                    {Number(project.total_units) > 0 && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelTotalUnits')}</span><span className="text-sm font-bold">{project.total_units}</span></div>}
                    {project.furnishing && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelFurnishing')}</span><span className="text-sm font-bold">{fmtFurnishing(project.furnishing)}</span></div>}
                    {project.has_pool && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelPool')}</span><span className="text-sm font-bold">{t('projectDetail.yes')}</span></div>}
                    {!isFinished(project.status) && project.completion_date && <div className="flex justify-between py-2 border-b border-gray-100"><span className="text-xs text-primary/50">{t('projectDetail.labelCompletion')}</span><span className="text-sm font-bold">{deliveryText(formatDate(localizedCompletion(project, i18n.language)), t('projects.card.deliveryFrom'))}</span></div>}
                </div>

                {(() => {
                  const rental = (project.annual_rental_projection && project.investor_price) ? ((project.annual_rental_projection / project.investor_price) * 100).toFixed(1) + '%' : null;
                  const resale = (project.market_price && project.investor_price && project.investor_price > 0) ? (((project.market_price - project.investor_price) / project.investor_price) * 100).toFixed(1) + '%' : null;
                  return (rental || resale) ? (
                    <div className="space-y-3">
                      {rental && (
                        <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          <span>{t('projectDetail.kpiRoiRental')}</span>
                          <span className="text-primary">{rental}</span>
                        </div>
                      )}
                      {resale && (
                        <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          <span>{t('projectDetail.kpiRoiResale')}</span>
                          <span className="text-primary">{resale}</span>
                        </div>
                      )}
                      <p className="text-[10px] leading-snug text-gray-400">{t('projectDetail.roiDisclaimer')}</p>
                    </div>
                  ) : null;
                })()}

                {/* Botones en Sidebar */}
                {(
                  <div className="pt-6 border-t border-gray-100 space-y-3">
                    {brochureFor(project, i18n.language) && (
                      <a href={getImageUrl(brochureFor(project, i18n.language))} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-primary border border-primary hover:bg-almond hover:text-primary text-white h-11 rounded-xl font-black text-[10px] uppercase tracking-widest transition group w-full">
                        <span className="material-symbols-outlined text-sm">download</span> {t('projectDetail.downloadBrochure')}
                      </a>
                    )}
                    <ConstructionReportButton projectName={project.name} className="flex items-center justify-center gap-2 bg-primary border border-primary hover:bg-almond hover:text-primary text-white h-11 rounded-xl font-black text-[10px] uppercase tracking-widest transition group w-full [&>span]:text-sm" />
                  </div>
                )}
              </div>
              {soldOut ? (
                <div className="w-full bg-primary/5 text-primary py-4 px-5 rounded-xl text-center">
                  <p className="font-black uppercase tracking-widest text-xs mb-1">{t('projects.soldOutBadge')}</p>
                  <p className="text-xs text-primary/70">{t('projects.soldOutNotice')}</p>
                </div>
              ) : (
              <a
                href={whatsappProjectUrl(project.name)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { try { gtmWhatsappClick({ source: 'project_detail' }); trackLead({ content_name: project.name, content_category: 'web_project_info' }); } catch { /* noop */ } }}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition"
              >
                {t('fix.pd.requestProjectInfo')} <span className="material-symbols-outlined text-base">chat</span>
              </a>
              )}
            </div>
          </div>
        </div>
        {/* Galería a todo el ancho (4 columnas) para no dejar hueco a la derecha. */}
        <section className="lg:col-span-12">
          <h3 className="text-3xl text-primary mb-8 text-left">{t('projectDetail.galleryTitle')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 grid-flow-dense gap-4">
            {allImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setLightbox({ open: true, index: idx })}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '320px' } as React.CSSProperties}
                className={`relative rounded-2xl overflow-hidden shadow-lg group cursor-pointer ${idx === 0 ? 'col-span-2 row-span-2 aspect-video md:aspect-auto' : 'aspect-square'}`}
              >
                <img
                  loading="lazy"
                  decoding="async"
                  alt={t('fix.pd.galleryImageAlt', { name: project.name, n: idx + 1 })}
                  className="absolute inset-0 w-full h-full object-cover transition duration-700 group-hover:scale-105"
                  src={thumbSrc(img, idx === 0 ? 1200 : 800)}
                  sizes="(max-width: 768px) 50vw, 25vw"
                  onError={imgFallback(img)}
                />
                <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="material-symbols-outlined text-white text-3xl">zoom_in</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* FAQ visible = mismo texto que el FAQPage del prerender (scripts/prerender-og.mjs). */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-16">
        <h2 className="text-3xl text-primary mb-8">{t('projectDetail.faq.faqTitle', { name: project.name })}</h2>
        <div className="space-y-3 max-w-4xl">
          {projectFaq(project, t).map(([q, a]) => (
            <details key={q} className="group bg-white rounded-2xl border border-primary/5 shadow-sm p-5">
              <summary className="cursor-pointer list-none flex justify-between items-center gap-4 font-bold text-primary">
                {q}<span className="material-symbols-outlined text-primary/40 group-open:rotate-180 transition">expand_more</span>
              </summary>
              <p className="mt-3 text-primary/70 font-light">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 border-t border-primary/10">
        <h3 className="text-3xl text-primary mb-12 text-center">{t('projectDetail.similarTitle')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
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
                <span className="absolute top-3 left-3 bg-primary/80 text-white text-[8px] font-black px-3 py-1.5 uppercase rounded-lg">{translateStatus(similar.status, t)}</span>
              </div>
              <div className="p-6 text-left">
                <h4 className="text-lg font-bold text-primary mb-2 truncate">{similar.name}</h4>
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">{similar.location}</p>
                <div className="flex justify-between items-center pt-4 border-t border-gray-50">
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