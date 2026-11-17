/**
 * UTM tracking helpers.
 *
 * When a visitor lands on a project page with `?utm_source=lister&utm_partner=...&utm_property=...`,
 * we cache the attribution in localStorage for 365 days (= the 12-month client protection in the agency
 * contract). If they later submit a contact form or sign up, we attribute the conversion to that partner via
 * a row in the `lead_attributions` table.
 *
 * Rule (17-nov-2026): the FIRST agency wins, unless a NEWER link with an explicit `utm_partner` arrives
 * (then that agency replaces it). A later visit with other UTMs but no `utm_partner` never erases an agency.
 */
const STORAGE_KEY = "_unreal_attribution";
const TTL_MS = 365 * 24 * 60 * 60 * 1000;

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
  const stored = readStoredAttribution();
  if (stored?.partner_id && !params.get("utm_partner")) return stored;

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

/** Agency ref code for WhatsApp messages = utm_partner value (personal_link_slug) in capitals; searchable in admin › Agencias. */
export const refCode = (a: Attribution | null): string | null => (a?.partner_id ? String(a.partner_id).toUpperCase() : null);

// public pages only (not admin / agency portal & packs / client & team portals)
const PRIVATE_PATH = /^\/(?:[a-z]{2}\/)?(?:admin|agencias\/|cliente|empleados|portal)/;

/** Appends "\n\nRef: <CODE>" to a prefilled WhatsApp text when this visitor came from an agency link. */
export function withWhatsappRef(text: string): string {
  if (typeof window === "undefined" || PRIVATE_PATH.test(window.location.pathname)) return text;
  const code = refCode(readStoredAttribution());
  if (!code || /\bRef: /.test(text)) return text;
  return text ? `${text}\n\nRef: ${code}` : `Ref: ${code}`;
}

/** Every public wa.me / api.whatsapp link a visitor clicks gets the ref (bubble phase: runs after React handlers that set the href). */
export function initWhatsappRef(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(a.href)) return;
    try {
      const u = new URL(a.href);
      const text = u.searchParams.get("text") ?? "";
      const next = withWhatsappRef(text);
      if (next !== text) { u.searchParams.set("text", next); a.href = u.toString(); }
    } catch { /* malformed href: leave it */ }
  });
}
