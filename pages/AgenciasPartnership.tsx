/**
 * /agencias — Landing PÚBLICA de captación de agencias (Listing Partners).
 *
 * ⚠️ PÚBLICA + se usa en campañas frías a agencias. NO incluir info confidencial:
 * sin comisiones/porcentajes, sin precios de agencia por unidad, sin markup,
 * sin calculadora de ganancias. Todo eso vive SOLO tras el login de partners
 * (/agencias/login → /agencias/dashboard). Objetivo: captar contacto/aplicación.
 */
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Solo nombres/zonas públicas (sin precios). Las cifras van tras el login.
const projectsAvailable = [
  { name: "Golf Bay — Balangan", area: "Uluwatu Oeste", progress: "60%+" },
  { name: "Mambo Villas", area: "Melasti", progress: "Sobre plano" },
  { name: "Deseo Studios", area: "Melasti", progress: "Sobre plano" },
  { name: "The Nook", area: "Pererenan", progress: "Sobre plano" },
  { name: "Venaso", area: "Tabanan / Kaba-Kaba", progress: "En obra" },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "¿Qué material recibo para vender?",
    a: "Acceso a un portal privado con dossiers PDF, planos 2D, renders 3D, video walkthrough, drone, ubicación Google Maps y toda la documentación. Todo descargable y compartible con tus clientes.",
  },
  {
    q: "¿Quién hace el cierre de venta?",
    a: "Tú llevas la relación con tu cliente. Cuando esté listo, agendamos una llamada con nuestro equipo para resolver dudas técnicas/legales, contigo en copia.",
  },
  {
    q: "¿La compra es remota?",
    a: "Sí, 100% remota. Tu cliente no necesita venir a Bali: POA notarial + firma digital. Tenemos colaboradores en España, Australia, Indonesia e Italia.",
  },
  {
    q: "¿Cómo empiezo?",
    a: "Rellena el formulario de contacto. Te validamos en 24-48h y, si encajamos, te damos acceso al portal de partners con todos los detalles del programa.",
  },
];

export default function AgenciasPartnership() {
  const { t } = useTranslation();
  return (
    <div className="bg-almond text-primary">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium mb-4">
            Programa de agencias colaboradoras
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-4">
            ¿Tienes una agencia con clientes
            <br />
            <span className="text-primary/60">interesados en invertir en Bali?</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-8">
            Vende nuestras villas y apartamentos en las mejores zonas de Bali. Te damos el material de
            venta, el soporte de nuestro equipo y un proceso de compra 100% remoto para tus clientes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/agencias/registrar"
              className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg"
            >
              Apúntate / Contáctanos
            </Link>
            <Link
              to="/agencias/login"
              className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition"
            >
              Ya soy partner — Entrar
            </Link>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-12 text-center">Por qué colaborar con nosotros</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                emoji: "📦",
                title: "Material de venta listo",
                body:
                  "Dossiers, planos 2D, renders, walkthrough, video drone y ubicación. Todo descargable y actualizado en tu portal privado.",
              },
              {
                emoji: "🤝",
                title: "Soporte de nuestro equipo",
                body:
                  "Cuando haya que resolver dudas legales, financieras o de obra, nuestro equipo entra al call. Tú llevas la relación con el cliente.",
              },
              {
                emoji: "🌐",
                title: "Compra 100% remota",
                body:
                  "Tu cliente no necesita venir a Bali. POA notarial + escritura digital. Un proceso probado de extremo a extremo.",
              },
              {
                emoji: "🎥",
                title: "Updates de obra automáticos",
                body:
                  "Recibes fotos, video y % de progreso de cada proyecto, para mantener a tu cliente al día sin esfuerzo.",
              },
              {
                emoji: "🏝️",
                title: "Producto en alza",
                body:
                  "Villas y apartamentos premium en Uluwatu, Pererenan y zonas de alta demanda turística en Bali.",
              },
              {
                emoji: "💼",
                title: "Programa serio y a largo plazo",
                body:
                  "Trabajamos con agencias de varios países. Las condiciones del programa te las detallamos tras validarte.",
              },
            ].map((b) => (
              <article key={b.title} className="bg-almond rounded-2xl p-6">
                <div className="text-4xl mb-3">{b.emoji}</div>
                <h3 className="font-serif text-xl mb-2">{b.title}</h3>
                <p className="text-sm text-primary/70">{b.body}</p>
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
            {[
              {
                step: "01",
                title: "Nos contactas / te apuntas",
                body: "Rellena el formulario: agencia, contacto, país y a qué clientes llegas. Tarda 2 minutos.",
              },
              {
                step: "02",
                title: "Te validamos en 24-48h",
                body: "Llamada o WhatsApp con nuestro equipo para entender tu canal. Si encajamos, te activamos.",
              },
              {
                step: "03",
                title: "Recibes acceso al portal",
                body: "Dashboard privado con los proyectos, materiales descargables y todos los detalles del programa.",
              },
              {
                step: "04",
                title: "Vendes a tus clientes",
                body: "Acompañamos cada operación con tu cliente hasta el cierre y la entrega.",
              },
            ].map((s) => (
              <li key={s.step} className="flex gap-6 bg-white rounded-2xl p-6">
                <div className="text-5xl font-serif text-primary/30 shrink-0">{s.step}</div>
                <div>
                  <h3 className="font-serif text-xl mb-1">{s.title}</h3>
                  <p className="text-sm text-primary/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Projects (sin precios) */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-2 text-center">Proyectos disponibles</h2>
          <p className="text-primary/60 text-center mb-12">
            Cartera en Bali. Detalles, materiales y condiciones, en el portal de partners.
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {projectsAvailable.map((p) => (
              <article key={p.name} className="bg-almond rounded-xl p-5">
                <h3 className="font-serif text-lg">{p.name}</h3>
                <p className="text-xs text-primary/60 mb-2">{p.area}</p>
                <p className="text-xs text-primary/60 mt-1">Obra: {p.progress}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-almond">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-8 text-center">Preguntas frecuentes</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="bg-white rounded-xl p-5 group">
                <summary className="cursor-pointer font-medium text-primary list-none flex items-start justify-between gap-4">
                  <span>{f.q}</span>
                  <span className="text-primary/40 group-open:rotate-45 transition">+</span>
                </summary>
                <p className="text-sm text-primary/70 mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-serif text-4xl mb-4">¿Hablamos?</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            Apúntate al programa de agencias y empieza a vender propiedad de inversión en Bali a tus clientes.
          </p>
          <Link
            to="/agencias/registrar"
            className="inline-block bg-white text-primary px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-xl"
          >
            Apúntate / Contáctanos
          </Link>
        </div>
      </section>
    </div>
  );
}
