/**
 * /inversores-info — Public landing for prospective investors.
 * Goal: convert visitors into a contact form submission.
 */
import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const benefits = [
  { emoji: "📈", title: "ROI 15–28% bruto anual", body: "Validado en proyectos en operación. Recuperación de inversión en 5–6 años + plusvalía a la salida." },
  { emoji: "🌴", title: "Bali en alza", body: "Turismo récord post-pandemia. Oferta limitada en zonas premium (Uluwatu, Pererenan, Tabanan)." },
  { emoji: "🏗️", title: "Promotor con track record", body: "+160 unidades diseñadas y construidas. Equipo propio en Bali (legal, obra, gestión)." },
  { emoji: "🤝", title: "Compra 100% remota", body: "POA notarial. No tienes que viajar. Más del 60% de nuestros inversores no han pisado Bali." },
  { emoji: "🛡️", title: "Sin intermediarios", body: "Compras directo al promotor. Misma propiedad sería 30–40% más cara con un middleman." },
  { emoji: "🏠", title: "Alquiler turístico gestionado", body: "Property manager local (Suite Stay) gestiona check-in, limpieza, marketing. Tú cobras neto." },
];

const projects = [
  { name: "Deseo Studio", price: "75k€", area: "Melasti · Uluwatu", roi: "≈22% bruto" },
  { name: "Mambo Villa 1bd", price: "95k€", area: "Melasti · Uluwatu", roi: "≈20% bruto" },
  { name: "Lofts Balangan", price: "99k€", area: "Balangan · Uluwatu", roi: "≈18% bruto" },
  { name: "Mambo Villa 2bd", price: "135k€", area: "Melasti · Uluwatu", roi: "≈17% bruto" },
  { name: "Villa 3hab Balangan", price: "165k€", area: "Balangan · Uluwatu", roi: "≈19% bruto" },
  { name: "The Nook", price: "150–160k€", area: "Pererenan · Canggu", roi: "Consultar" },
];

const faqs: { q: string; a: string }[] = [
  {
    q: "¿Qué garantías tengo si compro a distancia?",
    a: "Firmamos contrato de reserva con cláusulas claras de penalización si la entrega se retrasa. La obra está supervisada por nuestro equipo y reportes semanales con foto/video. Pagos por hitos, no upfront completo.",
  },
  {
    q: "¿Cómo funciona el leasehold?",
    a: "En Bali los extranjeros compramos derecho de uso de la tierra. 23 años iniciales + 10 años extensión por 12.500€ desde el inicio (transmisible). Modelo legal habitual en todo el sudeste asiático.",
  },
  {
    q: "¿Qué impuestos pago?",
    a: "1% al notario en la compra. 0–10% sobre alquiler turístico (en práctica casi todos los propietarios optan por estructura legal donde el efectivo es 0%). Convenio doble imposición España-Indonesia. Te ponemos en contacto con asesor fiscal.",
  },
  {
    q: "¿Qué documentos necesito para comprar?",
    a: "Pasaporte, dirección fiscal, prueba de fondos (extracto bancario o similar). El POA y la escritura las firmas digital o presencial.",
  },
  {
    q: "¿Cuánto tarda la entrega?",
    a: "Depende del proyecto: 6–12 meses para los que están en construcción avanzada (Lofts +65%), 12–18 meses para sobre plano (Deseo, Mambo). Recibirás reportes semanales.",
  },
  {
    q: "¿Qué pasa si necesito vender antes?",
    a: "El leasehold es transmisible — se puede vender el contrato. Tenemos red de inversores y agencias listas para revender (5% comisión típica).",
  },
];

export default function InversoresPartnership() {
  const { t } = useTranslation();
  return (
    <div className="bg-almond text-primary">
      <section className="relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="inline-block bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-medium mb-4">
            {t("inversoresPartnership.tag")}
          </div>
          <h1 className="font-serif text-5xl md:text-6xl leading-tight mb-4">
            {t("inversoresPartnership.heroTitle1")}
            <br />
            <span className="text-primary/60">{t("inversoresPartnership.heroTitle2")}</span>
          </h1>
          <p className="text-lg text-primary/70 max-w-2xl mb-8">
            {t("inversoresPartnership.heroBody")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/contacto" className="bg-primary text-white px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-lg">
              {t("inversoresPartnership.ctaTalk")}
            </Link>
            <Link to="/proyectos" className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition">
              {t("inversoresPartnership.ctaSeeProjects")}
            </Link>
            <Link to="/inversores/login" className="bg-white border border-primary/20 text-primary px-8 py-4 rounded-full font-medium hover:bg-primary/5 transition">
              {t("inversoresPartnership.ctaLogin")}
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-12 text-center">{t("inversoresPartnership.whyTitle")}</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((b) => (
              <article key={b.title} className="bg-almond rounded-2xl p-6">
                <div className="text-4xl mb-3">{b.emoji}</div>
                <h3 className="font-serif text-xl mb-2">{b.title}</h3>
                <p className="text-sm text-primary/70">{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-almond">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-2 text-center">{t("inversoresPartnership.projectsTitle")}</h2>
          <p className="text-primary/60 text-center mb-12">
            {t("inversoresPartnership.projectsSubtitle", { date: new Date().toLocaleDateString() })}
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {projects.map((p) => (
              <article key={p.name} className="bg-white rounded-xl p-5">
                <h3 className="font-serif text-lg">{p.name}</h3>
                <p className="text-xs text-primary/60 mb-2">{p.area}</p>
                <p className="font-bold text-primary">{p.price}</p>
                <p className="text-xs text-primary/60 mt-1">ROI esperado: {p.roi}</p>
              </article>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/proyectos" className="inline-block bg-primary text-white px-6 py-3 rounded-full font-bold">
              Ver todos los proyectos →
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h2 className="font-serif text-3xl mb-8 text-center">{t("inversoresPartnership.faqTitle")}</h2>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="bg-almond rounded-xl p-5 group">
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

      <section className="bg-primary text-white">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <h2 className="font-serif text-4xl mb-4">{t("inversoresPartnership.ctaFinalTitle")}</h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">
            {t("inversoresPartnership.ctaFinalBody")}
          </p>
          <Link to="/contacto" className="inline-block bg-white text-primary px-8 py-4 rounded-full font-bold hover:translate-y-[-2px] transition shadow-xl">
            {t("inversoresPartnership.ctaFinalBtn")}
          </Link>
        </div>
      </section>
    </div>
  );
}
