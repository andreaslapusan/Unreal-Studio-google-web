/**
 * Build a GHL booking URL with UTMs appended.
 *
 * Used by every "Agendar llamada" CTA so the booking that lands in GHL
 * carries source/medium/campaign/partner/property context. Opens in a
 * new tab so the iframe (which grabs wheel events) doesn't break scroll
 * on the host page.
 */
import { whatsappUrl, whatsappProjectUrl } from "../constants";

export const DEFAULT_BOOKING_URL =
  "https://api.neo.software/widget/booking/KdAikEYhZVPgMylze6lO";

export interface BookingLinkOpts {
  /** UTM medium identifying the CTA (cta_floating, cta_navbar, project_page, etc.) */
  medium: string;
  /** Optional override for utm_source. Defaults to 'web'. */
  source?: string;
  /** Optional campaign tag. Defaults to 'agendar_btn'. */
  campaign?: string;
  /** Slug of the project the user was looking at when they clicked. */
  propertySlug?: string;
  /** Project name → usa el copy de WhatsApp específico de proyecto. */
  propertyName?: string;
  /** Override the calendar URL (per-project booking_widget_url). */
  url?: string;
}

export function bookingLink(opts: BookingLinkOpts): string {
  // 2026-10-13 (Globalitae): "Agendar llamada" ya NO abre el calendario de GHL.
  // Todos los CTAs de agendar redirigen al WhatsApp del asesor. Si se pasa el
  // nombre de proyecto se usa el copy específico; si no, el de bienvenida genérico.
  return opts.propertyName
    ? whatsappProjectUrl(opts.propertyName)
    : whatsappUrl();
}
