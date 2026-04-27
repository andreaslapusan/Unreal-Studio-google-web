// Supabase Edge Function — bidirectional sync between Supabase events
// and GoHighLevel CRM.
//
// Triggers (database webhooks pointed at this function):
//  - listing_partner_applications INSERT → push contact to GHL pipeline
//  - listing_partners UPDATE (status=active) → tag + move opp stage
//  - investors INSERT → create contact + opp in FUNNEL PRINCIPAL
//  - property_updates INSERT → tag investors/listers and trigger GHL workflow
//
// Inbound (HTTP POST from GHL webhooks):
//  - GHL contact tag added/changed → upsert listing_partners or investors
//  - GHL opp stage moved → adjust local status
//
// Deploy: `supabase functions deploy ghl-sync` (after `supabase login` with the PAT)
//
// Required env (set with `supabase secrets set ...`):
//  - GHL_API_TOKEN
//  - GHL_LOCATION_ID
//  - GHL_PIPELINE_LISTING_ID  (default: YNiATL5JmkQ5ZtpRuWLr)
//  - GHL_PIPELINE_PRINCIPAL_ID (default: X5mByoeHMbsYrFJbM4GP)
//  - SUPABASE_URL
//  - SUPABASE_SERVICE_ROLE_KEY  (auto-injected by Supabase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GHL_TOKEN = Deno.env.get("GHL_API_TOKEN") ?? "";
const GHL_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const PIPE_LISTING = Deno.env.get("GHL_PIPELINE_LISTING_ID") ?? "YNiATL5JmkQ5ZtpRuWLr";
const PIPE_PRINCIPAL = Deno.env.get("GHL_PIPELINE_PRINCIPAL_ID") ?? "X5mByoeHMbsYrFJbM4GP";

const STAGE_LISTING_NEW   = "835d2c34-1200-410b-9259-0c722be2a19b"; // Agencias Sin Contactar
const STAGE_LISTING_LIVE  = "ad15f02c-ea91-45f7-9ef9-813e3ede2128"; // Contactadas y Listadas
const STAGE_PRINCIPAL_NEW = "24bdd77b-c9e6-4c55-8e09-9d6286a80c02"; // 🚨 Nuevo registro

const ghl = (path: string, init?: RequestInit) =>
  fetch(`https://services.leadconnectorhq.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GHL_TOKEN}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      "User-Agent": "curl/8.5.0",
      ...(init?.headers ?? {}),
    },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supa = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

interface Webhook<T = unknown> {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: T;
  old_record?: T;
}

// ─── Handlers per table ──────────────────────────────────────────────────

interface Application {
  id: string;
  agency_name: string;
  manager_name: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  projects_interested: string[] | null;
  monthly_volume: string | null;
  notes: string | null;
}

async function handleApplicationInsert(row: Application) {
  // 1. Create / find GHL contact
  const search = await ghl(
    `/contacts/search/duplicate?locationId=${GHL_LOC}&email=${encodeURIComponent(row.email)}`
  );
  const sd = await search.json();
  let contactId = sd?.contact?.id as string | undefined;

  if (!contactId) {
    const created = await ghl("/contacts/", {
      method: "POST",
      body: JSON.stringify({
        locationId: GHL_LOC,
        firstName: row.agency_name,
        lastName: row.manager_name ?? "",
        email: row.email,
        phone: row.whatsapp ?? row.phone ?? null,
        tags: [
          "agencia_listing",
          "self_signup",
          ...(row.projects_interested ?? []).map((p) =>
            "interes_" + p.toLowerCase().replace(/\s+/g, "_")
          ),
        ],
        companyName: row.agency_name,
        source: "Web /agencias/registrar",
        country: row.country,
      }),
    });
    const cd = await created.json();
    contactId = cd?.contact?.id ?? cd?.id;
  }
  if (!contactId) return { ok: false, error: "no contact id" };

  // 2. Create opportunity in Listing Agencias pipeline
  await ghl("/opportunities/", {
    method: "POST",
    body: JSON.stringify({
      pipelineId: PIPE_LISTING,
      pipelineStageId: STAGE_LISTING_NEW,
      locationId: GHL_LOC,
      name: row.agency_name,
      status: "open",
      contactId,
    }),
  });

  // 3. Note with the application body
  const noteBody = [
    `📋 Nueva solicitud Listing Partner desde la web`,
    `Agencia: ${row.agency_name}`,
    `Manager: ${row.manager_name ?? "—"}`,
    `País: ${row.country ?? "—"}`,
    `WhatsApp: ${row.whatsapp ?? "—"}`,
    `Volumen: ${row.monthly_volume ?? "—"}`,
    `Proyectos interés: ${row.projects_interested?.join(", ") ?? "—"}`,
    "",
    row.notes ?? "",
  ].join("\n");
  await ghl(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: noteBody.slice(0, 5000) }),
  });

  // 4. Store ghl_contact_id in our application row for traceability
  await supa.from("listing_partner_applications").update({ ghl_contact_id: contactId }).eq("id", row.id);

  return { ok: true, ghl_contact_id: contactId };
}

interface PartnerRow {
  id: string;
  agency_name: string;
  email: string | null;
  status: string;
  ghl_contact_id?: string | null;
}

async function handlePartnerStatusActive(row: PartnerRow) {
  if (row.status !== "active") return { ok: true, skipped: "not active" };
  if (!row.email) return { ok: false, error: "no email" };

  // Find/create GHL contact
  const search = await ghl(
    `/contacts/search/duplicate?locationId=${GHL_LOC}&email=${encodeURIComponent(row.email)}`
  );
  const sd = await search.json();
  let contactId = sd?.contact?.id ?? row.ghl_contact_id;

  if (!contactId) {
    const created = await ghl("/contacts/", {
      method: "POST",
      body: JSON.stringify({
        locationId: GHL_LOC,
        firstName: row.agency_name,
        email: row.email,
        tags: ["agencia_listing", "active_partner"],
      }),
    });
    const cd = await created.json();
    contactId = cd?.contact?.id ?? cd?.id;
  }
  if (!contactId) return { ok: false };

  // Move opp to "Contactadas y Listadas"
  const oppSearch = await ghl(
    `/opportunities/search?location_id=${GHL_LOC}&contact_id=${contactId}&pipeline_id=${PIPE_LISTING}`
  );
  const od = await oppSearch.json();
  const existing = od?.opportunities?.[0];
  if (existing) {
    await ghl(`/opportunities/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ pipelineId: PIPE_LISTING, pipelineStageId: STAGE_LISTING_LIVE, status: "open" }),
    });
  } else {
    await ghl("/opportunities/", {
      method: "POST",
      body: JSON.stringify({
        pipelineId: PIPE_LISTING,
        pipelineStageId: STAGE_LISTING_LIVE,
        locationId: GHL_LOC,
        name: row.agency_name,
        status: "open",
        contactId,
      }),
    });
  }
  return { ok: true };
}

