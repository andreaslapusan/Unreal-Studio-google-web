/**
 * Datos del portal de agencias: una sola carga para todas las vistas
 * (agencia, catálogo, unidades, clientes registrados y eventos de su link).
 * Catálogo = lo que está A LA VENTA en la web, con el MISMO precio que la web
 * (Andreas 6-nov: "a las agencias siempre los mismos precios que la web" y
 * "ofrecemos todo lo disponible a la venta en la web"). Ya no depende de projects_assigned.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase, getImageUrl } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';

export interface PartnerRow {
  id: string;
  agency_name: string;
  manager_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  country: string | null;
  status: string;
  projects_assigned: string[] | null;
  logo_url: string | null;
  personal_link_slug: string | null;
  created_at: string | null;
}

export interface PropertyRow {
  /** properties.id (FK de agency_leads) si el proyecto está en el catálogo de agencias; si no, projects.id. */
  id: string;
  slug?: string;
  name: string;
  short_pitch: string | null;
  area: string | null;
  pct_progress: number | null;
  delivery_date: string | null;
  hero_image_url: string | null;
  brand_pdf_url: string | null;
  walkthrough_url: string | null;
  drone_video_url: string | null;
  /** Precio de la web ("Desde" de la tarjeta pública): projects.investor_price en su divisa. */
  investor_price: number | null;
  price_currency: string | null;
  bedrooms: number | null;
  /** true si tiene fila en properties: solo esas se pueden guardar en agency_leads.property_id. */
  in_catalog: boolean;
}

/** Fila de projects que usa el portal (la tabla de la web pública). */
interface WebProject extends ProjectInfo {
  id: string;
  name: string;
  image: string | null;
  investor_price: number | null;
  price_currency: string | null;
  bedrooms: number | null;
  completion_date: string | null;
  is_hidden: boolean | null;
  visibility_status: string | null;
}
const WEB_COLS = 'id, slug, name, image, investor_price, price_currency, bedrooms, completion_date, is_hidden, visibility_status, status, location, completion_percent, updated_at, construction_update_url, construction_update_date, brochure_url, brochures, drive_renders_url, drive_2d_plans_url, drive_brochure_folder_url, video_url, walkthrough_url, tenure, years_contract';

/** Misma regla que el catálogo público (pages/Projects.tsx): ni ocultas ni sold out. */
export const isOnSaleOnWeb = (p: { is_hidden: boolean | null; visibility_status: string | null }) =>
  !(p.is_hidden || p.visibility_status === 'sold_out');

/** Campos de la tabla projects (misma slug que properties) para material y novedades. */
export interface ProjectInfo {
  slug: string;
  status: string | null;
  location: string | null;
  completion_percent: number | null;
  updated_at: string | null;
  construction_update_url: string | null;
  construction_update_date: string | null;
  brochure_url: string | null;
  brochures: Record<string, string> | null;
  drive_renders_url: string | null;
  drive_2d_plans_url: string | null;
  drive_brochure_folder_url: string | null;
  video_url: string | null;
  walkthrough_url: string | null;
  tenure: string | null;
  years_contract: number | null;
}

export interface AgencyRequest {
  id: string;
  created_at: string;
  type: 'call' | 'visit' | 'presentation' | 'contract';
  lead_id: string | null;
  preferred_date: string | null;
  notes: string | null;
  status: 'pending' | 'scheduled' | 'done' | 'cancelled';
}

export interface UnitRow {
  id: string;
  property_id: string;
  unit_name: string;
  commission_default_pct: number | null;
  commission_per_partner: Record<string, number> | null;
  bedrooms: number | null;
  available: boolean | null;
  reserved: boolean | null;
  sold: boolean | null;
}

export interface AgencyLead {
  id: string;
  created_at: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  country: string | null;
  property_id: string | null;
  budget: string | null;
  notes: string | null;
  status: 'new' | 'contacted' | 'won' | 'lost';
}

export interface AttributionRow {
  id: string;
  property_slug: string | null;
  event_type: string;
  contact_email: string | null;
  created_at: string;
}

