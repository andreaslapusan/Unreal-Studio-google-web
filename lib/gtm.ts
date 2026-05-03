/**
 * Google Tag Manager dataLayer wrapper.
 *
 * Container ID: GTM-NHNQM6VG
 * Boot:         index.html (top of <head>)
 *
 * GTM is the central tag dispatcher. From its UI we wire dataLayer events
 * to GA4, Meta CAPI, Google Ads, etc. without redeploying the frontend.
 *
 * Standard events we emit from the SPA:
 *   - page_view       on every React Router location change
 *   - view_item       when a project page mounts
 *   - generate_lead   when a form is submitted
 *   - schedule        when an appointment booking flow starts
 *   - whatsapp_click  when a WhatsApp CTA is clicked
 *   - login           when an admin/agency user authenticates
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type Params = Record<string, unknown>;

function push(event: string, params?: Params): void {
  if (typeof window === "undefined") return;
  if (!Array.isArray(window.dataLayer)) {
    window.dataLayer = [];
  }
  try {
    window.dataLayer.push({ event, ...(params ?? {}) });
  } catch {
    // never let analytics throw
  }
}

export function gtmPageView(path: string, title?: string): void {
  push("page_view", {
    page_path: path,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
    page_location: typeof window !== "undefined" ? window.location.href : undefined,
  });
}

export function gtmEvent(event: string, params?: Params): void {
  push(event, params);
}

export function gtmViewItem(params: {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  currency?: string;
}): void {
  push("view_item", {
    ecommerce: {
      currency: params.currency ?? "EUR",
      items: [
        {
          item_id: params.item_id,
          item_name: params.item_name,
          item_category: params.item_category,
          price: params.price,
        },
      ],
    },
  });
}

export function gtmGenerateLead(params: {
  form_id?: string;
  form_destination?: string;
  value?: number;
  currency?: string;
} = {}): void {
  push("generate_lead", {
    currency: params.currency ?? "EUR",
    value: params.value,
    form_id: params.form_id,
    form_destination: params.form_destination,
  });
}

export function gtmSchedule(params: {
  channel?: string;
  source?: string;
} = {}): void {
  push("schedule", {
    channel: params.channel,
    source: params.source,
  });
}

export function gtmWhatsappClick(params: {
  source?: string;
  phone?: string;
} = {}): void {
  push("whatsapp_click", {
    source: params.source,
    phone: params.phone,
  });
}

export function gtmLogin(params: {
  method: "magic_link" | "google" | "legacy";
  role?: string;
} = { method: "legacy" }): void {
  push("login", {
    method: params.method,
    role: params.role,
  });
}