interface InvestorRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
}

async function handleInvestorInsert(row: InvestorRow) {
  if (!row.email) return { ok: false, error: "no email" };
  const search = await ghl(
    `/contacts/search/duplicate?locationId=${GHL_LOC}&email=${encodeURIComponent(row.email)}`
  );
  const sd = await search.json();
  let contactId = sd?.contact?.id;
  if (!contactId) {
    const created = await ghl("/contacts/", {
      method: "POST",
      body: JSON.stringify({
        locationId: GHL_LOC,
        firstName: row.full_name?.split(" ")[0] ?? "Investor",
        lastName: row.full_name?.split(" ").slice(1).join(" "),
        email: row.email,
        phone: row.phone,
        tags: ["investor_active", "investor_portal_user"],
        country: row.country,
      }),
    });
    const cd = await created.json();
    contactId = cd?.contact?.id ?? cd?.id;
  }
  if (!contactId) return { ok: false };

  await ghl("/opportunities/", {
    method: "POST",
    body: JSON.stringify({
      pipelineId: PIPE_PRINCIPAL,
      pipelineStageId: STAGE_PRINCIPAL_NEW,
      locationId: GHL_LOC,
      name: row.full_name ?? row.email,
      status: "open",
      contactId,
    }),
  });

  await supa.from("investors").update({ ghl_contact_id: contactId }).eq("id", row.id);
  return { ok: true, ghl_contact_id: contactId };
}

interface UpdateRow {
  id: string;
  property_id: string;
  title: string;
  visibility: "all" | "investors-only" | "listers-only";
}

async function handlePropertyUpdateInsert(row: UpdateRow) {
  // Just emit a tag-based broadcast in GHL: addContacts to a workflow.
  // We use the simpler approach: POST a notification to GHL Workflow webhook
  // by setting a custom tag on every relevant contact. The actual messaging
  // (email/WhatsApp template) is configured inside GHL.
  // For now: log only — real broadcast requires the GHL Workflow ID per project.
  return { ok: true, note: "property_update logged; per-project GHL workflow trigger TBD" };
}

// ─── HTTP entry point ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const wh = body as Webhook;
  let result: unknown = { ok: false, error: "no handler" };

  try {
    if (wh.type === "INSERT" && wh.table === "listing_partner_applications") {
      result = await handleApplicationInsert(wh.record as Application);
    } else if (wh.type === "UPDATE" && wh.table === "listing_partners") {
      result = await handlePartnerStatusActive(wh.record as PartnerRow);
    } else if (wh.type === "INSERT" && wh.table === "investors") {
      result = await handleInvestorInsert(wh.record as InvestorRow);
    } else if (wh.type === "INSERT" && wh.table === "property_updates") {
      result = await handlePropertyUpdateInsert(wh.record as UpdateRow);
    } else if ((body as { source?: string }).source === "ghl") {
      // Inbound webhook from GHL — handle contact tag changes here later
      result = { ok: true, note: "ghl inbound webhook received (no handler yet)" };
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});
