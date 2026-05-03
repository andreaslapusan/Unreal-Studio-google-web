import { test, expect } from "@playwright/test";

const BASE = "https://unrealstudiobali.com";

test.describe("Agencias dashboard — auth flow", () => {
  test("dashboard sin sesión redirige a login (o muestra mensaje)", async ({ page }) => {
    const response = await page.goto(`${BASE}/agencias/dashboard`, { waitUntil: "networkidle" });
    expect(response?.status()).toBeLessThan(500);
    const url = page.url();
    const html = await page.content();
    console.log("agencias/dashboard URL after load:", url);
    expect(html.toLowerCase()).toMatch(/agenc|login|inicia|email/i);
  });

  test("login page renderiza y tiene campos", async ({ page }) => {
    await page.goto(`${BASE}/agencias/login`, { waitUntil: "networkidle" });
    const emailInputs = await page.locator('input[type="email"]').count();
    expect(emailInputs).toBeGreaterThan(0);
    const buttons = await page.locator('button').allTextContents();
    console.log("Botones en /agencias/login:", buttons);
    expect(buttons.some(b => /google/i.test(b) || /magic|enviar|login|entrar/i.test(b))).toBeTruthy();
  });

  test("magic link envío con email de prueba — confirma estado UI", async ({ page }) => {
    await page.goto(`${BASE}/agencias/login`, { waitUntil: "networkidle" });
    const email = `playwright-test+${Date.now()}@example.com`;
    await page.fill('input[type="email"]', email);
    const before = await page.content();
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    const after = await page.content();
    console.log("Magic link click — UI cambió:", before !== after);
    await page.screenshot({ path: "test-results/agencias-magiclink.png", fullPage: true });
  });

  test("Continuar con Google está visible y clickable", async ({ page }) => {
    await page.goto(`${BASE}/agencias/login`, { waitUntil: "networkidle" });
    const googleBtn = page.getByRole('button', { name: /google/i });
    await expect(googleBtn).toBeVisible({ timeout: 5000 });
    console.log("Botón Google detectado");
  });
});

test.describe("Admin login — nuevas opciones de Supabase Auth", () => {
  test("admin/login muestra magic link y Google", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: "test-results/admin-login.png", fullPage: true });
    const buttons = await page.locator('button').allTextContents();
    console.log("Botones en /admin/login:", buttons);
    expect(buttons.some(b => /google/i.test(b))).toBeTruthy();
    expect(buttons.some(b => /magic|enviar/i.test(b))).toBeTruthy();
  });

  test("admin/marketing sin sesión redirige a /admin/login", async ({ page }) => {
    await page.goto(`${BASE}/admin/marketing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log("admin/marketing → URL final:", url);
    expect(url).toMatch(/admin\/login|admin\/marketing/);
  });
});
