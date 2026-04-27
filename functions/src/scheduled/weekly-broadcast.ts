/**
 * Weekly broadcast — every Wednesday 09:00 WITA.
 * Picks the rotational property of the week and notifies relevant audiences.
 * Implementation will be filled in Phase 6.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

export const weeklyBroadcast = onSchedule(
  {
    schedule: "0 9 * * 3",
    timeZone: "Asia/Makassar",
    region: "us-central1",
  },
  async () => {
    logger.info("weekly broadcast triggered (no-op until phase 6)");
  }
);
