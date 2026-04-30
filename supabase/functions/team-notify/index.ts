/**
 * team-notify — fired by the time_off_requests AFTER INSERT trigger.
 *
 * Sends an email to Andreas with the request details. Uses GHL's outbound
 * conversations API since Andreas's contact + the API token already live
 * there (no extra SMTP/Resend setup needed).
 *
 * Failure-tolerant: a failed email never blocks the request. The trigger
 * already swallows exceptions, and this function returns 200 even if GHL
 * rejects — the request row is the source of truth, Andreas can also
 * see everything in the Equipo tab.
 */
// @ts-nocheck — Deno runtime types not in the Vite tsconfig
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const GHL_API_TOKEN = Deno.env.get("GHL_API_TOKEN") ?? "";
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID") ?? "Hg9YAlmBewj8oe5HaEjl";
const ANDREAS_EMAIL = Deno.env.get("ANDREAS_EMAIL") ?? "andreas@unrealstudiobali.com";

interface TimeOffEvent {
  event: string;
  member_name: string;
  member_email?: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: TimeOffEvent;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (payload.event !== "time_off_request") {
    return new Response("Ignored", { status: 200 });
  }

  const subject = `[Equipo] ${payload.member_name} pide vacaciones (${payload.days} días)`;
  const body = [
    `Solicitud de vacaciones (auto-aprobada):`,
    ``,
    `Nombre: ${payload.member_name}`,
    `Email: ${payload.member_email ?? "(sin email)"}`,
    `Desde: ${payload.start_date}`,
    `Hasta: ${payload.end_date}`,
    `Días: ${payload.days}`,
    `Motivo: ${payload.reason}`,
    ``,
    `Ver detalle en /admin/portal → Equipo`,
  ].join("\n");

  if (!GHL_API_TOKEN) {
    console.warn("[team-notify] GHL_API_TOKEN not set, skipping email");
    return new Response(JSON.stringify({ status: "skipped" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up Andreas's contactId in GHL
  let contactId: string | null = null;
  try {
    const lookup = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOCATION_ID}&query=${encodeURIComponent(ANDREAS_EMAIL)}&limit=1`,
      { headers: { Authorization: `Bearer ${GHL_API_TOKEN}`, Version: "2021-07-28" } }
    );
    const data = await lookup.json();
    contactId = data?.contacts?.[0]?.id ?? null;
  } catch (err) {
    console.warn("[team-notify] contact lookup failed:", err);
  }

  if (!contactId) {
    console.warn("[team-notify] Andreas not found in GHL, skipping");
    return new Response(JSON.stringify({ status: "skipped", reason: "no_contact" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Send email via GHL
  try {
    const send = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GHL_API_TOKEN}`,
        Version: "2021-04-15",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "Email",
        contactId,
        subject,
        message: body,
        emailFrom: "Unreal Studio <noreply@unrealstudiobali.com>",
      }),
    });
    const result = await send.json();
    return new Response(JSON.stringify({ status: "sent", result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[team-notify] send failed:", err);
    return new Response(JSON.stringify({ status: "error", error: String(err) }), {
      headers: { "Content-Type": "application/json" },
      status: 200, // never block the request flow
    });
  }
});
