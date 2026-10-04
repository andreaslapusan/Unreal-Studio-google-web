/**
 * /agencias — Landing PÚBLICA de captación de agencias (Listing Partners).
 *
 * ⚠️ PÚBLICA + se usa en campañas frías. SIN info confidencial (comisiones,
 * precios de agencia, markup, calculadora). Las condiciones van tras el login
 * de partners (/agencias/login). Tono profesional, sin emojis. Los proyectos
 * salen REALES de la BD (tabla projects), no hardcodeados.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, getImageUrl } from "../lib/supabase";
import { imgSrc } from "../lib/imageOptimize";

interface ProjectCard {
  name: string;
  image: string | null;
  slug: string | null;
  zone: string | null;
  status: string | null;
}

interface Benefit { title: string; body: string }
interface Step { title: string; body: string }

export default function AgenciasPartnership() {
  const { t } = useTranslation();
  const statusLabel = (st?: string) => {
    const map: Record<string, string> = { active: 'active', Activo: 'active', Reserva: 'reserved', Reservado: 'reserved', Pagado: 'paid', 'En proceso': 'inProgress', 'En construcción': 'inProgress', Completado: 'completed', Pendiente: 'pending' };
    const k = map[String(st || '')];
    return k ? t('admin.clientDash.status.' + k) : String(st || '');
  };
  const [projects, setProjects] = useState<ProjectCard[]>([]);

  // benefits/steps vienen del namespace i18n (es/en/ro) como arrays.
  const benefits = (t("agenciasPartnership.benefits", { returnObjects: true }) as Benefit[]) || [];
  const steps = (t("agenciasPartnership.steps", { returnObjects: true }) as Step[]) || [];

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("name, image, slug, zone, location, status, is_hidden, sort_order")
        .order("sort_order", { ascending: true });
      const list = (data ?? [])
        .filter((p: any) => !p.is_hidden)
        // `zone` está a medio rellenar; `location` (lo que edita admin) está completo.
        .map((p: any) => ({ name: p.name, image: p.image, slug: p.slug, zone: p.zone || p.location, status: p.status }));
      setProjects(list);
    })();
  }, []);

  return (
    <div className="bg-almond text-primary">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <span className="inline-flex items-center gap-2.5 text-[11px] md:text-xs font-black uppercase tracking-[0.22em] text-primary/45 mb-6"><span className="h-px w-8 bg-primary/35"></span>{t("agenciasPartnership.tag")}</span>
          <h1 className="font-serif text-5xl md:text-7xl leading-[1.05] tracking-[-0.02em] mb-6">
            {t("agenciasPartnership.heroTitle1")}
            <br />
            <span className="text-primary/55">{t("agenciasPartnership.heroTitle2")}</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-9 leading-relaxed font-light">
            {t("agenciasPartnership.heroBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/agencias/registrar" className="bg-primary text-white px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-black hover:-translate-y-0.5 transition">
              {t("agenciasPartnership.ctaApply")}
            </Link>
            <Link to="/agencias/login" className="bg-white border border-primary/15 text-primary px-8 py-4 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-primary/5 hover:border-primary/30 transition">
              {t("agenciasPartnership.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.01em] mb-12 text-center">{t("agenciasPartnership.whyTitle")}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <article key={i} className="bg-almond rounded-2xl p-6 border border-primary/5 hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <h3 className="font-serif text-xl mb-3">{b.title}</h3>
                <p className="text-sm text-primary/70 leading-relaxed">{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-almond">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.01em] mb-12 text-center">{t("agenciasPartnership.howTitle")}</h2>
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-6 bg-white rounded-2xl p-6 border border-primary/5 hover:border-primary/15 hover:shadow-md transition-all duration-300">
                <div className="text-5xl font-serif text-primary/25 shrink-0">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <h3 className="font-serif text-xl mb-1">{s.title}</h3>
                  <p className="text-sm text-primary/70 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Projects (reales de la BD, sin precios) */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl md:text-4xl tracking-[-0.01em] mb-2 text-center">{t("agenciasPartnership.projectsTitle")}</h2>
          <p className="text-primary/60 text-center mb-12 max-w-2xl mx-auto">
            {t("agenciasPartnership.projectsSubtitle")}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {projects.map((p) => (
              <article key={p.slug ?? p.name} className="bg-almond rounded-2xl overflow-hidden border border-primary/5 hover:border-primary/15 hover:shadow-lg transition-all duration-300 group">
                {p.image ? (
                  <img src={imgSrc(getImageUrl(p.image), 600)} alt={p.name} loading="lazy" className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-48 bg-primary/5" />
                )}
                <div className="p-5">
                  <h3 className="font-serif text-lg leading-tight">{p.name}</h3>
                  {p.zone && <p className="text-xs text-primary/60 mt-1">{p.zone}</p>}
                  {p.status && <p className="text-xs text-primary/50 mt-1">{statusLabel(p.status)}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-serif text-4xl md:text-5xl tracking-[-0.02em] mb-4">{t("agenciasPartnership.ctaFinalTitle")}</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto leading-relaxed font-light">
            {t("agenciasPartnership.ctaFinalBody")}
          </p>
          <Link to="/agencias/registrar" className="inline-block bg-white text-primary px-9 py-4 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-almond hover:-translate-y-0.5 transition shadow-xl">
            {t("agenciasPartnership.ctaApply")}
          </Link>
        </div>
      </section>
    </div>
  );
}
