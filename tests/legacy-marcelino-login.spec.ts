import { test } from "@playwright/test";

test("Login legacy as Marcelino → should reach /admin", async ({ page }) => {
  page.on('console', m => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('[ERROR]', e.message));
  page.on('response', r => {
    if (r.url().includes('verify_admin_login') || r.url().includes('rpc/verify')) {
      console.log('[RPC]', r.status(), r.url());
    }
  });

  await page.goto("https://unrealstudiobali.com/admin/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("URL al cargar:", page.url());

  // Fill form
  const userInput = page.locator('input[placeholder="USUARIO"]');
  const pwInput = page.locator('input[placeholder="••••••••"]');
  await userInput.fill('Marcelino');
  await pwInput.fill('Cemagi2026!');
  await page.locator('button[type="submit"]').first().click();

  // Wait for navigation or error
  await page.waitForTimeout(7000);
  console.log("URL tras submit:", page.url());
  await page.screenshot({ path: 'test-results/marcelino-legacy.png', fullPage: true });
  const text = await page.locator('body').innerText();
  console.log("Body después de login:", text.slice(0, 300).replace(/\n+/g, ' | '));
});
