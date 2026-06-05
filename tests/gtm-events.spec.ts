import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";

test("GTM dataLayer events fire on SPA navigation + project view", async ({ page }) => {
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(3000);

  // Navigate to a project
  await page.goto(BASE + "/proyecto/deseo-studio-tipo-a-1bd-melasti-uluwatu", { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const dl = await page.evaluate(() => {
    const out = (window as any).dataLayer || [];
    return out.map((e: any) => {
      const evt = e?.event || e?.[0] || 'unknown';
      const path = e?.page_path;
      const item = e?.ecommerce?.items?.[0];
      return { event: evt, page_path: path, item_id: item?.item_id, item_name: item?.item_name };
    });
  });

  console.log("dataLayer events (filtered):");
  for (const e of dl) {
    if (e.event === 'page_view' || e.event === 'view_item' || e.event === 'gtm.start') {
      console.log("  ", JSON.stringify(e));
    }
  }

  const events = dl.map((e: any) => e.event);
  expect(events).toContain('page_view');
  expect(events).toContain('view_item');
});
