/**
 * Build a GHL booking URL with UTMs appended.
 *
 * Used by every "Agendar llamada" CTA so the booking that lands in GHL
 * carries source/medium/campaign/partner/property context. Opens in a
 * new tab so the iframe (which grabs wheel events) doesn't break scroll
 * on the host page.
 */
import { readStoredAttribution } from "./utm-tracking";

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
  /** Override the calendar URL (per-project booking_widget_url). */
  url?: string;
}

export function bookingLink(opts: BookingLinkOpts): string {
  const base = opts.url ?? DEFAULT_BOOKING_URL;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return base;
  }

  const stored = readStoredAttribution();
  const setIfMissing = (key: string, value?: string | null) => {
    if (!value) return;
    if (url.searchParams.has(key)) return;
    url.searchParams.set(key, value);
  };

  setIfMissing("utm_source", stored?.source ?? opts.source ?? "web");
  setIfMissing("utm_medium", opts.medium);
  setIfMissing("utm_campaign", opts.campaign ?? stored?.campaign ?? "agendar_btn");
  setIfMissing("utm_partner", stored?.partner_id ?? undefined);
  setIfMissing("utm_property", opts.propertySlug ?? stored?.property_slug ?? undefined);
  if (opts.propertySlug) setIfMissing("property_slug", opts.propertySlug);

  return url.toString();
}
