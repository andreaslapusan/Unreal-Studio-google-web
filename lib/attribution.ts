/**
 * Lead attribution glue.
 *
 * Goal: when a visitor lands on a project page from a partner-shared link
 * (e.g. /#/proyecto/foo?utm_source=lister&utm_partner=madrid-realty), we
 * want to:
 *
 *   1. Cache the attribution so subsequent form submits can claim it
 *   2. Insert a `visit` row in lead_attributions immediately (so partner
 *      stats show traffic even if the visitor never converts)
 *   3. Resolve `utm_partner` (which may be a UUID or a personal_link_slug)
 *      to a `listing_partners.id` UUID for the FK in lead_attributions
 *
 * On form submit (Contact / AgenciasRegistrar / etc), we read the cached
 * attribution and insert a `form_submit` row tagged with the form's
 * contact info — that's the row the ghl-sync edge function will pick up
 * to tag the GHL contact with `lister:<agency_slug>`.
 *
 * Why a thin module on top of utm-tracking.ts:
 *   - utm-tracking.ts is pure localStorage helpers (no Supabase dependency)
 *   - this layer adds the DB writes + slug→id resolution
 *
 * Failure-tolerant: every Supabase call is wrapped — a missing partner /
 * blocked storage / RLS reject must never break the user flow. Worst case
 * we lose attribution for that lead, which is silently logged to console.
 */
import { supabase } from "./supabase";
import {
  Attribution,
  captureAttributionFromUrl,
  readStoredAttribution,
} from "./utm-tracking";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOLVED_PARTNER_KEY = "_unreal_partner_uuid";

interface ResolvedAttribution extends Attribution {
  partner_uuid?: string | null;
}

/**
 * Resolve a partner reference (UUID or personal_link_slug) to a UUID.
 * Caches the result in localStorage so we don't re-query on every page view.
 */
async function resolvePartnerUuid(ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  if (UUID_RE.test(ref)) return ref;

  // Slug — check localStorage cache first
  if (typeof window !== "undefined") {
    try {
      const cached = JSON.parse(window.localStorage.getItem(RESOLVED_PARTNER_KEY) || "null") as { slug: string; uuid: string } | null;
      if (cached && cached.slug === ref) return cached.uuid;
    } catch {
      // ignore
    }
  }

  try {
    const { data } = await supabase
      .from("listing_partners")
      .select("id")
      .eq("personal_link_slug", ref)
      .maybeSingle();
    const uuid = data?.id ?? null;
    if (uuid && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(RESOLVED_PARTNER_KEY, JSON.stringify({ slug: ref, uuid }));
      } catch {
        // ignore
      }
    }
    return uuid;
  } catch (err) {
    console.warn("[attribution] failed to resolve partner slug:", err);
    return null;
  }
}

/**
 * Called once on app boot (or on hash-route change) to:
 *   - capture URL utm params into localStorage
 *   - resolve partner ref to UUID
 *   - record a visit row in lead_attributions if the URL had attribution
 */
export async function trackPageVisit(): Promise<ResolvedAttribution | null> {
  const captured = captureAttributionFromUrl();
  if (!captured) return null;

  // No utm_source means no attribution to record — captureAttributionFromUrl
  // already handled storage logic, just exit.
  if (!captured.source) return captured;

  const partner_uuid = await resolvePartnerUuid(captured.partner_id);

  // Best-effort: insert a visit event. RLS allows anon insert (event_type='visit').
  try {
    await supabase.from("lead_attributions").insert({
      utm_source: captured.source,
      partner_id: partner_uuid,
      property_slug: captured.property_slug ?? null,
      utm_campaign: captured.campaign ?? null,
      utm_medium: captured.medium ?? null,
      event_type: "visit",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    });
  } catch (err) {
    console.warn("[attribution] visit insert failed:", err);
  }

  return { ...captured, partner_uuid };
}

/**
 * Read cached attribution and insert a `form_submit` row. Call this from
 * Contact / AgenciasRegistrar / InversoresLogin / any conversion form
 * BEFORE the user is redirected away.
 *
 * Safe to call when there's no stored attribution — does nothing.
 */
/**
 * Record a form_submit. ALWAYS writes a row so the lead syncs to GHL
 * (the lead_attributions trigger fires ghl-sync which creates a GHL
 * contact + tags it). If there's no stored UTM attribution, we still
 * record `utm_source = 'web_form'` so the funnel team can see the lead
 * came from a direct site form fill.
 */
export async function recordFormSubmit(contact: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  /** Override the default source ('web_form') for direct form fills. */
  defaultSource?: string;
}): Promise<void> {
  const stored = readStoredAttribution();
  const partner_uuid = stored?.partner_id ? await resolvePartnerUuid(stored.partner_id) : null;

  try {
    await supabase.from("lead_attributions").insert({
      contact_email: contact.email ?? null,
      contact_phone: contact.phone ?? null,
      contact_name: contact.name ?? null,
      utm_source: stored?.source ?? contact.defaultSource ?? "web_form",
      partner_id: partner_uuid,
      property_slug: stored?.property_slug ?? null,
      utm_campaign: stored?.campaign ?? null,
      utm_medium: stored?.medium ?? null,
      event_type: "form_submit",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
    });
  } catch (err) {
    console.warn("[attribution] form_submit insert failed:", err);
  }
}

export { readStoredAttribution } from "./utm-tracking";
