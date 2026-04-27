/**
 * GHL webhook receiver.
 *
 * GHL Settings → Integrations → Webhooks → URL of this function.
 * Events expected (configurable per webhook in GHL):
 *  - ContactCreate, ContactUpdate, ContactTagUpdate
 *  - OpportunityCreate, OpportunityStageUpdate
 *
 * On each event we sync the relevant Firestore collection so the portal
 * always reflects current GHL state.
 */
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

interface GhlPayload {
  type?: string;
  contact_id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  pipeline_id?: string;
  pipeline_stage_id?: string;
  [k: string]: unknown;
}

export const ghlWebhook = onRequest(
  { cors: false, region: "us-central1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const payload = req.body as GhlPayload;
    logger.info("ghl webhook received", { type: payload.type, contact_id: payload.contact_id });

    const db = getFirestore();

    try {
      // Persist raw event for debugging / replay
      await db.collection("ghl_events").add({
        receivedAt: new Date(),
        type: payload.type ?? "unknown",
        payload,
      });

      // Sync contact data based on tags
      if (payload.contact_id && payload.email) {
        const tags = payload.tags ?? [];
        const isLister = tags.includes("agencia_listing");
        const isInvestor = tags.some((t) =>
          ["interesado_inversion", "investor_active", "comprador"].includes(t)
        );

        if (isLister) {
          await db.collection("listing_partners").doc(payload.contact_id).set(
            {
              ghl_contact_id: payload.contact_id,
              email: payload.email,
              phone: payload.phone ?? null,
              agency_name: `${payload.first_name ?? ""} ${payload.last_name ?? ""}`.trim(),
              tags,
              last_synced_at: new Date(),
            },
            { merge: true }
          );
        }

        if (isInvestor) {
          await db.collection("investors").doc(payload.contact_id).set(
            {
              ghl_contact_id: payload.contact_id,
              email: payload.email,
              phone: payload.phone ?? null,
              full_name: `${payload.first_name ?? ""} ${payload.last_name ?? ""}`.trim(),
              tags,
              last_synced_at: new Date(),
            },
            { merge: true }
          );
        }
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error("ghl webhook failed", err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  }
);
