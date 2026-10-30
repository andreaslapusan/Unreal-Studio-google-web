/**
 * /agendar — ahora redirige a WhatsApp (Globalitae 2026-10-13).
 *
 * Se mantiene la página pero el calendario de GHL se sustituye por un botón que
 * abre WhatsApp con el asesor (copy de bienvenida). Antes embebía el widget de
 * reserva; Andreas pidió canalizar TODO a WhatsApp.
 */
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { usePageMeta } from "../components/PageMeta";
import { WHATSAPP_URL } from "../constants";
import { gtmWhatsappClick } from "../lib/gtm";

export default function Booking() {
  const { t } = useTranslation();
  usePageMeta({ title: t('booking.title', { defaultValue: 'Agendar llamada | Unreal Studio Bali' }), description: t('contact.metaDescription') });

  useEffect(() => {
    document.title = t("booking.title", { defaultValue: "Agendar llamada | Unreal Studio Bali" });
  }, [t]);

  return (
    <div className="bg-almond min-h-screen pb-16">
      <header className="px-6 md:px-12 pt-4 md:pt-16 pb-8 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl text-primary font-serif mb-4 leading-tight">
          {t("booking.heroTitle", { defaultValue: "Reserva una llamada con un asesor" })}
        </h1>
        <p className="text-lg text-primary/70 max-w-2xl mx-auto leading-relaxed">
          {t("booking.heroSubtitleWa", {
            defaultValue:
              "Habla directamente por WhatsApp con nuestro equipo. Te enviamos los dossiers actualizados de los proyectos que mejor encajen con tu perfil.",
          })}
        </p>
      </header>

      <div className="max-w-xl mx-auto px-6 flex flex-col items-center">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => gtmWhatsappClick({ source: 'booking_page' })}
          className="w-full max-w-sm bg-[#25D366] hover:bg-[#20bd5a] text-white px-10 py-5 rounded-full font-black text-sm uppercase tracking-[0.15em] shadow-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.03]"
        >
          {t("booking.waCta", { defaultValue: "Hablar por WhatsApp" })}
          <span className="material-symbols-outlined text-lg">chat</span>
        </a>
      </div>

      <p className="text-center text-xs text-primary/50 mt-6 px-6">
        {t("booking.altCta", { defaultValue: "Si prefieres, también puedes" })}{" "}
        <Link to="/contacto" className="underline">
          {t("booking.altCtaLink", { defaultValue: "escribirnos" })}
        </Link>
        .
      </p>
    </div>
  );
}
