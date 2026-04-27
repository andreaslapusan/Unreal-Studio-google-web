/**
 * Health endpoint — used by external monitors and the 30-min cron to
 * verify the function service is alive.
 */
import { onRequest } from "firebase-functions/v2/https";

export const ping = onRequest({ cors: true, region: "us-central1" }, (req, res) => {
  res.status(200).json({
    ok: true,
    service: "unreal-studio-functions",
    timestamp: new Date().toISOString(),
  });
});
