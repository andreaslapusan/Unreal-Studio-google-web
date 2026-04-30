/**
 * Embed a GHL / Neo Software booking widget inside a project page.
 *
 * Appends UTM + property_slug + partner_id as query params on the iframe
 * URL so the resulting booking lands in GHL with full attribution context.
 * The GHL widget engine reads any extra query params and stores them on
 * the contact when the booking is confirmed (custom fields).
 *
 * Auto-resize: GHL ships a `form_embed.js` companion script that
 * postMessages height changes. We load it once per page on mount.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { readStoredAttribution } from "../lib/utm-tracking";

interface Props {
  url: string;
  /** Slug of the project the widget is shown on; sent as utm_property if not already set. */
  propertySlug?: string;
  /** Optional override id used as iframe id + form_embed targeting. */
  widgetId?: string;
}

const FORM_EMBED_SRC = "https://api.neo.software/js/form_embed.js";

function withAttributionParams(rawUrl: string, propertySlug?: string): string {
  try {
    const url = new URL(rawUrl);
    const stored = readStoredAttribution();
    const hashAttrib = (() => {
      // Mirror the capture logic — pull UTMs from the current hash route too.
      if (typeof window === "undefined") return null;
      const h = window.location.hash;
      const q = h.indexOf("?");
      if (q < 0) return null;
      return new URLSearchParams(h.slice(q + 1));
    })();

    const setIfMissing = (key: string, value?: string | null) => {
      if (!value) return;
      if (url.searchParams.has(key)) return;
      url.searchParams.set(key, value);
    };

    setIfMissing("utm_source", stored?.source ?? hashAttrib?.get("utm_source") ?? "project_page");
    setIfMissing("utm_medium", stored?.medium ?? hashAttrib?.get("utm_medium") ?? "embedded_widget");
    setIfMissing("utm_campaign", stored?.campaign ?? hashAttrib?.get("utm_campaign") ?? undefined);
    setIfMissing("utm_partner", stored?.partner_id ?? hashAttrib?.get("utm_partner") ?? undefined);
    setIfMissing("utm_property", stored?.property_slug ?? hashAttrib?.get("utm_property") ?? propertySlug);
    if (propertySlug) setIfMissing("property_slug", propertySlug);

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export default function BookingWidget({ url, propertySlug, widgetId }: Props) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const finalUrl = useMemo(() => withAttributionParams(url, propertySlug), [url, propertySlug]);

  // Pull in GHL's form_embed.js once per page; it handles iframe height
  // postMessages so the widget doesn't show a scroll bar.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FORM_EMBED_SRC}"]`);
    if (existing) return;
    const s = document.createElement("script");
    s.src = FORM_EMBED_SRC;
    s.async = true;
    s.type = "text/javascript";
    document.body.appendChild(s);
  }, []);

  // Stable iframe id so GHL's form_embed.js can match it. Includes a
  // timestamp suffix to match GHL's own example markup.
  const id = useMemo(() => widgetId ?? `unreal-booking-${Date.now()}`, [widgetId]);

  return (
    <section className="py-12 md:py-16 px-6 md:px-12 bg-almond">
      <div className="max-w-4xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 mb-3">
          {t("bookingWidget.tag", { defaultValue: "AGENDAR LLAMADA" })}
        </p>
        <h2 className="text-3xl md:text-4xl font-serif text-primary mb-3">
          {t("bookingWidget.title", { defaultValue: "Reserva 15 minutos con un asesor" })}
        </h2>
        <p className="text-primary/70 mb-8 max-w-2xl">
          {t("bookingWidget.body", {
            defaultValue: "Te resolvemos cualquier duda y te enviamos los dossiers actualizados de los proyectos que mejor encajen con tu perfil.",
          })}
        </p>

        <div className="bg-white rounded-3xl shadow-xl border border-primary/5 overflow-hidden">
          <iframe
            ref={iframeRef}
            id={id}
            src={finalUrl}
            title="Booking calendar"
            style={{ width: "100%", border: 0, overflow: "hidden", minHeight: 720 }}
            scrolling="no"
            loading="lazy"
            allow="payment *; geolocation *"
          />
        </div>
      </div>
    </section>
  );
}