/** % de comisión de la unidad para esta agencia: override por agencia → default → 5 (igual que RolePricingBadge). */
export const unitPct = (u: UnitRow, partnerId: string): number =>
  u.commission_per_partner?.[partnerId] ?? u.commission_default_pct ?? 5;

export const isUnitAvailable = (u: UnitRow) => !!u.available && !u.sold;

/** % de la agencia en el proyecto (el de sus unidades; 5 si no hay unidades visibles). */
export const projectPct = (p: PropertyRow, units: UnitRow[], partnerId: string): number => {
  const u = units.find((x) => x.property_id === p.id);
  return u ? unitPct(u, partnerId) : 5;
};

/** Comisión estimada por unidad = precio de la WEB × % de la agencia (en la divisa del proyecto). */
export const projectCommission = (p: PropertyRow, units: UnitRow[], partnerId: string): number =>
  ((Number(p.investor_price) || 0) * projectPct(p, units, partnerId)) / 100;

/** Unidades disponibles visibles del proyecto (la RLS solo las enseña a agencias con rol lister). */
export const availableUnits = (p: PropertyRow, units: UnitRow[]) => units.filter((u) => u.property_id === p.id && isUnitAvailable(u));

/** Comisión potencial del inventario en EUR: Σ unidades disponibles × comisión al precio de la web. */
export const potentialEUR = (d: Pick<AgencyData, 'projects' | 'units'>, partnerId: string, convert: (n: number, from: any, to: any) => number): number =>
  d.projects.reduce((s, p) => s + convert(availableUnits(p, d.units).length * projectCommission(p, d.units, partnerId), p.price_currency || 'EUR', 'EUR'), 0);

/** Une las unidades equivalentes (mismo proyecto, habitaciones, comisión y estado) en una fila con su número. */
export const groupUnits = (units: UnitRow[]) => {
  const groups = new Map<string, { u: UnitRow; n: number }>();
  for (const u of units) {
    const k = [u.property_id, u.bedrooms, u.commission_default_pct, JSON.stringify(u.commission_per_partner ?? {}), !!u.reserved].join('|');
    const g = groups.get(k);
    groups.set(k, { u: g?.u ?? u, n: (g?.n ?? 0) + 1 });
  }
  return [...groups.values()];
};

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const partnerParam = (p: PartnerRow) => p.personal_link_slug ?? p.id;

export const catalogLink = (p: PartnerRow) =>
  `${typeof window !== 'undefined' ? window.location.origin : 'https://unrealstudiobali.com'}/proyectos?utm_source=lister&utm_partner=${partnerParam(p)}`;

export async function copyText(text: string, promptLabel: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt(promptLabel, text);
    return false;
  }
}

export interface AgencyData {
  loading: boolean;
  error: string;
  partner: PartnerRow | null;
  projects: PropertyRow[];
  units: UnitRow[];
  leads: AgencyLead[];
  events: AttributionRow[];
  requests: AgencyRequest[];
  projectInfo: Record<string, ProjectInfo>;
  /** Nombre corto de un proyecto por id (properties/projects) o slug, aunque ya no esté a la venta. */
  nameOf: (idOrSlug: string | null | undefined) => string | undefined;
  setPartner: (p: PartnerRow) => void;
  reloadLeads: () => Promise<void>;
  reloadRequests: () => Promise<void>;
}

