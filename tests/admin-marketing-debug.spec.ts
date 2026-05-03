import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Admin marketing — debug auth context load", async ({ page, context }) => {
  test.skip(!MAGIC, "PW_MAGIC_LINK requerida");

  // Capturar logs/errores DESDE EL PRINCIPIO
  const logs: string[] = [];
  page.on('console', m => { logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => { logs.push(`[ERROR] ${e.message}`); });
  page.on('requestfailed', r => { logs.push(`[REQFAIL] ${r.url()} ${r.failure()?.errorText}`); });

  // Magic link
  await page.goto(MAGIC, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // Navegar a marketing
  await page.goto(`${BASE}/admin/marketing`, { waitUntil: "load" });

  // Esperar 15s
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const text = await page.locator('body').innerText().catch(() => '');
    if (!text.includes('Cargando') && text.length > 50) {
      console.log(`Resolved at ${i+1}s. Body text:`, text.slice(0, 500));
      break;
    }
  }
  const finalText = await page.locator('body').innerText();
  console.log("Final body text (200 chars):", finalText.slice(0, 200));
  await page.screenshot({ path: "test-results/admin-marketing-debug.png", fullPage: true });

  console.log("\n=== Console logs ===");
  for (const l of logs.slice(-40)) console.log(l);
});
