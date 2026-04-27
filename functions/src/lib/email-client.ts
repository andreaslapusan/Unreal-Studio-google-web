/**
 * Email sender. Wraps SendGrid or any SMTP provider.
 * For now uses Firebase Extensions "Trigger Email" (writes to mail collection).
 */
import { getFirestore } from "firebase-admin/firestore";

interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  // Writes to /mail collection. Pair with the official "Trigger Email"
  // Firebase Extension to actually send via SendGrid/SMTP.
  // https://extensions.dev/extensions/firebase/firestore-send-email
  await getFirestore().collection("mail").add({
    to: payload.to,
    from: payload.from ?? "noreply@unrealstudiobali.com",
    message: {
      subject: payload.subject,
      html: payload.body,
    },
    createdAt: new Date(),
  });
}
