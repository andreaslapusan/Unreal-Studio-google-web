/**
 * /agencias/stats — Lister stats panel.
 * Muestra al lister logueado: visitas atribuidas, conversiones, top proyectos,
 * y earnings esperados (5% × precio agencia × ventas).
 */
import React, { useEffect, useState } from "react";
import { uiLocale } from '../lib/dateLocale';
import { Navigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import PortalHeader from "../components/PortalHeader";
import Footer from "../components/Footer";

interface AttributionRow {
  id: string;
  partner_id: string;
  property_slug: string | null;
  event_type: string;
  contact_email: string | null;
  created_at: string;
}

interface PartnerRow {
  id: string;
  agency_name: string;
  status: string;
  projects_assigned: string[] | null;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat(uiLocale(), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export default function AgenciasStats() {
  const { t } = useTranslation();
  const { user, role, loading: authLoading, signOut } = useAuth();
  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [rows, setRows] = useState<AttributionRow[]>([]);
  const [potential, setPotential] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { data: pData, error: pErr } = await supabase
          .from("listing_partners")
          .select("id, agency_name, status, projects_assigned")
          .eq("user_id", user.id)
          .maybeSingle();
        if (pErr) throw pErr;
        if (!pData) {
          setError(t('agenciasStats.noPartnerLink'));
          setLoading(false);
          return;
        }
        setPartner(pData as PartnerRow);

        const { data: attribs, error: aErr } = await supabase
          .from("lead_attributions")
          .select("id, partner_id, property_slug, event_type, contact_email, created_at")
          .eq("partner_id", pData.id)
          .order("created_at", { ascending: false })
          .limit(500);
        if (aErr) throw aErr;
        setRows((attribs ?? []) as AttributionRow[]);

        // Compute potential earnings from assigned units (commission default 5%)
        const ids = pData.projects_assigned ?? [];
        if (ids.length) {
          const { data: units } = await supabase
            .from("property_units")
            .select("price_agencia, commission_default_pct, available, sold")
            .in("property_id", ids);
          let pot = 0;
          for (const u of units ?? []) {
            if (u.available && !u.sold && u.price_agencia) {
              const pct = u.commission_default_pct ?? 5;
              pot += (u.price_agencia * pct) / 100;
            }
          }
          setPotential(pot);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">{t('agenciasStats.loadingAuth')}</div>;
  if (!user) return <Navigate to="/agencias/login" replace />;
  if (!role || (role !== "lister" && role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">{t('agenciasStats.accessDenied')}</h1>
          <p>{t('agenciasStats.accessDeniedBody')}</p>
        </div>
      </div>
    );
  }

  // Aggregations
  const visits = rows.filter((r) => r.event_type === "visit").length;
  const formSubmits = rows.filter((r) => r.event_type === "form_submit").length;
  const reservations = rows.filter((r) => r.event_type === "reservation").length;
  const sales = rows.filter((r) => r.event_type === "sale").length;
  const conversionRate = visits > 0 ? Math.round((formSubmits / visits) * 100) : 0;

  // Top properties
  const propertyCounts = new Map<string, number>();
  rows.forEach((r) => {
    if (!r.property_slug) return;
    propertyCounts.set(r.property_slug, (propertyCounts.get(r.property_slug) ?? 0) + 1);
  });
  const topProperties = Array.from(propertyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Recent events grouped by day
  const recent = rows.slice(0, 25);

  return (
    <div className="min-h-screen bg-almond pb-16">
      <PortalHeader
        subtitle={partner?.agency_name ?? user.email ?? undefined}
        onLogout={async () => { try { await signOut(); } catch { /* ignore */ } window.location.href = '/agencias/login'; }}
        extra={
          <Link to="/agencias/dashboard" className="bg-white border border-primary/10 text-primary/70 hover:bg-primary hover:text-white px-3 md:px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition shadow-sm">
            {t('agenciasStats.navProjects')}
          </Link>
        }
      />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {loading && <p>{t('agenciasStats.loading')}</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Tile label={t('agenciasStats.kpiVisits')} value={visits} />
              <Tile label={t('agenciasStats.kpiSubmissions')} value={formSubmits} />
              <Tile label={t('agenciasStats.kpiReservations')} value={reservations} />
              <Tile label={t('agenciasStats.kpiSales')} value={sales} />
              <Tile label={t('agenciasStats.kpiConversion')} value={`${conversionRate}%`} />
            </div>

            {/* Earnings potential */}
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-serif text-xl mb-2">{t('agenciasStats.earningsTitle')}</h2>
              <p className="text-sm text-primary/70 mb-3">{t('agenciasStats.earningsBody')}</p>
              <div className="text-4xl font-serif text-primary">{fmtEUR(potential)}</div>
              <p className="text-xs text-primary/50 mt-1">{t('agenciasStats.earningsHint')}</p>
            </section>

            {/* Top properties */}
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-serif text-xl mb-4">{t('agenciasStats.topTitle')}</h2>
              {topProperties.length === 0 && (
                <p className="text-primary/60 text-sm italic">{t('agenciasStats.topEmpty')}</p>
              )}
              <ul className="space-y-2">
                {topProperties.map(([slug, count]) => (
                  <li key={slug} className="flex items-center justify-between bg-white/60 rounded-lg p-3 text-sm">
                    <Link to={`/proyecto/${slug}`} className="font-medium underline">
                      {slug}
                    </Link>
                    <span className="text-primary/60">{count} {t('agenciasStats.events')}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Recent activity */}
            <section className="glass-card rounded-2xl p-6">
              <h2 className="font-serif text-xl mb-4">{t('agenciasStats.recentTitle')}</h2>
              {recent.length === 0 && <p className="text-primary/60 text-sm italic">{t('agenciasStats.recentEmpty')}</p>}
              <ul className="space-y-1 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between border-b border-primary/10 py-2">
                    <span className="text-xs text-primary/60">{new Date(r.created_at).toLocaleString(uiLocale(), { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="font-medium">{r.event_type}</span>
                    <span className="text-primary/70 truncate max-w-[40%]">{r.property_slug ?? "—"}</span>
                    <span className="text-xs text-primary/50 truncate">{r.contact_email ?? t('agenciasStats.anon')}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>

      {/* Footer compartido (a lo ancho; el root no tiene padding lateral) */}
      <div className="mt-12">
        <Footer />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="text-xs uppercase tracking-widest text-primary/50">{label}</div>
      <div className="text-3xl font-serif text-primary mt-1">{value}</div>
    </div>
  );
}
