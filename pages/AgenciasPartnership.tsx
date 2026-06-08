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
          <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold tracking-wide mb-5">
            {t("agenciasPartnership.tag")}
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-5">
            {t("agenciasPartnership.heroTitle1")}
            <br />
            <span className="text-primary/60">{t("agenciasPartnership.heroTitle2")}</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-8 leading-relaxed">
            {t("agenciasPartnership.heroBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/agencias/registrar" className="bg-primary text-white px-8 py-4 rounded-full font-semibold hover:translate-y-[-2px] transition shadow-lg">
              {t("agenciasPartnership.ctaApply")}
            </Link>
            <Link to="/agencias/login" className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition">
              {t("agenciasPartnership.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-12 text-center">{t("agenciasPartnership.whyTitle")}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <article key={i} className="bg-almond rounded-2xl p-6 border border-primary/5">
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
          <h2 className="font-serif text-3xl mb-12 text-center">{t("agenciasPartnership.howTitle")}</h2>
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-6 bg-white rounded-2xl p-6 border border-primary/5">
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
          <h2 className="font-serif text-3xl mb-2 text-center">{t("agenciasPartnership.projectsTitle")}</h2>
          <p className="text-primary/60 text-center mb-12 max-w-2xl mx-auto">
            {t("agenciasPartnership.projectsSubtitle")}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {projects.map((p) => (
              <article key={p.slug ?? p.name} className="bg-almond rounded-2xl overflow-hidden border border-primary/5">
                {p.image ? (
                  <img src={imgSrc(getImageUrl(p.image), 600)} alt={p.name} loading="lazy" className="w-full h-48 object-cover" />
                ) : (
                  <div className="w-full h-48 bg-primary/5" />
                )}
                <div className="p-5">
                  <h3 className="font-serif text-lg leading-tight">{p.name}</h3>
                  {p.zone && <p className="text-xs text-primary/60 mt-1">{p.zone}</p>}
                  {p.status && <p className="text-xs text-primary/50 mt-1">{p.status}</p>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-serif text-4xl mb-4">{t("agenciasPartnership.ctaFinalTitle")}</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto leading-relaxed">
            {t("agenciasPartnership.ctaFinalBody")}
          </p>
          <Link to="/agencias/registrar" className="inline-block bg-white text-primary px-8 py-4 rounded-full font-semibold hover:translate-y-[-2px] transition shadow-xl">
            {t("agenciasPartnership.ctaApply")}
          </Link>
        </div>
      </section>
    </div>
  );
}
