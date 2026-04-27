/**
 * WhatsApp template sender via Meta WhatsApp Cloud API.
 * Requires META_WHATSAPP_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID env vars.
 */
import { logger } from "firebase-functions";

interface WhatsAppPayload {
  to: string;
  templateName: string;
  variables: string[];
  languageCode?: string;
}

export async function sendWhatsAppTemplate(payload: WhatsAppPayload): Promise<void> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    logger.warn("META_WHATSAPP_TOKEN or PHONE_NUMBER_ID not set — skipping send");
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: payload.to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: payload.templateName,
      language: { code: payload.languageCode ?? "es" },
      components: payload.variables.length
        ? [
            {
              type: "body",
              parameters: payload.variables.map((v) => ({ type: "text", text: v })),
            },
          ]
        : [],
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const text = await r.text();
    logger.error(`whatsapp template send failed status=${r.status}`, text);
    throw new Error(`whatsapp send failed: ${r.status}`);
  }
}
