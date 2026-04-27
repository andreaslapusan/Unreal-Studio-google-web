/**
 * /inversores/dashboard — Dashboard del inversor logueado.
 * Muestra "mis unidades" con plan de pagos + updates de obra del proyecto.
 */
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import PaymentTimeline from "../components/PaymentTimeline";

interface InvestorRow {
  id: string;
  full_name: string | null;
  email: string | null;
  kyc_status: string | null;
}

interface UnitRow {
  id: string;
  unit_name: string;
  property_id: string;
  bedrooms: number | null;
  bathrooms: number | null;
  building_size_sqm: number | null;
  pool_size: string | null;
  google_pin: string | null;
  payment_plan: string | null;
  delivery_date?: string | null;
  available: boolean;
  reserved: boolean;
  sold: boolean;
}

interface PropertyRow {
  id: string;
  name: string;
  area: string | null;
  pct_progress: number | null;
  delivery_date: string | null;
  hero_image_url: string | null;
  walkthrough_url: string | null;
}

interface MyUnit {
  investor_unit_id: string;
  unit: UnitRow;
  property: PropertyRow | null;
  price_paid: number | null;
  contract_signed_at: string | null;
  reservation_paid: boolean;
  full_paid: boolean;
}

interface Update {
  id: string;
  property_id: string;
  title: string;
  summary: string | null;
  pct_progress_at_update: number | null;
  posted_at: string;
}

