/**
 * /agencias-partnership — Public landing page for the Listing Partner program.
 * Goal: convert visitors into applications (form on /agencias/registrar).
 *
 * Sections:
 *  - Hero with value prop
 *  - Why partner with us (3 columns)
 *  - How it works (4 steps)
 *  - Commission + projects available
 *  - FAQ
 *  - CTA to /agencias/registrar
 */
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const projectsAvailable = [
  { name: "Lofts Balangan", price: "99.000€", area: "Uluwatu Oeste", progress: "60%+" },
  { name: "Villa 3hab Balangan", price: "165.000€", area: "Uluwatu Oeste", progress: "60%+" },
  { name: "Mambo Villa", price: "95.000€", area: "Melasti", progress: "0% (sobre plano)" },
  { name: "Deseo Studio", price: "75.000€", area: "Melasti", progress: "0% (sobre plano)" },
  { name: "The Nook", price: "150-160k€", area: "Pererenan", progress: "Sobre plano" },
  { name: "Villa Crunchy", price: "Consultar", area: "Tabanan / Kaba-Kaba", progress: "En obra" },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "¿Cuánto gano por unidad cerrada?",
    a: "5% de comisión sobre el precio de venta. En proyectos de 99.000€ son 4.950€ por unidad. Pagamos al cierre del contrato de reserva, no esperamos al pago final.",
  },
  {
    q: "¿Cómo me dais el material?",
    a: "Acceso al portal con dossiers PDF, planos 2D, renders 3D, video walkthrough, drone, ubicación Google Maps y plan de pagos detallado. Todo descargable y compartible con tus clientes.",
  },
  {
    q: "¿Quién hace el cierre de venta?",
    a: "Tú llevas la conversación con tu cliente. Cuando esté listo, agendamos llamada con nuestro equipo para resolver dudas técnicas. Tú estás en copia. La comisión es tuya.",
  },
  {
    q: "¿Puedo listar las propiedades en mi web?",
    a: "Sí. Te damos contenido, datos y pricing. Puedes incluir un margen de markup encima si quieres (siempre que mantengas el precio dentro del rango aprobado).",
  },
  {
    q: "¿Hay exclusividad por zona?",
    a: "No por defecto. Si traes volumen sostenido, podemos hablar de un acuerdo preferente. Volumen mínimo 3 unidades / mes para considerar exclusividad regional.",
  },
  {
    q: "¿Trabajáis con agencias de fuera de Bali?",
    a: "Sí. Tenemos colaboradores en España, Australia, Indonesia (varios), y Italia. La compra es 100% remota — tu cliente no necesita venir a Bali.",
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
            {t("agenciasPartnership.tag")}
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-4">
            {t("agenciasPartnership.heroTitle1")}
            <br />
            <span className="text-primary/60">{t("agenciasPartnership.heroTitle2")}</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-8">
            {t("agenciasPartnership.heroBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/agencias/registrar"
              className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg"
            >
              {t("agenciasPartnership.ctaApply")}
            </Link>
            <Link
              to="/agencias/login"
              className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition"
            >
              {t("agenciasPartnership.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-12 text-center">{t("agenciasPartnership.whyTitle")}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                emoji: "💰",
                title: "Comisión clara, 5% al cierre",
                body:
                  "Sin esperar al pago final del cliente. Cuando se firma la reserva, cobras tu parte.",
              },
              {
                emoji: "📦",
                title: "Material de venta listo",
                body:
                  "Dossiers, planos 2D, renders, walkthrough, video drone, Google Maps. Todo descargable y actualizado en tu portal privado.",
              },
              {
                emoji: "🤝",
                title: "Equipo técnico en copia",
                body:
                  "Cuando haya que resolver dudas legales, financieras o de obra, nuestro equipo entra al call. Tú llevas la relación.",
              },
              {
                emoji: "🌐",
                title: "Compra 100% remota",
                body:
                  "Tu cliente no necesita venir a Bali. POA notarial + escritura digital. Hemos cerrado más del 60% de las ventas así.",
              },
              {
                emoji: "🎥",
                title: "Updates de obra automáticos",
                body:
                  "Cada semana recibes fotos, video, % progreso y reportes mensuales. Para que mantengas a tu cliente al día sin esfuerzo.",
              },
              {
                emoji: "🏝️",
                title: "Bali está en alza",
                body:
                  "Turismo récord post-pandemia, oferta limitada en Uluwatu / Pererenan, ROI 15-28% bruto anual validado por nuestros casos.",
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
          <h2 className="font-serif text-3xl mb-12 text-center">{t("agenciasPartnership.howTitle")}</h2>
          <ol className="space-y-6">
            {[
              {
                step: "01",
                title: "Aplicas en este formulario",
                body: "Completas datos básicos: agencia, contacto, país, proyectos de interés, volumen. Tarda 2 minutos.",
              },
              {
                step: "02",
                title: "Te validamos en 24-48h",
                body: "Llamada o WhatsApp con nuestro equipo para entender tu canal y a qué clientes vas a llegar. Si encajamos, te activamos.",
              },
              {
                step: "03",
                title: "Recibes acceso al portal",
                body: "Tienes un dashboard privado con todos los proyectos asignados, materiales descargables, y tu link único para compartir con clientes.",
              },
              {
                step: "04",
                title: "Cierras tu primera venta",
                body: "Cuando tu cliente firma reserva, te transferimos el 5% en menos de 7 días. Y empezamos la siguiente.",
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

      {/* Available projects */}
      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-2 text-center">{t("agenciasPartnership.projectsTitle")}</h2>
          <p className="text-primary/60 text-center mb-12">
            {t("agenciasPartnership.projectsSubtitle", { date: new Date().toLocaleDateString() })}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {projectsAvailable.map((p) => (
              <article key={p.name} className="bg-almond rounded-xl p-5">
                <h3 className="font-serif text-lg">{p.name}</h3>
                <p className="text-xs text-primary/60 mb-2">{p.area}</p>
                <p className="font-bold text-primary">{p.price}</p>
                <p className="text-xs text-primary/60 mt-1">Obra: {p.progress}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-almond">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-8 text-center">{t("agenciasPartnership.faqTitle")}</h2>
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
          <h2 className="font-serif text-4xl mb-4">{t("agenciasPartnership.ctaFinalTitle")}</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            {t("agenciasPartnership.ctaFinalBody")}
          </p>
          <Link
            to="/agencias/registrar"
            className="inline-block bg-white text-primary px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-xl"
          >
            {t("agenciasPartnership.ctaFinalBtn")}
          </Link>
        </div>
      </section>
    </div>
  );
}
