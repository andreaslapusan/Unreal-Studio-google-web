import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ProjectAgencyRow {
  id: string;
  name: string;
  slug: string;
  owner_name: string | null;
  location: string | null;
  zone: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_m2: number | null;
  land_size_m2: number | null;
  pool_size_m2: number | null;
  has_powder_room: boolean | null;
  has_rooftop: boolean | null;
  parking: string | null;
  view: string | null;
  living_room_style: string | null;
  furnishing: string | null;
  furnishing_pack_cost_usd: number | null;
  investor_price: number | null;
  market_price: number | null;
  price_currency: string | null;
  payment_plan_off_plan: string | null;
  years_contract: number | null;
  years_extension: number | null;
  extension_cost_usd: number | null;
  lease_end_date: string | null;
  lease_years_paid: boolean | null;
  zoning_type: string | null;
  building_permit_status: string | null;
  structural_warranty: string | null;
  water_supply: string | null;
  completion_date: string | null;
  completion_percent: number | null;
  status: string | null;
  google_maps_url: string | null;
  brochure_url: string | null;
  drive_brochure_folder_url: string | null;
  drive_renders_url: string | null;
  drive_2d_plans_url: string | null;
  drive_permits_url: string | null;
  drive_legal_url: string | null;
  video_url: string | null;
  construction_update_url: string | null;
  construction_update_date: string | null;
  gallery: string[] | null;
  floor_plans: string[] | null;
  description: string | null;
  annual_rental_projection: number | null;
  agency_pack_status: Record<string, any> | null;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex justify-between items-start py-2 border-b border-primary/5 gap-4">
    <span className="text-xs font-bold uppercase text-primary/60 tracking-wide flex-shrink-0">{label}</span>
    <span className="text-sm text-primary text-right">{children || <span className="text-primary/30">—</span>}</span>
  </div>
);

const LinkBtn: React.FC<{ href: string | null | undefined; children: React.ReactNode }> = ({ href, children }) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="px-4 py-2 bg-primary text-white rounded-full text-xs font-bold hover:opacity-90 inline-block"
    >
      {children}
    </a>
  ) : (
    <span className="px-4 py-2 bg-gray-100 text-gray-400 rounded-full text-xs font-bold inline-block cursor-not-allowed">
      {children} (no disponible)
    </span>
  );

