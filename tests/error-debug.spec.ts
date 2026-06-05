import { test } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Capture unexpected error on linomolamucho login flow", async ({ page }) => {
  test.skip(!MAGIC, "MAGIC required");
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text().slice(0,300)}`); });

  await page.goto(MAGIC);
  await page.waitForTimeout(4000);
  await page.goto(BASE + "/admin/marketing", { waitUntil: "load" });
  await page.waitForTimeout(8000);

  console.log("URL:", page.url());
  const text = await page.locator('body').innerText();
  console.log("Body:", text.slice(0, 500).replace(/\n+/g, ' | '));

  console.log("\nErrors captured:");
  for (const e of errors.slice(-10)) console.log("  ", e);
  await page.screenshot({ path: 'test-results/error-debug.png', fullPage: true });
});
