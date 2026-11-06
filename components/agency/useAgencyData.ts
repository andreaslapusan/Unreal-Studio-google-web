/**
 * Datos del portal de agencias: una sola carga para todas las vistas
 * (agencia, proyectos asignados, unidades, clientes registrados y eventos de su link).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { uiLocale } from '../../lib/dateLocale';

export interface PartnerRow {
  id: string;
  agency_name: string;
  manager_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  status: string;
  projects_assigned: string[] | null;
  logo_url: string | null;
  personal_link_slug: string | null;
  created_at: string | null;
}

export interface PropertyRow {
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
}

export interface UnitRow {
  id: string;
  property_id: string;
  unit_name: string;
  price_agencia: number | null;
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

export const unitCommission = (u: UnitRow, partnerId: string): number =>
  u.price_agencia ? (u.price_agencia * unitPct(u, partnerId)) / 100 : 0;

export const isUnitAvailable = (u: UnitRow) => !!u.available && !u.sold;

export const fmtEUR = (n: number) =>
  new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric' });

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
  setPartner: (p: PartnerRow) => void;
  reloadLeads: () => Promise<void>;
}

export function useAgencyData(userId: string | undefined, notLinkedMsg: string): AgencyData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [projects, setProjects] = useState<PropertyRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [leads, setLeads] = useState<AgencyLead[]>([]);
  const [events, setEvents] = useState<AttributionRow[]>([]);

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
          .select('id, agency_name, manager_name, email, phone, website, country, status, projects_assigned, logo_url, personal_link_slug, created_at')
          .eq('user_id', userId)
          .maybeSingle();
        if (pErr) throw pErr;
        if (cancelled) return;
        if (!p) { setError(notLinkedMsg); return; }
        setPartner(p as PartnerRow);
        const ids = p.projects_assigned ?? [];
        const [props, us, ev] = await Promise.all([
          ids.length
            ? supabase.from('properties').select('id, slug, name, short_pitch, area, pct_progress, delivery_date, hero_image_url, brand_pdf_url, walkthrough_url').in('id', ids)
            : Promise.resolve({ data: [], error: null }),
          ids.length
            ? supabase.from('property_units').select('id, property_id, unit_name, price_agencia, commission_default_pct, commission_per_partner, bedrooms, available, reserved, sold').in('property_id', ids).order('unit_name')
            : Promise.resolve({ data: [], error: null }),
          supabase.from('lead_attributions').select('id, property_slug, event_type, contact_email, created_at').eq('partner_id', p.id).order('created_at', { ascending: false }).limit(500),
        ]);
        for (const r of [props, us, ev]) if (r.error) throw r.error;
        if (cancelled) return;
        setProjects((props.data ?? []) as PropertyRow[]);
        setUnits((us.data ?? []) as UnitRow[]);
        setEvents((ev.data ?? []) as AttributionRow[]);
        await loadLeads(p.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, notLinkedMsg, loadLeads]);

  return {
    loading, error, partner, projects, units, leads, events,
    setPartner,
    reloadLeads: async () => { if (partner) await loadLeads(partner.id); },
  };
}

/** Nombre de proyecto para listas: sin el sufijo de tipología ("Vista Mar Villas - 2bd" → "Vista Mar Villas"). */
export const shortProjectName = (name: string) => name.replace(/\s*[-–]\s*\d+\s*(bd|br|bed|beds|hab)\b.*$/i, '').trim() || name;

/** "Vista Mar Villas · Unidad tipo 1" dentro de la tarjeta de Vista Mar → "Unidad tipo 1". */
export const unitLabel = (unit: string, project: string) => {
  const base = shortProjectName(project);
  if (!unit.toLowerCase().startsWith(base.toLowerCase())) return unit;
  return unit.slice(base.length).replace(/^\s*[·\-–:]\s*/, '') || unit;
};