const AgencyPack: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<ProjectAgencyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Pack Agencia — Unreal Studio Bali';
    if (!slug) return;
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError('Proyecto no encontrado');
      } else {
        setProject(data as ProjectAgencyRow);
        document.title = `Pack Agencia · ${(data as ProjectAgencyRow).name} — Unreal Studio Bali`;
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading)
    return <div className="min-h-screen flex items-center justify-center bg-almond text-primary/60">Cargando…</div>;
  if (error || !project)
    return (
      <div className="min-h-screen flex items-center justify-center bg-almond text-red-600 p-12 text-center">
        {error || 'Proyecto no encontrado'}
      </div>
    );

  const formatPrice = (v: number | null) =>
    v == null ? null : `${(project.price_currency || 'USD')} ${v.toLocaleString('en-US')}`;

  return (
    <div className="bg-almond min-h-screen">
      <header className="bg-primary text-white px-6 md:px-16 py-8 print:py-4">
        <div className="max-w-6xl mx-auto flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60 mb-2">
              Pack para Agencias
            </p>
            <h1 className="text-3xl md:text-5xl font-serif">{project.name}</h1>
            <p className="text-white/70 mt-2">{project.location}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black uppercase tracking-widest text-white/60 mb-1">Precio</p>
            <p className="text-3xl md:text-4xl font-serif">{formatPrice(project.investor_price)}</p>
            <p className="text-xs text-white/60 mt-1">{project.furnishing} (5% comisión incluida)</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-16 py-10 print:py-6 space-y-10">
        {project.description && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">Resumen</h2>
            <p className="text-primary/90 leading-relaxed">{project.description}</p>
          </section>
        )}

        {project.gallery && project.gallery.length > 0 && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">Galería</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {project.gallery.slice(0, 8).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${project.name} ${i + 1}`}
                  className="w-full h-32 md:h-40 object-cover rounded-xl"
                  loading="lazy"
                />
              ))}
            </div>
          </section>
        )}

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">Identificación</h2>
            <Field label="Owner">{project.owner_name}</Field>
            <Field label="Tipo">{project.property_type}</Field>
            <Field label="Zona">{project.zone}</Field>
            <Field label="Estado">{project.status}</Field>
            <Field label="Avance obra">
              {project.completion_percent != null ? `${project.completion_percent}%` : null}
            </Field>
            <Field label="Última actualización">{project.construction_update_date}</Field>
            <Field label="Google Pin">
              {project.google_maps_url ? (
                <a className="text-blue-600 underline" href={project.google_maps_url} target="_blank" rel="noopener noreferrer">
                  Ver mapa
                </a>
              ) : null}
            </Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">Contrato y Leasehold</h2>
            <Field label="Lease end">{project.lease_end_date}</Field>
            <Field label="Años contrato">{project.years_contract}</Field>
            <Field label="Años extensión">{project.years_extension}</Field>
            <Field label="Coste extensión">
              {project.extension_cost_usd != null
                ? project.extension_cost_usd === 0
                  ? 'A precio de mercado'
                  : `USD ${project.extension_cost_usd.toLocaleString('en-US')}`
                : null}
            </Field>
            <Field label="Lease pagado">
              {project.lease_years_paid == null ? null : project.lease_years_paid ? 'Sí, en su totalidad' : 'No'}
            </Field>
            <Field label="Zoning">{project.zoning_type}</Field>
            <Field label="Permit (IMB/PBG/SLF)">{project.building_permit_status}</Field>
            <Field label="Structural warranty">{project.structural_warranty}</Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">Producto</h2>
            <Field label="Bedrooms">{project.bedrooms}</Field>
            <Field label="Bathrooms">{project.bathrooms}</Field>
            <Field label="Powder room">
              {project.has_powder_room == null ? null : project.has_powder_room ? 'Sí' : 'No'}
            </Field>
            <Field label="Rooftop">
              {project.has_rooftop == null ? null : project.has_rooftop ? 'Sí' : 'No'}
            </Field>
            <Field label="Building (m²)">{project.area_m2}</Field>
            <Field label="Land (m²)">{project.land_size_m2}</Field>
            <Field label="Pool (m²)">{project.pool_size_m2}</Field>
            <Field label="Parking">{project.parking}</Field>
            <Field label="View">{project.view}</Field>
            <Field label="Living room">{project.living_room_style}</Field>
            <Field label="Water supply">{project.water_supply}</Field>
          </section>

          <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
            <h2 className="text-base font-serif text-primary mb-4">Pricing y Mobiliario</h2>
            <Field label="Net Sale Price">{formatPrice(project.investor_price)}</Field>
            <Field label="Furnishing">{project.furnishing}</Field>
            <Field label="Pack fully-furnished">
              {project.furnishing_pack_cost_usd != null
                ? `+ USD ${project.furnishing_pack_cost_usd.toLocaleString('en-US')}`
                : null}
            </Field>
            <Field label="Plan de pagos (off-plan)">{project.payment_plan_off_plan}</Field>
            <Field label="Entrega estimada">{project.completion_date}</Field>
            <Field label="ROI proyectado anual">
              {project.annual_rental_projection != null
                ? `USD ${project.annual_rental_projection.toLocaleString('en-US')}/año`
                : null}
            </Field>
          </section>
        </div>

        <section className="bg-white rounded-3xl p-6 shadow-sm border border-primary/5">
          <h2 className="text-base font-serif text-primary mb-4">Documentación y Media</h2>
          <div className="flex flex-wrap gap-3">
            <LinkBtn href={project.brochure_url}>📄 Brochure ESP</LinkBtn>
            <LinkBtn href={project.drive_renders_url}>🎨 3D Renders</LinkBtn>
            <LinkBtn href={project.drive_2d_plans_url}>📐 2D Plans</LinkBtn>
            <LinkBtn href={project.drive_permits_url}>📋 Permits</LinkBtn>
            <LinkBtn href={project.drive_legal_url}>⚖️ Land Legal Docs</LinkBtn>
            <LinkBtn href={project.video_url}>🎬 Video</LinkBtn>
            <LinkBtn href={project.construction_update_url}>🏗️ Último Report Obra</LinkBtn>
            <LinkBtn href={project.drive_brochure_folder_url}>📂 Drive Folder Completo</LinkBtn>
          </div>
        </section>

        {project.floor_plans && project.floor_plans.length > 0 && (
          <section>
            <h2 className="text-xs font-black uppercase tracking-widest text-primary/60 mb-3">Floor Plans</h2>
            <div className="grid gap-4">
              {project.floor_plans.slice(0, 3).map((src, i) =>
                src.includes('drive.google.com') ? (
                  <iframe
                    key={i}
                    src={src}
                    className="w-full h-[600px] rounded-2xl border border-primary/5"
                    title={`Floor plan ${i + 1}`}
                  />
                ) : (
                  <img key={i} src={src} alt={`Floor plan ${i + 1}`} className="w-full rounded-2xl" loading="lazy" />
                ),
              )}
            </div>
          </section>
        )}

        <footer className="text-center text-xs text-primary/40 pt-8 border-t border-primary/5">
          Pack agencia · Unreal Studio Bali · Datos en vivo desde Supabase
          <br />
          Comisión por defecto: 5% incluida en el precio. Para acuerdos especiales, contacta directamente.
        </footer>
      </main>
    </div>
  );
};

export default AgencyPack;
