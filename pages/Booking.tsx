/**
 * /agendar — full-page booking calendar.
 *
 * Replaces the old "Agendar llamada" WhatsApp deeplink. The widget reads
 * UTMs from the URL (utm_source / utm_medium / utm_campaign / utm_partner /
 * utm_property) and forwards them to the GHL booking iframe so we can see
 * exactly which CTA the booking came from.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { usePageMeta } from "../components/PageMeta";
import { readSWR, writeSWR } from "../lib/swrCache";
import BookingWidget from "../components/BookingWidget";

const FALLBACK_URL = "https://api.neo.software/widget/booking/KdAikEYhZVPgMylze6lO";

export default function Booking() {
  const { t } = useTranslation();
  usePageMeta({ title: t('booking.title', { defaultValue: 'Agendar llamada | Unreal Studio Bali' }), description: t('contact.metaDescription') });
  // Re-use the catalog cache to discover whichever booking_widget_url is
  // configured. We use Golf Bay Lofts as the canonical source-of-truth so
  // when Marcelino swaps the GHL calendar in the admin, this page picks it
  // up without a code change.
  const [url, setUrl] = useState<string>(() => readSWR<string>("booking_url") ?? FALLBACK_URL);

  useEffect(() => {
    document.title = t("booking.title", { defaultValue: "Agendar llamada | Unreal Studio Bali" });
  }, [t]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("booking_widget_url")
        .not("booking_widget_url", "is", null)
        .limit(1)
        .maybeSingle();
      const next = (data?.booking_widget_url as string | undefined) ?? FALLBACK_URL;
      setUrl(next);
      writeSWR("booking_url", next);
    })();
  }, []);

  return (
    <div className="bg-almond min-h-screen pb-16">
      <header className="px-5 md:px-12 pt-10 md:pt-16 pb-10 max-w-[1440px] mx-auto space-y-6">
        <h1 className="font-display uppercase text-[2.4rem] leading-[0.95] sm:text-6xl md:text-7xl text-primary max-w-5xl us-rise">
          {t("booking.heroTitle", { defaultValue: "Reserva una llamada con un asesor" })}
        </h1>
        <p className="text-base md:text-lg text-primary/65 max-w-2xl leading-relaxed">
          {t("booking.heroSubtitle", {
            defaultValue:
              "30 minutos por videollamada con nuestro equipo. Te enviamos los dossiers actualizados de los proyectos que mejor encajen con tu perfil.",
          })}
        </p>
      </header>

      <BookingWidget url={url} />

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
