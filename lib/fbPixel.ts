/**
 * Thin wrapper around the Meta Pixel.
 *
 * Pixel ID: 866349369727610
 * Boot:     index.html (queued + deferred to idle)
 *
 * This module just gives us typed helpers so we can fire standard
 * Meta events from React components without sprinkling `(window as any).fbq`
 * everywhere.
 *
 * Standard events we use:
 *   - PageView         → fired automatically on every route change (App.tsx)
 *   - ViewContent      → ProjectDetail mount
 *   - Lead             → form_submit (Contact, AgenciasRegistrar)
 *   - Schedule         → "Agendar llamada" CTA click (handled inline if we ever
 *                        want client-side tracking; the booking opens in a new
 *                        tab so server-side conversion via GHL → Meta API is
 *                        the better attribution signal anyway)
 *   - Search           → reserved for FAQ search & Projects filter (not used yet)
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

type Params = Record<string, unknown>;

function call(...args: unknown[]) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  try {
    window.fbq(...args);
  } catch {
    // noop — never let analytics throw
  }
}

export function trackPageView(path?: string): void {
  // Default `track PageView` is called once on initial load by index.html.
  // For SPA route changes, fire PageView with the new path so Meta records
  // each virtual pageview separately.
  if (path) {
    call("track", "PageView", { page_path: path });
  } else {
    call("track", "PageView");
  }
}

export function trackViewContent(params: {
  content_ids?: string[];
  content_name?: string;
  content_category?: string;
  content_type?: string;
  value?: number;
  currency?: string;
}): void {
  call("track", "ViewContent", params);
}

export function trackLead(params: {
  content_name?: string;
  content_category?: string;
  value?: number;
  currency?: string;
}): void {
  call("track", "Lead", params);
}

export function trackSchedule(params: Params = {}): void {
  call("track", "Schedule", params);
}
