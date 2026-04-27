/**
 * /agencias/dashboard — Dashboard de la agencia logueada.
 * Muestra proyectos asignados con detalles, dossiers, updates de obra.
 */
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { collection, getDocs, query, where, type DocumentData } from "firebase/firestore";
import { useAuth } from "../lib/auth-context";
import { db } from "../lib/firebase";

interface Property {
  id: string;
  name: string;
  short_pitch?: string;
  area?: string;
  pct_progress?: number;
  delivery_date?: string;
  hero_image_url?: string;
  brand_pdf_url?: string;
  walkthrough_url?: string;
}

interface PartnerDoc extends DocumentData {
  id: string;
  agency_name?: string;
  projects_assigned?: string[];
  status?: string;
}

export default function AgenciasDashboard() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const [partner, setPartner] = useState<PartnerDoc | null>(null);
  const [projects, setProjects] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        // Find listing_partner doc by user_id
        const q = query(collection(db, "listing_partners"), where("user_id", "==", user.uid));
        const snap = await getDocs(q);
        if (snap.empty) {
          setError("Tu cuenta aún no está vinculada a una agencia. Contacta soporte.");
          setLoading(false);
          return;
        }
        const partnerDoc = { id: snap.docs[0].id, ...snap.docs[0].data() } as PartnerDoc;
        setPartner(partnerDoc);

        // Load assigned projects
        const projectIds = partnerDoc.projects_assigned ?? [];
        if (projectIds.length === 0) {
          setProjects([]);
          setLoading(false);
          return;
        }
        const projectDocs = await Promise.all(
          projectIds.map(async (pid: string) => {
            const propsQ = query(collection(db, "properties"), where("__name__", "==", pid));
            const ps = await getDocs(propsQ);
            return ps.empty ? null : ({ id: ps.docs[0].id, ...ps.docs[0].data() } as Property);
          })
        );
        setProjects(projectDocs.filter((p): p is Property => p !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando…</div>;
  }
  if (!user) return <Navigate to="/agencias" replace />;
  if (role && role !== "lister" && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-serif mb-4">Acceso no autorizado</h1>
          <p>Tu cuenta no tiene rol de agencia colaboradora.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-almond pb-16">
      <header className="bg-primary text-white px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl">Portal Agencias</h1>
          <p className="text-sm opacity-80">{partner?.agency_name ?? user.email}</p>
        </div>
        <button
          onClick={() => void signOut()}
          className="text-sm bg-white/10 hover:bg-white/20 px-4 py-2 rounded-full"
        >
          Salir
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {loading && <p>Cargando proyectos…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && projects.length === 0 && (
          <div className="bg-white/60 rounded-xl p-6 text-center">
            <p className="text-primary/70">
              Aún no tienes proyectos asignados. Contacta con tu manager para que
              te active los proyectos en los que vas a colaborar.
            </p>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {projects.map((p) => (
            <article
              key={p.id}
              className="glass-card rounded-2xl overflow-hidden shadow-sm"
            >
              {p.hero_image_url && (
                <img
                  src={p.hero_image_url}
                  alt={p.name}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                />
              )}
              <div className="p-6">
                <h2 className="font-serif text-xl text-primary mb-2">{p.name}</h2>
                {p.area && <p className="text-sm text-primary/60">{p.area}</p>}
                {p.short_pitch && <p className="mt-2 text-sm">{p.short_pitch}</p>}
                {typeof p.pct_progress === "number" && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span>Avance obra</span>
                      <span className="font-bold">{p.pct_progress}%</span>
                    </div>
                    <div className="h-2 bg-primary/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${p.pct_progress}%` }}
                      />
                    </div>
                  </div>
                )}
                {p.delivery_date && (
                  <p className="text-xs text-primary/60 mt-2">
                    Entrega estimada: <strong>{p.delivery_date}</strong>
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  {p.brand_pdf_url && (
                    <a
                      href={p.brand_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-primary text-white px-3 py-2 rounded-full hover:translate-y-[-1px] transition"
                    >
                      📄 Dossier
                    </a>
                  )}
                  {p.walkthrough_url && (
                    <a
                      href={p.walkthrough_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs bg-white border border-primary text-primary px-3 py-2 rounded-full hover:bg-primary/5 transition"
                    >
                      🎥 Walkthrough
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
