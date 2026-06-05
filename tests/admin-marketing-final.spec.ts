import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";
const MAGIC = process.env.PW_MAGIC_LINK || "";

test("Final: dashboard fully loaded with data", async ({ page }) => {
  test.skip(!MAGIC, "MAGIC required");

  await page.goto(MAGIC);
  await page.waitForTimeout(4000);
  await page.goto(BASE + "/admin/marketing", { waitUntil: "networkidle" });

  // Wait until we see actual data (not just headers)
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(1000);
    const html = await page.content();
    // The data is rendered in tables — look for stage names from real data
    if (html.includes('FUNNEL PRINCIPAL') && html.includes('Listing Agencias')) {
      console.log(`Data loaded at ${i+1}s`);
      break;
    }
  }

  await page.screenshot({ path: "test-results/admin-marketing-final.png", fullPage: true });
  const html = await page.content();

  console.log("Has tabs:", html.includes('FUNNEL PRINCIPAL'), html.includes('Listing Agencias'));
  console.log("Has total leads card:", html.includes('Total leads'));
  console.log("Has embudo:", html.includes('Embudo'));
  console.log("Has leads section:", html.includes('Leads recientes'));
  console.log("Has conversations:", html.includes('Conversaciones recientes'));

  // Count rows in the embudo table
  const rows = await page.locator('table').first().locator('tbody tr').count();
  console.log("Filas en tabla embudo:", rows);
});
