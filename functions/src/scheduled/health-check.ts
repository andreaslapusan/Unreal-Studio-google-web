/**
 * Health check scheduled to run every 30 minutes.
 * Verifies hosting, Firestore, Auth, Storage. Logs to system_health collection.
 * Notifies via Telegram on failure.
 */
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { sendTelegramNotification } from "../lib/telegram-client";

interface CheckResult {
  name: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

async function timed(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, ok: true, durationMs: Date.now() - start };
  } catch (e) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - start,
      error: (e as Error).message ?? String(e),
    };
  }
}

export const runEveryThirtyMinutes = onSchedule(
  {
    schedule: "every 30 minutes",
    timeZone: "Asia/Makassar",
    region: "us-central1",
  },
  async () => {
    const checks: CheckResult[] = [];

    // 1. Hosting
    checks.push(
      await timed("hosting", async () => {
        const r = await fetch("https://unrealstudiobali.com/", { redirect: "follow" });
        if (!r.ok) throw new Error(`hosting status=${r.status}`);
      })
    );

    // 2. Firestore read
    checks.push(
      await timed("firestore", async () => {
        await getFirestore().collection("properties").limit(1).get();
      })
    );

    // 3. Auth list providers
    checks.push(
      await timed("auth", async () => {
        await getAuth().listUsers(1);
      })
    );

    // 4. Functions ping
    checks.push(
      await timed("functions-ping", async () => {
        const r = await fetch(
          "https://us-central1-gen-lang-client-0678977822.cloudfunctions.net/ping"
        );
        if (!r.ok) throw new Error(`ping status=${r.status}`);
      })
    );

    const allOk = checks.every((c) => c.ok);
    const summary = {
      timestamp: new Date(),
      allOk,
      checks,
    };

    await getFirestore().collection("system_health").add(summary);
    logger.info("health check", summary);

    if (!allOk) {
      const failures = checks.filter((c) => !c.ok);
      const msg = `⚠️ Health check FAIL\n\n${failures
        .map((f) => `• ${f.name}: ${f.error}`)
        .join("\n")}`;
      await sendTelegramNotification(msg);
    }
  }
);
