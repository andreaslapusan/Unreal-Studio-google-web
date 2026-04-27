/**
 * Send notification to Marcelino via Telegram Bot API.
 * Requires TELEGRAM_BOT_TOKEN env var. Chat is fixed for now.
 */
import { logger } from "firebase-functions";

const MARCELINO_CHAT_ID = "263475761";

export async function sendTelegramNotification(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — skipping telegram notify");
    return;
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: MARCELINO_CHAT_ID, text }),
  });
  if (!r.ok) {
    logger.error(`telegram notify failed status=${r.status}`);
  }
}
