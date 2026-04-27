/**
 * Triggered when the team uploads a new construction update via the portal.
 * Notifies all listers and investors associated with that property.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { sendEmail } from "../lib/email-client";
import { sendWhatsAppTemplate } from "../lib/whatsapp-client";

export const onUpdateCreate = onDocumentCreated(
  {
    document: "properties/{propertyId}/updates/{updateId}",
    region: "us-central1",
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { propertyId } = event.params;
    const visibility = data.visibility ?? "all";
    const db = getFirestore();

    const propertySnap = await db.collection("properties").doc(propertyId).get();
    const propertyName = propertySnap.data()?.name ?? "proyecto";

    // Build recipient list based on visibility rules
    const recipients: { email: string; phone?: string; type: "lister" | "investor" }[] = [];

    if (visibility === "all" || visibility === "listers-only") {
      const partners = await db
        .collection("listing_partners")
        .where("projects_assigned", "array-contains", propertyId)
        .where("status", "==", "active")
        .get();
      for (const p of partners.docs) {
        const pd = p.data();
        if (pd.email) {
          recipients.push({ email: pd.email, phone: pd.phone, type: "lister" });
        }
      }
    }

    if (visibility === "all" || visibility === "investors-only") {
      // Investors associated via investor_units → property_units → property
      const unitsSnap = await db
        .collectionGroup("units")
        .where("property_id", "==", propertyId)
        .get();
      const unitIds = unitsSnap.docs.map((u) => u.id);

      if (unitIds.length) {
        // Firestore "in" max 30 — chunk if needed
        for (let i = 0; i < unitIds.length; i += 30) {
          const chunk = unitIds.slice(i, i + 30);
          const ius = await db.collection("investor_units").where("unit_id", "in", chunk).get();
          for (const iu of ius.docs) {
            const investor = await db.collection("investors").doc(iu.data().investor_id).get();
            const id = investor.data();
            if (id?.email) {
              recipients.push({ email: id.email, phone: id.phone, type: "investor" });
            }
          }
        }
      }
    }

    logger.info(`notifying ${recipients.length} recipients for ${propertyName} update`);

    // Send notifications (do not block on failures)
    await Promise.allSettled(
      recipients.map(async (r) => {
        try {
          await sendEmail({
            to: r.email,
            subject: `Nuevo update de obra · ${propertyName}`,
            body: `<p>Hola,</p><p>Se acaba de subir un nuevo update de obra para <strong>${propertyName}</strong>.</p><p><strong>${data.title}</strong></p><p>${data.summary ?? ""}</p><p><a href="https://unrealstudiobali.com/${r.type === "lister" ? "agencias" : "inversores"}/dashboard">Ver en el portal</a></p>`,
          });
          if (r.phone) {
            await sendWhatsAppTemplate({
              to: r.phone,
              templateName: "update_notification",
              variables: [propertyName, data.title],
            });
          }
        } catch (e) {
          logger.warn(`notify ${r.email} failed`, e);
        }
      })
    );
  }
);
