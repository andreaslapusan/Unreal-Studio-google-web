import { test } from "@playwright/test";
const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Inspect React state on /admin/marketing", async ({ page }) => {
  test.skip(!MAGIC, "MAGIC required");
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`ERROR ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type().toUpperCase()} ${m.text().slice(0, 200)}`); });

  await page.goto(MAGIC);
  await page.waitForTimeout(3500);
  await page.goto(BASE + "/admin/marketing");
  await page.waitForTimeout(15000);

  console.log("URL:", page.url());
  console.log("Body text:", (await page.locator('body').innerText()).slice(0, 200));

  // Read window state via global
  const state = await page.evaluate(() => {
    const ls = Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.includes('sb-')));
    return {
      readyState: document.readyState,
      scripts: document.scripts.length,
      lsKeys: Object.keys(ls),
      hasReact: !!(window as any).React,
      title: document.title,
      bodyClasses: document.body.className,
    };
  });
  console.log("State:", JSON.stringify(state, null, 2));

  console.log("\nErrors/Warnings captured:");
  for (const e of errors.slice(-20)) console.log(" ", e);
});