export function useAgencyData(userId: string | undefined, notLinkedMsg: string): AgencyData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [projects, setProjects] = useState<PropertyRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [events, setEvents] = useState<AttributionRow[]>([]);
  const [requests, setRequests] = useState<AgencyRequest[]>([]);
  const [projectInfo, setProjectInfo] = useState<Record<string, ProjectInfo>>({});
  const [names, setNames] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async (agencyId: string) => {
    const { data, error: e } = await supabase
      .from('agency_requests')
      .select('id, created_at, type, lead_id, preferred_date, notes, status')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    if (e) throw e;
    setRequests((data ?? []) as AgencyRequest[]);
  }, []);

  const loadLeads = useCallback(async (agencyId: string) => {
    const { data, error: e } = await supabase
      .from('agency_leads')
      .select('id, created_at, client_name, client_email, client_phone, country, property_id, budget, notes, status')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false });
    if (e) throw e;
    setLeads((data ?? []) as AgencyLead[]);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: p, error: pErr } = await supabase
          .from('listing_partners')
          .select('id, agency_name, manager_name, email, phone, whatsapp, website, country, status, projects_assigned, logo_url, personal_link_slug, created_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (cancelled) return;
        if (!p) { setError(notLinkedMsg); return; }
        setPartner(p as PartnerRow);
        // Catálogo = proyectos de la web (misma tabla y regla que /proyectos) + su fila de properties por slug.
        const [pj, props, ev] = await Promise.all([
          supabase.from('projects').select(WEB_COLS).order('sort_order', { ascending: true }),
          supabase.from('properties').select('id, slug, name, short_pitch, area, pct_progress, delivery_date, hero_image_url, brand_pdf_url, walkthrough_url, drone_video_url'),
          supabase.from('lead_attributions').select('id, property_slug, event_type, contact_email, created_at').eq('partner_id', p.id).order('created_at', { ascending: false }).limit(500),
          loadLeads(p.id),
          loadRequests(p.id),
        ]);
        for (const r of [pj, props, ev]) if (r.error) throw r.error;
        if (cancelled) return;
        const web = (pj.data ?? []) as unknown as WebProject[];
        const propRows = (props.data ?? []) as Omit<PropertyRow, 'investor_price' | 'price_currency' | 'bedrooms' | 'in_catalog'>[];
        const bySlug = new Map(propRows.map((r) => [r.slug, r]));
        const catalog: PropertyRow[] = web.filter(isOnSaleOnWeb).map((w) => {
          const pr = bySlug.get(w.slug);
          return {
            id: pr?.id ?? w.id, slug: w.slug, name: w.name,
            short_pitch: pr?.short_pitch ?? null,
            area: pr?.area ?? w.location,
            pct_progress: w.completion_percent ?? pr?.pct_progress ?? null,
            delivery_date: w.completion_date || pr?.delivery_date || null,
            hero_image_url: pr?.hero_image_url ?? (w.image ? getImageUrl(w.image) : null),
            brand_pdf_url: pr?.brand_pdf_url ?? (w.brochure_url || null),
            walkthrough_url: pr?.walkthrough_url ?? w.walkthrough_url,
            drone_video_url: pr?.drone_video_url ?? w.video_url,
            investor_price: w.investor_price, price_currency: w.price_currency, bedrooms: w.bedrooms,
            in_catalog: !!pr,
          };
        });
        const ids = catalog.filter((c) => c.in_catalog).map((c) => c.id);
        const us = ids.length
          ? await supabase.from('property_units').select('id, property_id, unit_name, commission_default_pct, commission_per_partner, bedrooms, available, reserved, sold').in('property_id', ids).order('unit_name')
          : { data: [], error: null };
        if (us.error) throw us.error;
        if (cancelled) return;
        setProjects(catalog);
        setUnits((us.data ?? []) as UnitRow[]);
        setEvents((ev.data ?? []) as AttributionRow[]);
        setProjectInfo(Object.fromEntries(web.map((x) => [x.slug, x])));
        const nm: Record<string, string> = {};
        for (const r of [...web, ...propRows]) { nm[r.id] = r.name; if (r.slug) nm[r.slug] = r.name; }
        setNames(nm);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, notLinkedMsg, loadLeads, loadRequests]);

  return {
    loading, error, partner, projects, units, leads, events, requests, projectInfo,
    nameOf: (k) => (k && names[k] ? shortProjectName(names[k]) : undefined),
    setPartner,
    reloadLeads: async () => { if (partner) await loadLeads(partner.id); },
    reloadRequests: async () => { if (partner) await loadRequests(partner.id); },
  };
}

/** Nombre de proyecto para listas: sin el sufijo de tipología ("Vista Mar Villas - 2bd" → "Vista Mar Villas"). */
export const shortProjectName = (name: string) => name.replace(/\s*[-–]\s*\d+\s*(bd|br|bed|beds|hab)\b.*$/i, '').trim() || name;

