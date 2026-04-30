/**
 * UTM tracking helpers.
 *
 * When a visitor lands on a project page with `?utm_source=lister&utm_partner=...&utm_property=...`,
 * we cache the attribution in localStorage for 24h. If they later submit a
 * contact form or sign up, we attribute the conversion to that partner via
 * a row in the `lead_attributions` table.
 */
const STORAGE_KEY = "_unreal_attribution";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface Attribution {
  source: string;
  partner_id?: string;
  property_slug?: string;
  campaign?: string;
  medium?: string;
  capturedAt: number;
}

export function captureAttributionFromUrl(): Attribution | null {
  if (typeof window === "undefined") return null;

  // BrowserRouter: query string is now in location.search. Legacy hash-based
  // URLs (e.g. /#/proyecto/foo?utm_source=...) are still handled as a fallback
  // for old shared links.
  let params = new URLSearchParams(window.location.search);
  if (!params.get("utm_source")) {
    const hash = window.location.hash;
    const queryStart = hash.indexOf("?");
    if (queryStart >= 0) params = new URLSearchParams(hash.slice(queryStart + 1));
  }
  const source = params.get("utm_source");
  if (!source) return readStoredAttribution();

  const attribution: Attribution = {
    source,
    partner_id: params.get("utm_partner") ?? undefined,
    property_slug: params.get("utm_property") ?? undefined,
    campaign: params.get("utm_campaign") ?? undefined,
    medium: params.get("utm_medium") ?? undefined,
    capturedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // storage may be disabled — silently ignore
  }
  return attribution;
}

export function readStoredAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (Date.now() - parsed.capturedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