export default function InversoresDashboard() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const [investor, setInvestor] = useState<InvestorRow | null>(null);
  const [myUnits, setMyUnits] = useState<MyUnit[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data: invRow, error: invErr } = await supabase
          .from("investors")
          .select("id, full_name, email, kyc_status")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (invErr) throw invErr;
        if (!invRow) {
          setError(
            "Tu cuenta aún no está vinculada a un perfil de inversor. Contacta soporte."
          );
          setLoading(false);
          return;
        }
        setInvestor(invRow as InvestorRow);

        // Fetch investor_units + join property_units + properties
        const { data: ius, error: iuErr } = await supabase
          .from("investor_units")
          .select(
            `id, price_paid, contract_signed_at, reservation_paid, full_paid,
             property_units (
               id, unit_name, property_id, bedrooms, bathrooms,
               building_size_sqm, pool_size, google_pin, payment_plan,
               available, reserved, sold
             )`
          )
          .eq("investor_id", invRow.id);
        if (iuErr) throw iuErr;
        // Type the rows as `any` for the join nesting; we copy investor_unit id below

        const propertyIds = Array.from(
          new Set(
            (ius ?? [])
              .map((iu: any) => iu.property_units?.property_id)
              .filter(Boolean)
          )
        );

        const { data: props } = propertyIds.length
          ? await supabase
              .from("properties")
              .select(
                "id, name, area, pct_progress, delivery_date, hero_image_url, walkthrough_url"
              )
              .in("id", propertyIds)
          : { data: [] };

        const propMap = new Map<string, PropertyRow>(
          (props ?? []).map((p: any) => [p.id, p as PropertyRow])
        );

        const enrichedUnits: MyUnit[] = (ius ?? []).map((iu: any) => ({
          investor_unit_id: iu.id,
          unit: iu.property_units as UnitRow,
          property: iu.property_units?.property_id
            ? propMap.get(iu.property_units.property_id) ?? null
            : null,
          price_paid: iu.price_paid,
          contract_signed_at: iu.contract_signed_at,
          reservation_paid: iu.reservation_paid,
          full_paid: iu.full_paid,
        }));
        setMyUnits(enrichedUnits);

        // Fetch updates for the user's properties (RLS filters by visibility)
        if (propertyIds.length) {
          const { data: ups } = await supabase
            .from("property_updates")
            .select("id, property_id, title, summary, pct_progress_at_update, posted_at")
            .in("property_id", propertyIds)
            .order("posted_at", { ascending: false })
            .limit(20);
          setUpdates((ups ?? []) as Update[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  if (!user) return <Navigate to="/inversores" replace />;
  if (role && role !== "investor" && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">Acceso no autorizado</h1>
          <p>Tu cuenta no tiene perfil de inversor.</p>
        </div>
      </div>
    );
  }

  const fmt = (n: number | null | undefined) =>
    typeof n === "number"
      ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
      : "—";

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">Portal Inversores</h1>
          <p className="text-sm opacity-80">{investor?.full_name ?? user.email}</p>
        </div>
        <button onClick={() => void signOut()} className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full">
          Salir
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {loading && <p>Cargando tus unidades…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && myUnits.length === 0 && (
          <div className="bg-white/60 rounded-xl p-6 text-center">
            <p className="text-primary/70">Aún no tienes unidades registradas a tu nombre.</p>
          </div>
        )}

        {myUnits.length > 0 && (
          <>
            <h2 className="font-serif text-2xl text-primary mb-4">Mis unidades</h2>
            <div className="grid gap-6 md:grid-cols-2 mb-12">
              {myUnits.map((mu) => (
                <article key={mu.unit.id} className="glass-card rounded-2xl overflow-hidden shadow-sm">
                  {mu.property?.hero_image_url && (
                    <img src={mu.property.hero_image_url} alt={mu.property.name ?? ""} className="w-full h-44 object-cover" loading="lazy" />
                  )}
                  <div className="p-6">
                    <h3 className="font-serif text-xl text-primary">{mu.property?.name ?? "Proyecto"}</h3>
                    <p className="text-sm text-primary/70 mb-3">{mu.unit.unit_name}</p>
                    <ul className="text-sm space-y-1">
                      {typeof mu.price_paid === "number" && (
                        <li><strong>Precio pagado:</strong> {fmt(mu.price_paid)}</li>
                      )}
                      <li><strong>Reserva:</strong> {mu.reservation_paid ? "✅" : "—"}</li>
                      <li><strong>Pago completo:</strong> {mu.full_paid ? "✅" : "—"}</li>
                      <li><strong>Contrato firmado:</strong> {mu.contract_signed_at ? new Date(mu.contract_signed_at).toLocaleDateString("es-ES") : "—"}</li>
                      {mu.property?.delivery_date && (
                        <li><strong>Entrega estimada:</strong> {mu.property.delivery_date}</li>
                      )}
                    </ul>
                    {typeof mu.property?.pct_progress === "number" && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span>Avance obra</span>
                          <span className="font-bold">{mu.property.pct_progress}%</span>
                        </div>
                        <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${mu.property.pct_progress}%` }} />
                        </div>
                      </div>
                    )}
                    {mu.property?.walkthrough_url && (
                      <a href={mu.property.walkthrough_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-xs bg-white border border-primary text-primary px-3 py-2 rounded-full">
                        🎥 Walkthrough
                      </a>
                    )}
                    <div className="mt-5 pt-4 border-t border-primary/10">
                      <PaymentTimeline investorUnitId={mu.investor_unit_id} />
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <h2 className="font-serif text-2xl text-primary mb-4">Updates de obra</h2>
            {updates.length === 0 && (
              <p className="text-primary/60">Aún no hay updates publicados para tus proyectos.</p>
            )}
            <ul className="space-y-3">
              {updates.map((u) => (
                <li key={u.id} className="bg-white/60 rounded-xl p-4">
                  <div className="flex items-center justify-between text-sm text-primary/60 mb-1">
                    <span>{new Date(u.posted_at).toLocaleDateString("es-ES")}</span>
                    {typeof u.pct_progress_at_update === "number" && (
                      <span className="font-bold">{u.pct_progress_at_update}%</span>
                    )}
                  </div>
                  <h3 className="font-serif text-lg text-primary">{u.title}</h3>
                  {u.summary && <p className="text-sm mt-1">{u.summary}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
