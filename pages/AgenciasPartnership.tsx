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
import { supabase, getImageUrl } from "../lib/supabase";
import { imgSrc } from "../lib/imageOptimize";

interface ProjectCard {
  name: string;
  image: string | null;
  slug: string | null;
  zone: string | null;
  status: string | null;
}

const benefits: { title: string; body: string }[] = [
  {
    title: "Material de venta completo",
    body: "Dossiers, planos, renders, recorridos virtuales, video aéreo y ubicación. Documentación actualizada y lista para compartir con tus clientes desde tu portal privado.",
  },
  {
    title: "Acompañamiento de nuestro equipo",
    body: "Resolvemos contigo las dudas legales, financieras y de obra de cada operación. Tú mantienes la relación con el cliente; nosotros aportamos el respaldo técnico.",
  },
  {
    title: "Compra 100% remota",
    body: "Tus clientes pueden invertir sin desplazarse a Bali: poder notarial y firma digital. Un proceso probado, transparente y seguro de principio a fin.",
  },
  {
    title: "Seguimiento de obra continuo",
    body: "Acceso a fotografías, vídeos y avance de cada proyecto, para que mantengas a tu cliente informado durante toda la construcción.",
  },
  {
    title: "Producto de alta demanda",
    body: "Villas y apartamentos en las zonas más solicitadas de Bali —Uluwatu, Pererenan y Tabanan—, con producto seleccionado para inversión.",
  },
  {
    title: "Colaboración a largo plazo",
    body: "Trabajamos con agencias de varios países bajo un programa serio y estable. Las condiciones del acuerdo se detallan tras la validación.",
  },
];

const steps: { step: string; title: string; body: string }[] = [
  { step: "01", title: "Contacta o regístrate", body: "Completa el formulario con los datos de tu agencia, tu país y el perfil de tus clientes. Dos minutos." },
  { step: "02", title: "Validación en 24-48 h", body: "Mantenemos una llamada o conversación para conocer tu canal. Si encajamos, activamos tu acceso." },
  { step: "03", title: "Acceso al portal de partners", body: "Recibes un panel privado con los proyectos, los materiales descargables y todas las condiciones del programa." },
  { step: "04", title: "Vendes con respaldo", body: "Acompañamos cada operación con tu cliente hasta la firma y la entrega de la propiedad." },
];

export default function AgenciasPartnership() {
  const [projects, setProjects] = useState<ProjectCard[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("name, image, slug, zone, status, is_hidden, sort_order")
        .order("sort_order", { ascending: true });
      const list = (data ?? [])
        .filter((p: any) => !p.is_hidden)
        .map((p: any) => ({ name: p.name, image: p.image, slug: p.slug, zone: p.zone, status: p.status }));
      setProjects(list);
    })();
  }, []);

  return (
    <div className="bg-almond text-primary">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold tracking-wide mb-5">
            Programa de Agencias Colaboradoras
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-5">
            Amplía tu cartera con inversión
            <br />
            <span className="text-primary/60">inmobiliaria premium en Bali</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-8 leading-relaxed">
            Ofrece a tus clientes villas y apartamentos de inversión en las mejores zonas de Bali.
            Te proporcionamos el material de venta, el acompañamiento de nuestro equipo y un proceso
            de compra íntegramente remoto, seguro y transparente.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/agencias/registrar" className="bg-primary text-white px-8 py-4 rounded-full font-semibold hover:translate-y-[-2px] transition shadow-lg">
              Solicitar colaboración
            </Link>
            <Link to="/agencias/login" className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition">
              Acceso partners
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-12 text-center">Por qué colaborar con Unreal Studio</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b) => (
              <article key={b.title} className="bg-almond rounded-2xl p-6 border border-primary/5">
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
          <h2 className="font-serif text-3xl mb-12 text-center">Cómo funciona</h2>
          <ol className="space-y-6">
            {steps.map((s) => (
              <li key={s.step} className="flex gap-6 bg-white rounded-2xl p-6 border border-primary/5">
                <div className="text-5xl font-serif text-primary/25 shrink-0">{s.step}</div>
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
          <h2 className="font-serif text-3xl mb-2 text-center">Cartera de proyectos</h2>
          <p className="text-primary/60 text-center mb-12 max-w-2xl mx-auto">
            Una selección de nuestras promociones en Bali. El detalle completo, los materiales y las
            condiciones comerciales están disponibles en el portal de partners.
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
          <h2 className="font-serif text-4xl mb-4">Construyamos una colaboración</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto leading-relaxed">
            Únete a nuestro programa de agencias y empieza a ofrecer inversión inmobiliaria en Bali
            a tus clientes, con todo el material y el respaldo de nuestro equipo.
          </p>
          <Link to="/agencias/registrar" className="inline-block bg-white text-primary px-8 py-4 rounded-full font-semibold hover:translate-y-[-2px] transition shadow-xl">
            Solicitar colaboración
          </Link>
        </div>
      </section>
    </div>
  );
}
