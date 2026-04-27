/**
 * Triggered when a new Firebase Auth user is created (signup).
 *
 * Looks up email in `listing_partners` or `investors` collections (synced
 * from GHL via the ghl-webhook function). If found, links the auth uid to
 * the existing record and sets the appropriate custom claim role.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Note: Firebase Functions v2 does not expose auth onCreate directly.
// We use a trick: write to a "pending_signups" collection from the client
// after signup, and trigger off that. Alternative: legacy v1 functions.
// For now we use a Firestore-driven approach.

export const onAuthUserCreate = onDocumentCreated(
  { document: "pending_signups/{uid}", region: "us-central1" },
  async (event) => {
    const data = event.data?.data();
    if (!data?.email || !event.params.uid) {
      logger.warn("missing email or uid in pending_signups");
      return;
    }

    const { email } = data;
    const uid = event.params.uid;
    const db = getFirestore();

    // Check listing_partners
    const partnerSnap = await db
      .collection("listing_partners")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();

    if (!partnerSnap.empty) {
      const partnerDoc = partnerSnap.docs[0];
      await partnerDoc.ref.update({ user_id: uid, last_login_at: new Date() });
      await getAuth().setCustomUserClaims(uid, {
        role: "lister",
        partnerId: partnerDoc.id,
      });
      logger.info(`linked ${email} to lister ${partnerDoc.id}`);
      return;
    }

    // Check investors
    const investorSnap = await db
      .collection("investors")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();

    if (!investorSnap.empty) {
      const investorDoc = investorSnap.docs[0];
      await investorDoc.ref.update({ user_id: uid, last_login_at: new Date() });
      await getAuth().setCustomUserClaims(uid, {
        role: "investor",
        investorId: investorDoc.id,
      });
      logger.info(`linked ${email} to investor ${investorDoc.id}`);
      return;
    }

    logger.info(`no role match for ${email} — no claims set`);
  }
);
